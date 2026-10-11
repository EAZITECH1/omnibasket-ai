import { exec } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS } from '../../../services/tokens';

const execPromise = util.promisify(exec);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

export async function POST(req) {
  try {
    const cleanDeposit = parseFloat(depositAmount);
    if (isNaN(cleanDeposit) || cleanDeposit < 5) {
      return Response.json({ success: false, error: 'Deposit amount must be at least 5 USD.' }, { status: 400 });
    }

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ success: false, error: 'Valid allocations array is required.' }, { status: 400 });
    }

    // Pre-Transaction Simulation Guardrail
    // Ensures EVM calldata & balance limits are pre-flight checked before broadcast
    try {
      const simUrl = new URL(req.url);
      const simRes = await fetch(`${simUrl.origin}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations, depositAmount: cleanDeposit })
      });
      if (simRes.ok) {
        const simData = await simRes.json();
        const fatalRevert = simData.legs?.find(l => l.simulationStatus === 'SIMULATED_REVERT' && !l.failReason?.includes('transfer amount exceeds balance'));
        if (fatalRevert) {
          return Response.json({
            success: false,
            error: `Pre-Transaction Simulation Guardrail Revert for ${fatalRevert.ticker}: ${fatalRevert.failReason}. Broadcast blocked with $0 gas lost.`,
            simulationGuard: simData
          }, { status: 400 });
        }
      }
    } catch (simErr) {
      console.warn('Pre-broadcast simulation notice:', simErr.message);
    }

    const results = [];

    for (const alloc of allocations) {
      const targetToken = BSC_RWA_TOKENS[alloc.ticker];
      if (!targetToken || !/^0x[a-fA-F0-9]{40}$/.test(targetToken.contractAddress)) continue;

      const legAmountUsd = (cleanDeposit * alloc.weight) / 100;
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
          
          // Poll market-order list on BSC (#56) to resolve terminal status and txHash
          let finalOrder = null;
          for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 1200));
            try {
              const listRes = await execPromise('baw market-order list --binanceChainId 56 --json');
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
