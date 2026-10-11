export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { isAddress } from 'viem';
import { BSC_RWA_TOKENS } from '../../../../services/tokens.js';
import { 
  buildSwapCalldata, 
  buildApproveCalldata, 
  checkTokenAllowance, 
  simulateBscTransaction, 
  BSC_PANCAKE_ROUTER 
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

    if (!userWalletAddress || !isAddress(userWalletAddress)) {
      return Response.json({ success: false, error: 'Valid userWalletAddress is required.' }, { status: 400 });
    }

    const fromToken = BSC_RWA_TOKENS[fromTicker];
    const toToken = BSC_RWA_TOKENS[toTicker];

    if (!fromToken) {
      return Response.json({ success: false, error: `Unsupported input token: ${fromTicker}` }, { status: 400 });
    }
    if (!toToken) {
      return Response.json({ success: false, error: `Unsupported target token: ${toTicker}` }, { status: 400 });
    }

    const amountNum = Number(fromAmount);
    if (isNaN(amountNum) || amountNum < 5) {
      return Response.json({ 
        success: false, 
        error: `Order amount ($${amountNum}) is below the $5.00 minimum floor on BSC.` 
      }, { status: 400 });
    }

    const amountInWei = BigInt(Math.floor(amountNum * 1e18));

    // 1. Check ERC20 allowance
    const currentAllowance = await checkTokenAllowance({
      tokenAddress: fromToken.contractAddress,
      ownerAddress: userWalletAddress,
      spenderAddress: BSC_PANCAKE_ROUTER
    });

    const needsApproval = currentAllowance < amountInWei;
    let approveTx = null;
    if (needsApproval) {
      approveTx = buildApproveCalldata({
        tokenAddress: fromToken.contractAddress,
        spenderAddress: BSC_PANCAKE_ROUTER
      });
    }

    // 2. Build swap calldata
    const swapTx = buildSwapCalldata({
      fromAddress: userWalletAddress,
      fromTokenAddress: fromToken.contractAddress,
      toTokenAddress: toToken.contractAddress,
      amountInWei,
      routerAddress: BSC_PANCAKE_ROUTER
    });

    // 3. Pre-transaction simulation
    const simResult = await simulateBscTransaction({
      from: userWalletAddress,
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value
    });

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
      simulation: simResult
    });
  } catch (error) {
    console.error('Swap build API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
