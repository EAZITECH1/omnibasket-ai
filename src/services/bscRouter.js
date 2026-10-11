import { encodeFunctionData, parseAbi, isAddress } from 'viem';
import { getPublicBscClient } from './bscBalanceReader.js';
import { BSC_RWA_TOKENS } from './tokens.js';

// Official PancakeSwap V2 Router on BNB Smart Chain Mainnet (Chain ID 56)
export const BSC_PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
export const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
export const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

// Maximum allowed slippage tolerance across OmniBasket (0.5%)
export const MAX_SLIPPAGE_PERCENT = 0.5;

const ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)'
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
]);

/**
 * Queries real-time on-chain quote from PancakeSwap V2 AMM on BSC #56
 * and calculates nonzero amountOutMin using strict slippage bounds (max 0.5%).
 */
export async function getBscSwapQuote({
  fromTokenAddress,
  toTokenAddress,
  amountInWei,
  maxSlippagePercent,
  maxSlippageBps
}) {
  if (!isAddress(fromTokenAddress)) throw new Error('Invalid fromToken address');
  if (!isAddress(toTokenAddress)) throw new Error('Invalid toToken address');
  if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
    throw new Error('fromToken and toToken cannot be identical');
  }

  const cleanAmountIn = BigInt(amountInWei);
  if (cleanAmountIn <= 0n) {
    throw new Error('amountInWei must be greater than zero');
  }

  const client = getPublicBscClient();

  // Potential routing paths to evaluate
  const candidatePaths = [
    [fromTokenAddress, toTokenAddress]
  ];

  const isWbnb = (addr) => addr.toLowerCase() === WBNB_ADDRESS.toLowerCase();
  const isUsdt = (addr) => addr.toLowerCase() === USDT_ADDRESS.toLowerCase();

  if (!isWbnb(fromTokenAddress) && !isWbnb(toTokenAddress)) {
    candidatePaths.push([fromTokenAddress, WBNB_ADDRESS, toTokenAddress]);
  }
  if (!isUsdt(fromTokenAddress) && !isUsdt(toTokenAddress)) {
    candidatePaths.push([fromTokenAddress, USDT_ADDRESS, toTokenAddress]);
  }

  let bestPath = null;
  let bestExpectedOut = 0n;

  for (const path of candidatePaths) {
    try {
      const amounts = await client.readContract({
        address: BSC_PANCAKE_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [cleanAmountIn, path]
      });

      const outAmount = amounts[amounts.length - 1];
      if (outAmount > bestExpectedOut) {
        bestExpectedOut = outAmount;
        bestPath = path;
      }
    } catch (_) {
      // Path does not have sufficient liquidity; evaluate next candidate
    }
  }

  if (!bestPath || bestExpectedOut <= 0n) {
    return {
      success: false,
      error: 'No active liquidity pool route found on PancakeSwap V2 for this pair on BSC Mainnet.',
      fromTokenAddress,
      toTokenAddress
    };
  }

  // Strict slippage bounding: never exceed 0.5% (50 bps)
  let requestedSlippage = MAX_SLIPPAGE_PERCENT;
  if (maxSlippageBps !== undefined && !isNaN(Number(maxSlippageBps))) {
    requestedSlippage = Number(maxSlippageBps) / 100;
  } else if (maxSlippagePercent !== undefined && !isNaN(Number(maxSlippagePercent))) {
    requestedSlippage = Number(maxSlippagePercent);
  }
  const effectiveSlippage = (requestedSlippage <= 0)
    ? MAX_SLIPPAGE_PERCENT
    : Math.min(requestedSlippage, MAX_SLIPPAGE_PERCENT);

  // Derive minimum output: expectedOut * (100 - slippage%) / 100
  // Scaled by 10,000 for precision: 0.5% => 9950 / 10000
  const slippageFraction = BigInt(Math.floor((100 - effectiveSlippage) * 100));
  const amountOutMinWei = (bestExpectedOut * slippageFraction) / 10000n;

  if (amountOutMinWei <= 0n) {
    return {
      success: false,
      error: 'Calculated minimum output is zero; swap rejected for capital protection.',
      fromTokenAddress,
      toTokenAddress
    };
  }

  return {
    success: true,
    path: bestPath,
    fromTokenAddress,
    toTokenAddress,
    amountInWei: cleanAmountIn,
    expectedAmountOutWei: bestExpectedOut,
    amountOutMinWei,
    slippagePercent: effectiveSlippage,
    slippageBps: Math.round(effectiveSlippage * 100),
    routerAddress: BSC_PANCAKE_ROUTER,
    quoteSource: 'PancakeSwap V2 AMM (BSC #56)',
    quotedAt: Date.now()
  };
}

/**
 * Builds unsigned swap calldata for BSC Mainnet (Chain ID 56)
 * Requires nonzero amountOutMinWei for strict slippage protection.
 */
export function buildSwapCalldata({
  fromAddress,
  fromTokenAddress,
  toTokenAddress,
  amountInWei,
  amountOutMinWei,
  path,
  recipient,
  deadlineMinutes = 20,
  routerAddress = BSC_PANCAKE_ROUTER
}) {
  if (!isAddress(fromAddress)) throw new Error('Invalid user address');
  if (!isAddress(fromTokenAddress)) throw new Error('Invalid fromToken address');
  if (!isAddress(toTokenAddress)) throw new Error('Invalid toToken address');

  const cleanAmountIn = BigInt(amountInWei);
  if (cleanAmountIn <= 0n) throw new Error('amountInWei must be greater than zero');

  if (!amountOutMinWei || BigInt(amountOutMinWei) <= 0n) {
    throw new Error('Explicit nonzero amountOutMinWei is required for slippage protection. Zero or negative minimum outputs are rejected.');
  }
  const cleanAmountOutMin = BigInt(amountOutMinWei);

  const finalRecipient = recipient && isAddress(recipient) ? recipient : fromAddress;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (deadlineMinutes * 60));
  const swapPath = (path && Array.isArray(path) && path.length >= 2) ? path : [fromTokenAddress, toTokenAddress];

  if (swapPath[0].toLowerCase() !== fromTokenAddress.toLowerCase()) {
    throw new Error('Swap path origin does not match fromTokenAddress');
  }
  if (swapPath[swapPath.length - 1].toLowerCase() !== toTokenAddress.toLowerCase()) {
    throw new Error('Swap path destination does not match toTokenAddress');
  }

  const data = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
    args: [
      cleanAmountIn,
      cleanAmountOutMin,
      swapPath,
      finalRecipient,
      deadline
    ]
  });

  return {
    from: fromAddress,
    to: routerAddress,
    data,
    value: '0x0',
    chainId: 56,
    path: swapPath,
    amountInWei: cleanAmountIn.toString(),
    amountOutMinWei: cleanAmountOutMin.toString(),
    estimatedGas: 250000
  };
}

/**
 * Builds unsigned approve calldata for ERC20 token
 * Approves ONLY the exact validated input amount required for this swap.
 */
export function buildApproveCalldata({
  tokenAddress,
  spenderAddress = BSC_PANCAKE_ROUTER,
  amountWei
}) {
  if (!isAddress(tokenAddress)) throw new Error('Invalid token address');
  if (!isAddress(spenderAddress)) throw new Error('Invalid spender address');

  if (!amountWei || BigInt(amountWei) <= 0n) {
    throw new Error('Explicit nonzero amountWei is required for token approval. Unlimited approvals are rejected.');
  }

  const cleanAmountWei = BigInt(amountWei);

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, cleanAmountWei]
  });

  return {
    to: tokenAddress,
    data,
    value: '0x0',
    chainId: 56,
    spender: spenderAddress,
    amountWei: cleanAmountWei.toString()
  };
}

/**
 * Checks current token allowance on BSC
 */
export async function checkTokenAllowance({
  tokenAddress,
  ownerAddress,
  spenderAddress = BSC_PANCAKE_ROUTER
}) {
  if (!isAddress(tokenAddress) || !isAddress(ownerAddress) || !isAddress(spenderAddress)) {
    return 0n;
  }
  const client = getPublicBscClient();
  try {
    const allowance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, spenderAddress]
    });
    return allowance;
  } catch (err) {
    console.warn('Allowance check error:', err.message);
    return 0n;
  }
}

/**
 * Simulates transaction calldata on BSC state using public client
 */
export async function simulateBscTransaction({
  from,
  to,
  data,
  value = 0n
}) {
  const client = getPublicBscClient();
  try {
    let gasUsed = '250000';
    try {
      const estimated = await client.estimateGas({
        account: from,
        to,
        data,
        value: BigInt(value || 0)
      });
      gasUsed = estimated.toString();
    } catch (_) {}

    await client.call({
      account: from,
      to,
      data,
      value: BigInt(value || 0)
    });
    return {
      success: true,
      status: 'SUCCESS',
      reverted: false,
      gasUsed,
      failReason: null
    };
  } catch (err) {
    const reason = err.shortMessage || err.message || 'Simulation reverted';
    return {
      success: false,
      status: 'SIMULATED_REVERT',
      reverted: true,
      failReason: reason
    };
  }
}
