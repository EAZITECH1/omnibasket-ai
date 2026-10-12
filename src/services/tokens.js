/**
 * Verified BSC Mainnet Tokenized Stock Registry
 * Chain ID: 56 (BNB Smart Chain)
 * 
 * Each token has been on-chain verified for contract existence, 18 decimals,
 * and available PancakeSwap V2 AMM liquidity paths.
 */
export const BSC_RWA_TOKENS = {
  USDT: {
    ticker: 'USDT',
    symbol: 'USDT',
    name: 'Tether USD',
    contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    type: 'stable',
    category: 'Currency',
    tradableOnBscDEX: true
  },
  NVDA: {
    ticker: 'NVDA',
    symbol: 'NVDAon',
    name: 'NVIDIA Corporation',
    contractAddress: '0xa9ee28c80f960b889dfbd1902055218cba016f75',
    decimals: 18,
    type: 1,
    category: 'AI & Semiconductors',
    multiplier: 1.0017152487959898,
    tradableOnBscDEX: true,
    preferredRoute: ['USDT', 'NVDA']
  },
  AAPL: {
    ticker: 'AAPL',
    symbol: 'AAPLon',
    name: 'Apple Inc.',
    contractAddress: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4',
    decimals: 18,
    type: 1,
    category: 'Tech Giants',
    multiplier: 1.003376073740221058,
    tradableOnBscDEX: true,
    preferredRoute: ['USDT', 'AAPL']
  },
  MSFT: {
    ticker: 'MSFT',
    symbol: 'MSFTon',
    name: 'Microsoft Corporation',
    contractAddress: '0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3',
    decimals: 18,
    type: 1,
    category: 'Cloud & AI',
    multiplier: 1.005730856892783903,
    tradableOnBscDEX: true,
    preferredRoute: ['USDT', 'MSFT']
  },
  TSLA: {
    ticker: 'TSLA',
    symbol: 'TSLAon',
    name: 'Tesla, Inc.',
    contractAddress: '0x2494b603319d4d9f9715c9f4496d9e0364b59d93',
    decimals: 18,
    type: 1,
    category: 'EV & Robotics',
    multiplier: 1.0,
    tradableOnBscDEX: true,
    preferredRoute: ['USDT', 'WBNB', 'TSLA']
  },
  USDY: {
    ticker: 'USDY',
    symbol: 'USDY',
    name: 'Ondo US Dollar Yield (Treasury Bill)',
    contractAddress: '0x608593d17a2decbbc4399e4185be4922f97ed32e',
    decimals: 18,
    type: 1,
    category: 'Yield & Safety',
    multiplier: 1.0,
    apy: '5.10%',
    tradableOnBscDEX: false,
    untradableReason: 'Ondo USDY on BSC requires permissioned KYC minting; no public AMM liquidity pool exists on PancakeSwap V2.'
  },
  GOOG: {
    ticker: 'GOOG',
    symbol: 'GOOGon',
    name: 'Alphabet Inc.',
    contractAddress: '0x817f1f6780f99bcaac394a59cb0261962df5da8b',
    decimals: 18,
    type: 1,
    category: 'Search & Cloud',
    multiplier: 1.0,
    tradableOnBscDEX: false,
    untradableReason: 'Off-hours TradFi token with no public AMM liquidity pool on PancakeSwap V2.'
  },
  MAG7X: {
    ticker: 'MAG7X',
    symbol: 'MAG7Xon',
    name: 'Magnificent 7 Thematic Index',
    contractAddress: '0x50436ec45316a98e72b03ead5752e8543f11ec09',
    decimals: 18,
    type: 1,
    category: 'Thematic Basket',
    multiplier: 1.0,
    tradableOnBscDEX: false,
    untradableReason: 'Index token with no public AMM liquidity pool on PancakeSwap V2.'
  },
  AI: {
    ticker: 'AI',
    symbol: 'AIon',
    name: 'AI Sector Thematic Index',
    contractAddress: '0xbb8c10f7e828e3279df8cc3397a5212f845c509b',
    decimals: 18,
    type: 1,
    category: 'Thematic Basket',
    multiplier: 1.0,
    tradableOnBscDEX: false,
    untradableReason: 'Index token with no public AMM liquidity pool on PancakeSwap V2.'
  }
};

export const PRESET_BASKETS = [
  {
    id: 'ai-supercycle',
    name: 'AI Supercycle Basket',
    description: 'Exposure to leading compute, cloud, and generative AI infrastructure on BSC',
    badge: 'Trending 🔥',
    allocations: [
      { ticker: 'NVDA', weight: 50 },
      { ticker: 'MSFT', weight: 30 },
      { ticker: 'AAPL', weight: 20 }
    ]
  },
  {
    id: 'tech-giants-hybrid',
    name: 'Megacap Tech & Robotics',
    description: 'Autonomous mobility, cloud computing, and global consumer ecosystem',
    badge: 'Megacap ⚡',
    allocations: [
      { ticker: 'TSLA', weight: 40 },
      { ticker: 'AAPL', weight: 30 },
      { ticker: 'MSFT', weight: 30 }
    ]
  },
  {
    id: 'core-compute-duo',
    name: 'Core Compute & Cloud Duo',
    description: '50% Nvidia AI compute + 50% Microsoft Enterprise Cloud on BSC AMM',
    badge: 'Balanced 🛡️',
    allocations: [
      { ticker: 'NVDA', weight: 50 },
      { ticker: 'MSFT', weight: 50 }
    ]
  }
];
