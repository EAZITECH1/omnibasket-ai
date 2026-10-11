export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { isAddress } from 'viem';
import { BSC_RWA_TOKENS } from '../../../../services/tokens.js';
import { 
  getBscSwapQuote,
  buildSwapCalldata, 
  buildApproveCalldata, 
  checkTokenAllowance, 
  simulateBscTransaction, 
  BSC_PANCAKE_ROUTER,
  MAX_SLIPPAGE_PERCENT
} from '../../../../services/bscRouter.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      userWalletAddress, 
      fromTicker = 'USDT', 
      toTicker, 
      fromAmount = 10,
      slippagePercent = '0.5'
    } = body;

    // 1. Validate user address strictly
    if (!userWalletAddress || !isAddress(userWalletAddress)) {
      return Response.json({ 
        success: false, 
        error: 'Valid userWalletAddress is required.' 
      }, { status: 400 });
    }

    // 2. Validate token pair from trusted registry
    const fromToken = BSC_RWA_TOKENS[fromTicker];
    const toToken = BSC_RWA_TOKENS[toTicker];

    if (!fromToken) {
      return Response.json({ 
        success: false, 
        error: `Unsupported input token: ${fromTicker}. Must be registered in BSC token registry.` 
      }, { status: 400 });
    }
    if (!toToken) {
      return Response.json({ 
        success: false, 
        error: `Unsupported target token: ${toTicker}. Must be registered in BSC token registry.` 
      }, { status: 400 });
    }

    // 3. Verify asset tradability on BSC DEX
    if (toToken.tradableOnBscDEX === false) {
      return Response.json({
        success: false,
        error: toToken.untradableReason || `Asset ${toTicker} currently has no active liquidity pool on BSC Mainnet.`
      }, { status: 400 });
    }

    // 4. Validate order size against minimum floor
    const amountNum = Number(fromAmount);
    if (isNaN(amountNum) || amountNum < 5) {
      return Response.json({ 
        success: false, 
        error: `Order amount ($${amountNum}) is below the $5.00 minimum floor on BSC.` 
      }, { status: 400 });
    }

    const amountInWei = BigInt(Math.floor(amountNum * 1e18));

    // 5. Bounded slippage protection (strictly capped at 0.5%)
    const requestedSlippage = Number(slippagePercent);
    const effectiveSlippage = (isNaN(requestedSlippage) || requestedSlippage <= 0)
      ? MAX_SLIPPAGE_PERCENT
      : Math.min(requestedSlippage, MAX_SLIPPAGE_PERCENT);

    // 6. Obtain fresh on-chain quote and derive nonzero amountOutMinWei
    const quote = await getBscSwapQuote({
      fromTokenAddress: fromToken.contractAddress,
      toTokenAddress: toToken.contractAddress,
      amountInWei,
      maxSlippagePercent: effectiveSlippage
    });

    if (!quote.success || !quote.amountOutMinWei || quote.amountOutMinWei <= 0n) {
      return Response.json({
        success: false,
        error: quote.error || 'Failed to obtain fresh on-chain quote. Execution calldata blocked to prevent capital loss.'
      }, { status: 400 });
    }

    // 7. Check ERC20 allowance on BSC
    const currentAllowance = await checkTokenAllowance({
      tokenAddress: fromToken.contractAddress,
      ownerAddress: userWalletAddress,
      spenderAddress: BSC_PANCAKE_ROUTER
    });

    const needsApproval = currentAllowance < amountInWei;
    let approveTx = null;
    let approveSimulation = null;

    if (needsApproval) {
      // Approve ONLY the exact validated input amount (no unlimited approvals)
      approveTx = buildApproveCalldata({
        tokenAddress: fromToken.contractAddress,
        spenderAddress: BSC_PANCAKE_ROUTER,
        amountWei: amountInWei
      });

      // Simulate the approval transaction
      approveSimulation = await simulateBscTransaction({
        from: userWalletAddress,
        to: approveTx.to,
        data: approveTx.data,
        value: '0x0'
      });

      if (approveSimulation.status !== 'SUCCESS') {
        return Response.json({
          success: false,
          error: `Pre-transaction approval simulation failed on BSC: ${approveSimulation.failReason || 'Revert'}. Execution blocked.`,
          simulation: approveSimulation
        }, { status: 400 });
      }
    }

    // 8. Build executable swap calldata with nonzero amountOutMinWei and verified path
    const swapTx = buildSwapCalldata({
      fromAddress: userWalletAddress,
      fromTokenAddress: fromToken.contractAddress,
      toTokenAddress: toToken.contractAddress,
      amountInWei,
      amountOutMinWei: quote.amountOutMinWei,
      path: quote.path,
      routerAddress: BSC_PANCAKE_ROUTER
    });

    // 9. Pre-transaction simulation gate: Fail-Closed
    let swapSimulation = null;
    if (!needsApproval) {
      swapSimulation = await simulateBscTransaction({
        from: userWalletAddress,
        to: swapTx.to,
        data: swapTx.data,
        value: swapTx.value
      });

      if (swapSimulation.status !== 'SUCCESS') {
        return Response.json({
          success: false,
          error: `Pre-transaction swap simulation reverted on BSC: ${swapSimulation.failReason || 'Revert'}. Execution aborted to protect funds.`,
          simulation: swapSimulation
        }, { status: 400 });
      }
    } else {
      // When approval is pending, note that swap simulation will run sequentially once approval is confirmed
      swapSimulation = {
        status: 'APPROVAL_REQUIRED_FIRST',
        simulated: true,
        message: 'Approval must be broadcast and confirmed before final swap simulation.'
      };
    }

    return Response.json({
      success: true,
      chainId: 56,
      network: 'BNB Smart Chain Mainnet',
      userWalletAddress,
      fromTicker,
      toTicker,
      fromAmount: amountNum,
      needsApproval,
      approveTx,
      swapTx,
      simulation: needsApproval ? approveSimulation : swapSimulation,
      quote: {
        expectedAmountOutWei: quote.expectedAmountOutWei.toString(),
        amountOutMinWei: quote.amountOutMinWei.toString(),
        expectedAmountOut: (Number(quote.expectedAmountOutWei) / 1e18).toFixed(6),
        amountOutMin: (Number(quote.amountOutMinWei) / 1e18).toFixed(6),
        slippagePercent: quote.slippagePercent,
        slippagePct: `${quote.slippagePercent}%`,
        quoteSource: quote.quoteSource,
        quotedAt: quote.quotedAt,
        routePath: quote.path,
        priceDisclaimer: 'Real-time AMM pricing on PancakeSwap V2. Pre-transaction simulation verifies against current BSC state; changes in chain state before block inclusion may still cause transactions to revert.'
      }
    });
  } catch (error) {
    console.error('Swap build API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
