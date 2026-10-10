import { exec } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS } from '../../../../services/tokens';

const execPromise = util.promisify(exec);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

export async function POST(req) {
  try {
    let { fromToken, fromTokenQty, fromSymbol } = await req.json().catch(() => ({}));

    // If specific token not provided, find any held stock/non-USDT asset
    if (!fromToken || !fromTokenQty) {
      const { stdout: balOut } = await execPromise('baw wallet balance --binanceChainId 56 --json');
      const balParsed = JSON.parse(balOut);
      const heldStock = balParsed.data?.find(t => 
        t.address.toLowerCase() !== USDT_ADDRESS.toLowerCase() &&
        t.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' &&
        parseFloat(t.balance || 0) > 0.000001
      );

      if (!heldStock) {
        return Response.json({
          success: false,
          error: 'No non-USDT stock or token assets found in wallet to liquidate.'
        }, { status: 400 });
      }

      fromToken = heldStock.address;
      fromTokenQty = heldStock.balance;
      fromSymbol = heldStock.symbol;
    }

    const cmd = `baw market-order swap --fromTokenQty ${fromTokenQty} --fromToken ${fromToken} --toToken ${USDT_ADDRESS} --binanceChainId 56 --json`;
    const { stdout: swapOut } = await execPromise(cmd);
    const swapParsed = JSON.parse(swapOut);

    if (!swapParsed.success || !swapParsed.data?.orderId) {
      return Response.json({
        success: false,
        error: swapParsed.error?.message || 'Failed to submit liquidation swap order.'
      }, { status: 500 });
    }

    const orderId = swapParsed.data.orderId;

    // Poll for FINISHED status and txHash
    let finalOrder = null;
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const { stdout: listOut } = await execPromise('baw market-order list --json');
        const listParsed = JSON.parse(listOut);
        const found = listParsed.data?.list?.find(o => o.orderId === orderId);
        if (found) {
          finalOrder = found;
          if (found.status === 'FINISHED' || found.status === 'FAILED') {
            break;
          }
        }
      } catch (_) {}
    }

    const isFinished = finalOrder?.status === 'FINISHED';
    const txHash = finalOrder?.txHash || null;

    return Response.json({
      success: isFinished || !!orderId,
      status: finalOrder?.status || 'SUBMITTED',
      orderId,
      txHash,
      bscScanUrl: txHash ? `https://bscscan.com/tx/${txHash}` : null,
      fromSymbol: fromSymbol || finalOrder?.fromTokenName || 'Stock',
      fromQty: fromTokenQty,
      receivedUsdt: finalOrder?.toTokenActualQty || null
    });
  } catch (error) {
    console.error('Liquidation API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
