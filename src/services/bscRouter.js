import { encodeFunctionData, parseAbi, isAddress } from 'viem';
import { getPublicBscClient } from './bscBalanceReader.js';

// Official PancakeSwap V2 Router on BNB Smart Chain Mainnet (Chain ID 56)
export const BSC_PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

const ROUTER_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)'
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
]);

/**
 * Builds unsigned swap calldata for BSC Mainnet (Chain ID 56)
 */
export function buildSwapCalldata({
  fromAddress,
  fromTokenAddress,
  toTokenAddress,
  amountInWei,
  amountOutMinWei = 0n,
  recipient,
  deadlineMinutes = 20,
  routerAddress = BSC_PANCAKE_ROUTER
}) {
  if (!isAddress(fromAddress)) throw new Error('Invalid user address');
  if (!isAddress(fromTokenAddress)) throw new Error('Invalid fromToken address');
  if (!isAddress(toTokenAddress)) throw new Error('Invalid toToken address');

  const finalRecipient = recipient && isAddress(recipient) ? recipient : fromAddress;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (deadlineMinutes * 60));
  const path = [fromTokenAddress, toTokenAddress];

  const data = encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
    args: [
      BigInt(amountInWei),
      BigInt(amountOutMinWei),
      path,
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
    path,
    estimatedGas: 250000
  };
}

/**
 * Builds unsigned approve calldata for ERC20 token
 */
export function buildApproveCalldata({
  tokenAddress,
  spenderAddress = BSC_PANCAKE_ROUTER,
  amountWei = '115792089237316195423570985008687907853269984665640564039457584007913129639935' // Max uint256
}) {
  if (!isAddress(tokenAddress)) throw new Error('Invalid token address');
  if (!isAddress(spenderAddress)) throw new Error('Invalid spender address');

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, BigInt(amountWei)]
  });

  return {
    to: tokenAddress,
    data,
    value: '0x0',
    chainId: 56
  };
}

/**
 * Checks current token allowance
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
