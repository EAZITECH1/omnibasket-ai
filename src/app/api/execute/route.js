import { execFile } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS } from '../../../services/tokens';

const execFilePromise = util.promisify(execFile);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { allocations, depositAmount = 25, allowEstimated = false } = body;

    const cleanDeposit = parseFloat(depositAmount);
    if (isNaN(cleanDeposit) || cleanDeposit < 5) {
      return Response.json({ success: false, error: 'Deposit amount must be at least 5 USD.' }, { status: 400 });
    }

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ success: false, error: 'Valid allocations array is required.' }, { status: 400 });
    }

    // Pre-Transaction Simulation Guardrail: Fail-Closed Policy
    // Strictly blocks order broadcast if simulation fails, reverts, or is incomplete
    try {
      const simUrl = new URL(req.url);
      const simRes = await fetch(`${simUrl.origin}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations, depositAmount: cleanDeposit })
      });

      if (!simRes.ok) {
        return Response.json({
          success: false,
          error: `Pre-Transaction Simulation Guardrail unavailable (HTTP ${simRes.status}). Broadcast blocked with $0 gas lost.`
        }, { status: 400 });
      }

      const simData = await simRes.json();
      
      // Block broadcast on any simulated EVM revert (including insufficient balance)
      const fatalRevert = simData.legs?.find(l => l.simulationStatus === 'SIMULATED_REVERT');
      if (fatalRevert) {
        return Response.json({
          success: false,
          error: `Pre-Transaction Simulation Guardrail Revert for ${fatalRevert.ticker}: ${fatalRevert.failReason || 'EVM execution reverted'}. Broadcast blocked with $0 gas lost.`,
          simulationGuard: simData
        }, { status: 400 });
      }

      // If an allocation is purely estimated and allowEstimated is false, block broadcast
      if (!allowEstimated) {
        const estimatedLeg = simData.legs?.find(l => l.simulationStatus === 'ESTIMATED');
        if (estimatedLeg) {
          return Response.json({
            success: false,
            error: `Pre-Transaction Simulation Guardrail: Direct on-chain aggregator quote for ${estimatedLeg.ticker} is estimated off-hours. Set allowEstimated: true to proceed.`,
            simulationGuard: simData
          }, { status: 400 });
        }
      }
    } catch (simErr) {
      return Response.json({
        success: false,
        error: `Pre-Transaction Simulation Guardrail failure: ${simErr.message}. Broadcast blocked with $0 gas lost.`
      }, { status: 503 });
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

      try {
        const { stdout } = await execFilePromise('baw', [
          'market-order', 'swap',
          '--binanceChainId', '56',
          '--fromTokenQty', qty,
          '--fromToken', USDT_ADDRESS,
          '--toToken', targetToken.contractAddress,
          '--json'
        ]);
        const parsed = JSON.parse(stdout);

        if (parsed.success && parsed.data?.orderId) {
          const orderId = parsed.data.orderId;
          
          // Poll market-order list on BSC (#56) to resolve terminal status and txHash
          let finalOrder = null;
          for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 1200));
            try {
              const listRes = await execFilePromise('baw', [
                'market-order', 'list',
                '--binanceChainId', '56',
                '--json'
              ]);
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
