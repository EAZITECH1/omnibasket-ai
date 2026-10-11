export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { isAddress } from 'viem';
import { BSC_RWA_TOKENS } from '../../../services/tokens.js';
import { 
  getBscSwapQuote,
  buildSwapCalldata, 
  buildApproveCalldata,
  checkTokenAllowance,
  checkTokenBalance,
  simulateBscTransaction, 
  BSC_PANCAKE_ROUTER 
} from '../../../services/bscRouter.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { allocations, userWalletAddress } = body;
    const rawDeposit = body.depositAmount !== undefined ? body.depositAmount : 25;

    // 1. Validate allocations array
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return Response.json({ success: false, error: 'Valid allocations array is required.' }, { status: 400 });
    }

    // 2. Validate userWalletAddress
    if (!userWalletAddress || !isAddress(userWalletAddress)) {
      return Response.json({ 
        success: false, 
        error: 'Valid userWalletAddress is required for BSC transaction simulation.' 
      }, { status: 400 });
    }

    // 3. Validate depositAmount
    const depositAmount = Number(rawDeposit);
    if (typeof rawDeposit === 'boolean' || !Number.isFinite(depositAmount) || depositAmount <= 0) {
      return Response.json({ 
        success: false, 
        error: 'depositAmount must be a finite positive number.' 
      }, { status: 400 });
    }

    // 4. Validate individual allocations and total weights
    let totalWeight = 0;
    for (const alloc of allocations) {
      if (!alloc || typeof alloc !== 'object') {
        return Response.json({ success: false, error: 'Each allocation must be an object with ticker and weight.' }, { status: 400 });
      }
      if (typeof alloc.ticker !== 'string' || !alloc.ticker.trim()) {
        return Response.json({ success: false, error: 'Each allocation must specify a valid ticker symbol.' }, { status: 400 });
      }
      const weight = Number(alloc.weight);
      if (typeof alloc.weight === 'boolean' || !Number.isFinite(weight)) {
        return Response.json({ success: false, error: `Allocation weight for ${alloc.ticker} must be a valid number.` }, { status: 400 });
      }
      if (weight < 0) {
        return Response.json({ success: false, error: `Allocation weight for ${alloc.ticker} cannot be negative (${weight}%).` }, { status: 400 });
      }
      if (weight > 100) {
        return Response.json({ success: false, error: `Allocation weight for ${alloc.ticker} cannot exceed 100% (${weight}%).` }, { status: 400 });
      }
      totalWeight += weight;
    }

    if (totalWeight <= 0 || totalWeight > 100.01) {
      return Response.json({ 
        success: false, 
        error: `Total allocation weights must sum to at most 100% (received ${totalWeight.toFixed(2)}%).` 
      }, { status: 400 });
    }

    const effectiveAddress = userWalletAddress;
    const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;

    // 5. Aggregate USDT requirement calculation (Integer BigInt units)
    // Only executable legs ($5.00 min order floor) require USDT funding.
    let totalRequiredWei = 0n;
    for (const alloc of allocations) {
      const targetUsd = (depositAmount * alloc.weight) / 100;
      if (targetUsd >= 5) {
        const legAmountWei = BigInt(Math.floor(targetUsd * 1e18));
        totalRequiredWei += legAmountWei;
      }
    }

    // 6. Read on-chain USDT balance upfront ONCE
    let currentBalance = 0n;
    try {
      currentBalance = await checkTokenBalance({
        tokenAddress: fromToken,
        ownerAddress: effectiveAddress
      });
    } catch (balanceErr) {
      const failReason = `Balance lookup failed for USDT: ${balanceErr.message || 'RPC read failure'}. Preflight blocked.`;
      const failedLegs = allocations.map(alloc => {
        const targetToken = BSC_RWA_TOKENS[alloc.ticker];
        const targetUsd = (depositAmount * alloc.weight) / 100;
        if (targetUsd < 5) {
          return {
            ticker: alloc.ticker,
            name: targetToken?.name || alloc.ticker,
            weight: alloc.weight,
            targetUsd,
            status: 'SKIPPED_BELOW_MIN_FLOOR',
            simulationStatus: 'SKIPPED',
            error: 'Below $5.00 minimum order floor.'
          };
        }
        return {
          ticker: alloc.ticker,
          symbol: targetToken?.symbol || alloc.ticker,
          name: targetToken?.name || alloc.ticker,
          contractAddress: targetToken?.contractAddress,
          weight: alloc.weight,
          targetUsd,
          status: 'SIMULATED_REVERT',
          simulationStatus: 'SIMULATED_REVERT',
          failReason
        };
      });

      return Response.json({
        success: false,
        overallStatus: 'REVERT_BLOCKED',
        network: 'BNB Smart Chain (BSC)',
        chainId: 56,
        depositUsd: depositAmount,
        userWalletAddress,
        totalLegs: failedLegs.length,
        legs: failedLegs,
        simulationPassed: false,
        error: failReason,
        failReason,
        verificationNote: 'Balance lookup failed on BSC state. Order broadcast blocked.'
      });
    }

    // 7. Check aggregate funding against on-chain USDT balance
    if (totalRequiredWei > currentBalance) {
      const totalRequiredUsd = (Number(totalRequiredWei) / 1e18).toFixed(2);
      const availableUsdt = (Number(currentBalance) / 1e18).toFixed(2);
      const failMsg = `Insufficient USDT balance for basket: required $${totalRequiredUsd}, available $${availableUsdt}. Preflight blocked to prevent partial basket execution.`;

      const failedLegs = allocations.map(alloc => {
        const targetToken = BSC_RWA_TOKENS[alloc.ticker];
        const targetUsd = (depositAmount * alloc.weight) / 100;
        if (targetUsd < 5) {
          return {
            ticker: alloc.ticker,
            name: targetToken?.name || alloc.ticker,
            weight: alloc.weight,
            targetUsd,
            status: 'SKIPPED_BELOW_MIN_FLOOR',
            simulationStatus: 'SKIPPED',
            error: 'Below $5.00 minimum order floor.'
          };
        }
        return {
          ticker: alloc.ticker,
          symbol: targetToken?.symbol || alloc.ticker,
          name: targetToken?.name || alloc.ticker,
          contractAddress: targetToken?.contractAddress,
          weight: alloc.weight,
          targetUsd,
          status: 'SIMULATED_REVERT',
          simulationStatus: 'SIMULATED_REVERT',
          failReason: `Insufficient USDT balance for ${alloc.ticker}: required $${targetUsd.toFixed(2)}, available $${availableUsdt} (basket total: $${totalRequiredUsd}). Preflight blocked to prevent execution failure.`
        };
      });

      return Response.json({
        success: false,
        overallStatus: 'REVERT_BLOCKED',
        network: 'BNB Smart Chain (BSC)',
        chainId: 56,
        depositUsd: depositAmount,
        userWalletAddress,
        totalLegs: failedLegs.length,
        legs: failedLegs,
        totalRequiredUsdt: totalRequiredUsd,
        availableUsdt,
        simulationPassed: false,
        error: failMsg,
        failReason: failMsg,
        verificationNote: 'Pre-transaction simulation detected insufficient USDT balance for aggregate basket on BSC state. Order broadcast blocked.'
      });
    }

    // 8. Individual Leg Simulation Loop (Routes, Quotes, Allowances, Exact Calldata Simulation)
    const legResults = [];
    let totalGasGwei = 0;

    for (const alloc of allocations) {
      const targetToken = BSC_RWA_TOKENS[alloc.ticker];
      if (!targetToken) {
        legResults.push({
          ticker: alloc.ticker,
          status: 'SIMULATED_REVERT',
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

      // Check on-chain allowance on BSC
      let currentAllowance = 0n;
      try {
        currentAllowance = await checkTokenAllowance({
          tokenAddress: fromToken,
          ownerAddress: effectiveAddress,
          spenderAddress: BSC_PANCAKE_ROUTER
        });
      } catch (allowanceErr) {
        legResults.push({
          ticker: alloc.ticker,
          symbol: targetToken.symbol,
          name: targetToken.name,
          contractAddress: targetToken.contractAddress,
          weight: alloc.weight,
          targetUsd,
          status: 'SIMULATED_REVERT',
          simulationStatus: 'SIMULATED_REVERT',
          failReason: `Allowance lookup failed for USDT: ${allowanceErr.message || 'RPC read failure'}. Preflight blocked.`
        });
        continue;
      }

      const needsApproval = currentAllowance < amountWei;

      if (needsApproval) {
        // Build exact approval calldata and simulate approval on BSC state
        const approveTx = buildApproveCalldata({
          tokenAddress: fromToken,
          spenderAddress: BSC_PANCAKE_ROUTER,
          amountWei
        });

        const approveSimResult = await simulateBscTransaction({
          from: effectiveAddress,
          to: approveTx.to,
          data: approveTx.data,
          value: '0x0'
        });

        if (approveSimResult.status !== 'SUCCESS') {
          legResults.push({
            ticker: alloc.ticker,
            symbol: targetToken.symbol,
            name: targetToken.name,
            contractAddress: targetToken.contractAddress,
            weight: alloc.weight,
            targetUsd,
            status: 'SIMULATED_REVERT',
            simulationStatus: 'SIMULATED_REVERT',
            failReason: `Approval simulation failed: ${approveSimResult.failReason || 'Revert'}`
          });
          continue;
        }

        totalGasGwei += 45000;
        legResults.push({
          ticker: alloc.ticker,
          symbol: targetToken.symbol,
          name: targetToken.name,
          contractAddress: targetToken.contractAddress,
          weight: alloc.weight,
          targetUsd,
          quoteId: `bsc-${Date.now()}-${alloc.ticker}`,
          vendor: 'PancakeSwap V2 AMM (BSC #56)',
          executionMode: 'SEQUENTIAL_APPROVAL_THEN_SWAP',
          needsApproval: true,
          toAmountTokens: parseFloat(toAmountTokens.toFixed(6)),
          amountOutMinTokens: parseFloat((Number(quote.amountOutMinWei) / 1e18).toFixed(6)),
          router: BSC_PANCAKE_ROUTER,
          path: quote.path,
          simulated: true,
          status: 'APPROVAL_REQUIRED_FIRST',
          simulationStatus: 'APPROVAL_REQUIRED_FIRST',
          approvalStatus: 'SUCCESS',
          failReason: null,
          note: 'Route & quote verified. Token approval required before swap simulation.'
        });
      } else {
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
          needsApproval: false,
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
    }

    const hasRevert = legResults.some(l => l.simulationStatus === 'SIMULATED_REVERT');
    const hasApprovalPending = legResults.some(l => l.simulationStatus === 'APPROVAL_REQUIRED_FIRST');

    let overallStatus = 'PASS';
    if (hasRevert) {
      overallStatus = 'REVERT_BLOCKED';
    } else if (hasApprovalPending) {
      overallStatus = 'APPROVAL_REQUIRED_FIRST';
    }

    return Response.json({
      success: !hasRevert,
      overallStatus,
      network: 'BNB Smart Chain (BSC)',
      chainId: 56,
      depositUsd: depositAmount,
      userWalletAddress,
      totalLegs: legResults.length,
      legs: legResults,
      estimatedGas: `${(totalGasGwei * 3 / 1e9).toFixed(5)} BNB (~$0.92)`,
      simulationPassed: !hasRevert,
      verificationNote: hasRevert
        ? 'Pre-transaction simulation detected EVM revert, insufficient balance, or unroutable token on BSC state. Order broadcast blocked.'
        : hasApprovalPending
        ? 'All legs routed and quoted with valid slippage bounds. Sufficient balance verified. Sequential token approval required before swap execution.'
        : 'All legs simulated successfully on BSC state with verified balance and allowance.'
    });
  } catch (error) {
    console.error('Simulation API Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
