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
          message: 'Order size below $5.00 minimum floor'
        });
        continue;
      }

      // Format qty (integer or 2 decimals)
      const qty = legAmountUsd.toFixed(2);
      const cmd = `baw market-order swap --binanceChainId 56 --fromTokenQty ${qty} --fromToken ${USDT_ADDRESS} --toToken ${targetToken.contractAddress} --json`;

      try {
        const { stdout, stderr } = await execPromise(cmd);
        const parsed = JSON.parse(stdout);

        results.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          allocatedUsd: legAmountUsd,
          status: parsed.success ? 'EXECUTED' : 'FAILED',
          data: parsed
        });
      } catch (err) {
        let errJson = null;
        try {
          // Check if stdout contains JSON error from baw
          if (err.stdout) {
            errJson = JSON.parse(err.stdout);
          }
        } catch (_) {}

        results.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          allocatedUsd: legAmountUsd,
          status: 'FAILED',
          error: errJson || { message: err.message }
        });
      }
    }

    const allSucceeded = results.every(r => r.status === 'EXECUTED');
    const isInsufficientBalance = results.some(r => 
      JSON.stringify(r.error || r.data || '').includes('insufficient') ||
      JSON.stringify(r.error || r.data || '').includes('30003001')
    );

    return Response.json({
      success: allSucceeded,
      hasExecutionAttempt: true,
      isInsufficientBalance,
      results,
      summary: isInsufficientBalance
        ? 'Agentic Wallet triggered BSC order broadcast. Execution halted safely due to 0 USDT test wallet balance. Fund wallet with USDT to settle live.'
        : allSucceeded
        ? 'All basket legs executed on-chain via Binance Agentic Wallet!'
        : 'Execution failed on one or more legs.'
    });
  } catch (error) {
    console.error('Execution API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
