/**
 * ERC-8004 Autonomous Agent Identity Specification
 * OmniBasket Autonomous Sentinel on BNB Smart Chain
 */

export const AGENT_IDENTITY = {
  standard: 'ERC-8004',
  agentName: 'OmniBasket Sentinel AI',
  agentVersion: '1.0.0',
  description: 'Autonomous 24/7 tokenized equity & RWA basket management agent on BNB Smart Chain',
  agentAddress: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
  homeChain: 'eip155:56', // BSC Mainnet
  network: 'BNB Smart Chain',
  capabilities: [
    '24_7_RWA_MARKET_SENTINEL',
    'PORTFOLIO_DRIFT_ANALYSIS',
    'PRE_TX_SIMULATION_GUARD',
    'AGENTIC_WALLET_ORDER_DISPATCH',
    'X402_MICROPAYMENT_PROTOCOL'
  ],
  securityGuards: {
    minOrderSizeUsd: 5.0,
    maxSlippagePercent: 0.5,
    mevProtection: true,
    simulationRequiredBeforeBroadcast: true
  },
  supportedAssets: [
    { ticker: 'NVDAon', name: 'Nvidia Corp (bStock)', chainId: 56 },
    { ticker: 'AAPLon', name: 'Apple Inc (bStock)', chainId: 56 },
    { ticker: 'MSFTon', name: 'Microsoft Corp (bStock)', chainId: 56 },
    { ticker: 'GOOGon', name: 'Alphabet Inc (bStock)', chainId: 56 },
    { ticker: 'TSLAon', name: 'Tesla Inc (bStock)', chainId: 56 },
    { ticker: 'USDY', name: 'Ondo US Dollar Yield (Treasury Bill)', chainId: 56 },
    { ticker: 'MAG7Xon', name: 'Magnificent 7 Composite (xStock)', chainId: 56 }
  ],
  metadataUri: 'https://omnibasket.ai/agent/erc8004.json'
};
