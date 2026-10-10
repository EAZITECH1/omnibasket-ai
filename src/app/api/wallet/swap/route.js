export const dynamic = 'force-dynamic';

import { exec } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS } from '../../../../services/tokens';
import { ensureBawSession } from '../../../../services/bawSession';

const execPromise = util.promisify(exec);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

async function pollOrder(orderId, maxAttempts = 12, intervalMs = 1200) {
  let finalOrder = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const { stdout } = await execPromise('baw market-order list --binanceChainId 56 --json');
      const parsed = JSON.parse(stdout);
      const found = parsed.data?.list?.find(o => o.orderId === orderId);
      if (found) {
        finalOrder = found;
        if (found.status === 'FINISHED' || found.status === 'FAILED') {
          break;
        }
      }
    } catch (_) {}
  }
  return finalOrder;
}

export async function POST(req) {
  try {
    ensureBawSession();
    const body = await req.json().catch(() => ({}));
    let { fromTicker, toTicker, fromTokenQty } = body;

    // Normalizing tickers
    fromTicker = (fromTicker || '').toUpperCase();
    toTicker = (toTicker || '').toUpperCase();

    // Auto-resolve tokens from BSC_RWA_TOKENS
    const fromToken = BSC_RWA_TOKENS[fromTicker] || Object.values(BSC_RWA_TOKENS).find(t => t.symbol?.toUpperCase() === fromTicker || t.contractAddress?.toLowerCase() === fromTicker?.toLowerCase());
    const toToken = BSC_RWA_TOKENS[toTicker] || Object.values(BSC_RWA_TOKENS).find(t => t.symbol?.toUpperCase() === toTicker || t.contractAddress?.toLowerCase() === toTicker?.toLowerCase());

    if (!fromToken || !toToken) {
      return Response.json({
        success: false,
        error: `Could not resolve tokens. Supported: ${Object.keys(BSC_RWA_TOKENS).join(', ')}`
      }, { status: 400 });
    }

    if (fromToken.contractAddress.toLowerCase() === toToken.contractAddress.toLowerCase()) {
      return Response.json({ success: false, error: 'Source and target tokens must be different.' }, { status: 400 });
    }

    // Auto-detect balance if fromTokenQty is not provided or 'ALL'
    if (!fromTokenQty || fromTokenQty === 'ALL') {
      const { stdout: balOut } = await execPromise('baw wallet balance --binanceChainId 56 --json');
      const balParsed = JSON.parse(balOut);
      const held = balParsed.data?.find(t => t.address.toLowerCase() === fromToken.contractAddress.toLowerCase());
      if (!held || parseFloat(held.balance || 0) <= 0) {
        return Response.json({
          success: false,
          error: `Insufficient balance for ${fromToken.ticker || fromToken.symbol}. Current balance is 0.`
        }, { status: 400 });
      }
      fromTokenQty = held.balance;
    }

    const isExitToUsdt = toToken.contractAddress.toLowerCase() === USDT_ADDRESS.toLowerCase();
    const isBuyFromUsdt = fromToken.contractAddress.toLowerCase() === USDT_ADDRESS.toLowerCase();

    // CASE 1: Direct Swap (One side is USDT)
    if (isExitToUsdt || isBuyFromUsdt) {
      const cmd = `baw market-order swap --fromTokenQty ${fromTokenQty} --fromToken ${fromToken.contractAddress} --toToken ${toToken.contractAddress} --binanceChainId 56 --json`;
      const { stdout: swapOut } = await execPromise(cmd);
      const swapParsed = JSON.parse(swapOut);

      if (!swapParsed.success || !swapParsed.data?.orderId) {
        return Response.json({
          success: false,
          error: swapParsed.error?.message || 'Failed to submit market order on BSC.'
        }, { status: 500 });
      }

      const orderId = swapParsed.data.orderId;
      const finalOrder = await pollOrder(orderId);
      const isFinished = finalOrder?.status === 'FINISHED';
      const txHash = finalOrder?.txHash || null;

      return Response.json({
        success: isFinished || !!orderId,
        mode: isExitToUsdt ? 'REVERSE_EXIT_TO_USDT' : 'BUY_FROM_USDT',
        orderId,
        status: finalOrder?.status || 'SUBMITTED',
        txHash,
        bscScanUrl: txHash ? `https://bscscan.com/tx/${txHash}` : null,
        fromTicker: fromToken.ticker,
        fromQty: fromTokenQty,
        toTicker: toToken.ticker,
        toQty: finalOrder?.toTokenActualQty || null,
        summary: isFinished 
          ? `Successfully swapped ${fromTokenQty} ${fromToken.ticker} → ${finalOrder?.toTokenActualQty || ''} ${toToken.ticker} on BSC!`
          : `Order ${orderId} submitted to BSC network.`
      });
    }

    // CASE 2: Stock-to-Stock Rotation (Requires 2-hop via USDT since Ondo pairs require stablecoin)
    // Leg 1: fromToken -> USDT
    const leg1Cmd = `baw market-order swap --fromTokenQty ${fromTokenQty} --fromToken ${fromToken.contractAddress} --toToken ${USDT_ADDRESS} --binanceChainId 56 --json`;
    const { stdout: leg1Out } = await execPromise(leg1Cmd);
    const leg1Parsed = JSON.parse(leg1Out);

    if (!leg1Parsed.success || !leg1Parsed.data?.orderId) {
      return Response.json({
        success: false,
        error: `Leg 1 (${fromToken.ticker} → USDT) failed: ${leg1Parsed.error?.message || 'Order failed'}`
      }, { status: 500 });
    }

    const leg1Order = await pollOrder(leg1Parsed.data.orderId, 12);
    if (leg1Order?.status !== 'FINISHED' || !leg1Order?.toTokenActualQty) {
      return Response.json({
        success: false,
        error: `Leg 1 (${fromToken.ticker} → USDT) did not finish cleanly. Status: ${leg1Order?.status || 'PENDING'}`,
        leg1OrderId: leg1Parsed.data.orderId,
        leg1TxHash: leg1Order?.txHash
      }, { status: 500 });
    }

    const intermediateUsdt = leg1Order.toTokenActualQty;

    // Leg 2: USDT -> toToken
    const leg2Cmd = `baw market-order swap --fromTokenQty ${intermediateUsdt} --fromToken ${USDT_ADDRESS} --toToken ${toToken.contractAddress} --binanceChainId 56 --json`;
    const { stdout: leg2Out } = await execPromise(leg2Cmd);
    const leg2Parsed = JSON.parse(leg2Out);

    if (!leg2Parsed.success || !leg2Parsed.data?.orderId) {
      return Response.json({
        success: false,
        partial: true,
        error: `Leg 2 (USDT → ${toToken.ticker}) failed: ${leg2Parsed.error?.message || 'Order failed'}. Leg 1 succeeded ($${intermediateUsdt} USDT currently in wallet).`,
        intermediateUsdt,
        leg1TxHash: leg1Order.txHash
      }, { status: 500 });
    }

    const leg2Order = await pollOrder(leg2Parsed.data.orderId, 12);
    const isFinished = leg2Order?.status === 'FINISHED';

    return Response.json({
      success: isFinished || !!leg2Order,
      mode: 'STOCK_TO_STOCK_ROTATION',
      status: isFinished ? 'FINISHED' : leg2Order?.status || 'SUBMITTED',
      fromTicker: fromToken.ticker,
      fromQty: fromTokenQty,
      toTicker: toToken.ticker,
      toQty: leg2Order?.toTokenActualQty || null,
      intermediateUsdt,
      leg1: {
        orderId: leg1Parsed.data.orderId,
        txHash: leg1Order.txHash,
        bscScanUrl: `https://bscscan.com/tx/${leg1Order.txHash}`
      },
      leg2: {
        orderId: leg2Parsed.data.orderId,
        txHash: leg2Order?.txHash || null,
        bscScanUrl: leg2Order?.txHash ? `https://bscscan.com/tx/${leg2Order.txHash}` : null
      },
      summary: `Rotated ${fromTokenQty} ${fromToken.ticker} → ${leg2Order?.toTokenActualQty || ''} ${toToken.ticker} via BSC USDT liquidity pool!`
    });

  } catch (error) {
    console.error('Swap router error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
