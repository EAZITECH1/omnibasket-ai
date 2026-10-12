import { createPublicClient, http, parseAbi, formatUnits, formatEther, isAddress } from 'viem';
import { bsc } from 'viem/chains';
import { BSC_RWA_TOKENS } from './tokens.js';
import { getLivePrices, getCachedPrices } from './livePrices.js';

const BSC_RPCS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://rpc.ankr.com/bsc'
];

export const ESTIMATED_PRICES = {
  USDT: 1.0,
  USDY: 1.16,
  NVDA: 229.28,
  AAPL: 336.64,
  MSFT: 535.07,
  GOOG: 347.86,
  TSLA: 382.70,
  MAG7X: 100.0,
  AI: 100.0,
  BNB: 753.0
};

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

let customPublicBscClient = null;

export function setCustomPublicBscClient(client) {
  customPublicBscClient = client;
}

export function getCustomPublicBscClient() {
  return customPublicBscClient;
}

export function getPublicBscClient() {
  if (customPublicBscClient) return customPublicBscClient;
  return createPublicClient({
    chain: bsc,
    transport: http(BSC_RPCS[0], {
      retryCount: 3,
      retryDelay: 1000
    })
  });
}

/**
 * Reads BNB and all supported tokenized stock balances on BSC Mainnet (Chain ID 56)
 * @param {string} address - Valid EVM address
 */
export async function readBscBalances(address) {
  if (!address || !isAddress(address)) {
    throw new Error('Invalid BSC address provided');
  }

  const client = getPublicBscClient();

  // 1. Fetch native BNB balance
  let bnbBalanceWei = 0n;
  try {
    bnbBalanceWei = await client.getBalance({ address });
  } catch (err) {
    console.warn('Failed to read BNB balance:', err.message);
  }
  const bnbBalance = parseFloat(formatEther(bnbBalanceWei));

  // 2. Build multicall contracts list for known tokens
  const tokenEntries = Object.entries(BSC_RWA_TOKENS);
  const contracts = tokenEntries.map(([_, token]) => ({
    address: token.contractAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address]
  }));

  let multicallResults = [];
  try {
    multicallResults = await client.multicall({ contracts });
  } catch (err) {
    console.warn('Multicall balance read failed, falling back to individual calls:', err.message);
    multicallResults = await Promise.all(
      contracts.map(async (c) => {
        try {
          const res = await client.readContract(c);
          return { status: 'success', result: res };
        } catch (_) {
          return { status: 'failure', result: 0n };
        }
      })
    );
  }

  // 3. Fetch real-time market prices
  const livePrices = await getLivePrices().catch(() => ESTIMATED_PRICES);

  // 4. Assemble tokens list
  const tokens = [];

  // Add BNB
  const bnbPrice = livePrices.BNB || ESTIMATED_PRICES.BNB;
  const bnbValue = bnbBalance * bnbPrice;
  tokens.push({
    symbol: 'BNB',
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    balance: parseFloat(bnbBalance.toFixed(5)),
    rawBalance: bnbBalanceWei.toString(),
    priceUsd: bnbPrice,
    valueUsd: parseFloat(bnbValue.toFixed(2)),
    isNative: true
  });

  tokenEntries.forEach(([key, token], idx) => {
    const res = multicallResults[idx];
    const rawVal = res && res.status === 'success' ? res.result : 0n;
    const decimals = token.decimals || 18;
    const balanceNum = parseFloat(formatUnits(rawVal, decimals));
    const priceUsd = livePrices[key] || ESTIMATED_PRICES[key] || 1.0;
    const valueUsd = balanceNum * priceUsd;

    tokens.push({
      symbol: token.symbol,
      ticker: token.ticker || key,
      name: token.name,
      address: token.contractAddress,
      balance: parseFloat(balanceNum.toFixed(6)),
      rawBalance: rawVal.toString(),
      priceUsd: parseFloat(priceUsd.toFixed(2)),
      valueUsd: parseFloat(valueUsd.toFixed(2))
    });
  });

  const totalValueUsd = tokens.reduce((acc, t) => acc + (t.valueUsd || 0), 0);

  return {
    success: true,
    address,
    network: 'BNB Smart Chain (BSC)',
    chainId: 56,
    totalValueUsd: parseFloat(totalValueUsd.toFixed(2)),
    tokens
  };
}
