export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { isAddress } from 'viem';
import { BSC_RWA_TOKENS } from '../../../services/tokens.js';
import { 
  getBscSwapQuote,
  buildSwapCalldata, 
  simulateBscTransaction, 
  BSC_PANCAKE_ROUTER 
} from '../../../services/bscRouter.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { allocations, depositAmount = 25, userWalletAddress } = body;

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ success: false, error: 'Valid allocations array is required.' }, { status: 400 });
    }

    const effectiveAddress = (userWalletAddress && isAddress(userWalletAddress))
      ? userWalletAddress
      : '0x000000000000000000000000000000000000dEaD';

    const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;
    const legResults = [];
    let totalGasGwei = 0;

    for (const alloc of allocations) {
      const targetToken = BSC_RWA_TOKENS[alloc.ticker];
      if (!targetToken) {
        legResults.push({
          ticker: alloc.ticker,
          status: 'UNSUPPORTED_TOKEN',
          simulationStatus: 'SIMULATED_REVERT',
          failReason: `Unknown token ticker: ${alloc.ticker}`
        });
        continue;
      }

      const targetUsd = (depositAmount * alloc.weight) / 100;
      if (targetUsd < 5) {
        legResults.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          weight: alloc.weight,
          targetUsd,
          status: 'SKIPPED_BELOW_MIN_FLOOR',
          simulationStatus: 'SKIPPED',
          error: 'Below $5.00 minimum order floor.'
        });
        continue;
      }

      // Check on-chain tradability
      if (targetToken.tradableOnBscDEX === false) {
        legResults.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          weight: alloc.weight,
          targetUsd,
          status: 'SIMULATED_REVERT',
          simulationStatus: 'SIMULATED_REVERT',
          failReason: targetToken.untradableReason || 'No verified AMM pool on BSC Mainnet'
        });
        continue;
      }

      const amountWei = BigInt(Math.floor(targetUsd * 1e18));

      // Obtain fresh on-chain quote
      const quote = await getBscSwapQuote({
        fromTokenAddress: fromToken,
        toTokenAddress: targetToken.contractAddress,
        amountInWei: amountWei,
        maxSlippagePercent: 0.5
      });

      if (!quote.success || !quote.amountOutMinWei || quote.amountOutMinWei <= 0n) {
        legResults.push({
          ticker: alloc.ticker,
          name: targetToken.name,
          weight: alloc.weight,
          targetUsd,
          status: 'SIMULATED_REVERT',
          simulationStatus: 'SIMULATED_REVERT',
          failReason: quote.error || 'Failed to obtain fresh on-chain quote from PancakeSwap V2'
        });
        continue;
      }

      const toAmountTokens = Number(quote.expectedAmountOutWei) / 1e18;

      // Build swap calldata with nonzero amountOutMinWei
      const swapTx = buildSwapCalldata({
        fromAddress: effectiveAddress,
        fromTokenAddress: fromToken,
        toTokenAddress: targetToken.contractAddress,
        amountInWei: amountWei,
        amountOutMinWei: quote.amountOutMinWei,
        path: quote.path,
        routerAddress: BSC_PANCAKE_ROUTER
      });

      totalGasGwei += 250000;
      const simResult = await simulateBscTransaction({
        from: effectiveAddress,
        to: swapTx.to,
        data: swapTx.data,
        value: swapTx.value
      });

      legResults.push({
        ticker: alloc.ticker,
        symbol: targetToken.symbol,
        name: targetToken.name,
        contractAddress: targetToken.contractAddress,
        weight: alloc.weight,
        targetUsd,
        quoteId: `bsc-${Date.now()}-${alloc.ticker}`,
        vendor: 'PancakeSwap V2 AMM (BSC #56)',
        executionMode: 'SWAP',
        toAmountTokens: parseFloat(toAmountTokens.toFixed(6)),
        amountOutMinTokens: parseFloat((Number(quote.amountOutMinWei) / 1e18).toFixed(6)),
        router: BSC_PANCAKE_ROUTER,
        path: quote.path,
        tx: swapTx,
        simulated: true,
        status: simResult.status,
        simulationStatus: simResult.status,
        failReason: simResult.failReason
      });
    }

    const hasRevert = legResults.some(l => l.simulationStatus === 'SIMULATED_REVERT');
    const allSuccessful = legResults.length > 0 && legResults.every(l => l.simulationStatus === 'SUCCESS');

    return Response.json({
      success: !hasRevert,
      overallStatus: hasRevert ? 'REVERT_BLOCKED' : 'PASS',
      network: 'BNB Smart Chain (BSC)',
      chainId: 56,
      depositUsd: depositAmount,
      userWalletAddress,
      totalLegs: legResults.length,
      legs: legResults,
      estimatedGas: `${(totalGasGwei * 3 / 1e9).toFixed(5)} BNB (~$0.92)`,
      simulationPassed: allSuccessful && !hasRevert,
      verificationNote: hasRevert
        ? 'Pre-transaction simulation detected EVM revert or unroutable token on BSC state. Order broadcast blocked.'
        : allSuccessful
        ? 'All legs simulated successfully on BSC state with zero reverts.'
        : 'Simulation completed.'
    });
  } catch (error) {
    console.error('Simulation API Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
