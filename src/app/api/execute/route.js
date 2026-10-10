import { exec } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS } from '../../../services/tokens';

const execPromise = util.promisify(exec);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

export async function POST(req) {
  try {
    const { allocations, depositAmount = 25 } = await req.json();

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ success: false, error: 'Valid allocations array is required.' }, { status: 400 });
    }

    const results = [];

    for (const alloc of allocations) {
      const targetToken = BSC_RWA_TOKENS[alloc.ticker];
      if (!targetToken) continue;

      const legAmountUsd = (depositAmount * alloc.weight) / 100;
      if (legAmountUsd < 5) {
        results.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          allocatedUsd: legAmountUsd,
          status: 'SKIPPED',
          message: `Order size $${legAmountUsd.toFixed(2)} is below $5.00 minimum order floor.`
        });
        continue;
      }

      const qty = legAmountUsd.toFixed(2);
      const cmd = `baw market-order swap --binanceChainId 56 --fromTokenQty ${qty} --fromToken ${USDT_ADDRESS} --toToken ${targetToken.contractAddress} --json`;

      try {
        const { stdout } = await execPromise(cmd);
        const parsed = JSON.parse(stdout);

        if (parsed.success && parsed.data?.orderId) {
          const orderId = parsed.data.orderId;
          
          // Poll market-order list to resolve terminal status and txHash
          let finalOrder = null;
          for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 1200));
            try {
              const listRes = await execPromise('baw market-order list --json');
              const listParsed = JSON.parse(listRes.stdout);
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

          results.push({
            ticker: alloc.ticker,
            name: targetToken.name,
            allocatedUsd: legAmountUsd,
            orderId,
            status: isFinished ? 'EXECUTED' : finalOrder?.status || 'SUBMITTED',
            txHash,
            actualTokens: finalOrder?.toTokenActualQty || null,
            bscScanUrl: txHash ? `https://bscscan.com/tx/${txHash}` : null
          });
        } else {
          results.push({
            ticker: alloc.ticker,
            name: targetToken.name,
            allocatedUsd: legAmountUsd,
            status: 'FAILED',
            error: parsed.error || 'Failed to submit order'
          });
        }
      } catch (err) {
        let errJson = null;
        try {
          if (err.stdout) {
            errJson = JSON.parse(err.stdout);
          }
        } catch (_) {}

        const isInsufficient = JSON.stringify(errJson || err.message).includes('insufficient') ||
                               JSON.stringify(errJson || err.message).includes('30003001');

        results.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          allocatedUsd: legAmountUsd,
          status: 'FAILED',
          isInsufficient,
          error: errJson?.error?.message || err.message
        });
      }
    }

    const allSucceeded = results.length > 0 && results.every(r => r.status === 'EXECUTED');
    const anyExecuted = results.some(r => r.status === 'EXECUTED');
    const isInsufficient = results.some(r => r.isInsufficient);
    const skippedCount = results.filter(r => r.status === 'SKIPPED').length;

    let summary = '';
    if (allSucceeded) {
      summary = `All ${results.length} basket legs successfully executed on-chain on BNB Smart Chain!`;
    } else if (anyExecuted) {
      summary = `Partially executed: ${results.filter(r => r.status === 'EXECUTED').length} legs executed on BSC.`;
    } else if (isInsufficient) {
      summary = `Execution halted: Insufficient USDT balance in wallet. Current USDT balance was already allocated or spent in earlier transactions.`;
    } else if (skippedCount === results.length) {
      summary = `All legs skipped: Order size per leg was under the $5.00 DEX minimum floor. Increase order size to $20+ for multi-leg execution.`;
    } else {
      summary = `Execution could not complete. Review leg details below.`;
    }

    return Response.json({
      success: allSucceeded || anyExecuted,
      allSucceeded,
      results,
      summary
    });
  } catch (error) {
    console.error('Execution API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
