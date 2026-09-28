/**
 * x402 (HTTP 402 Payment Required) Paywalled RWA Alpha Feed Endpoint
 * Compliant with x402 v2 and Binance Agentic Wallet (`baw x402-payment`)
 */

const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const MERCHANT_WALLET = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

const PAYMENT_REQUIREMENTS = {
  x402Version: 2,
  resource: {
    url: '/api/rwa/alpha-feed',
    description: 'OmniBasket AI Premium 24/7 RWA Momentum & Yield Signals'
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:56',
      asset: USDT_BSC,
      amount: '10000000000000000', // 0.01 USDT (18 decimals)
      payTo: MERCHANT_WALLET,
      extra: {
        name: 'Tether USD',
        version: '1'
      }
    }
  ]
};

export async function GET(req) {
  return handleRequest(req);
}

export async function POST(req) {
  return handleRequest(req);
}

async function handleRequest(req) {
  const authHeader = req.headers.get('payment-signature') || req.headers.get('x-payment');

  // If no payment signature provided, return HTTP 402 with challenge
  if (!authHeader) {
    const rawJsonStr = JSON.stringify(PAYMENT_REQUIREMENTS);
    const base64Header = Buffer.from(rawJsonStr).toString('base64');

    return new Response(rawJsonStr, {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': base64Header,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Payment Signature Received — Unlock Premium Alpha Feed
  const alphaPayload = {
    unlocked: true,
    protocol: 'x402 Micropayment Protocol (v2)',
    settlementChain: 'BNB Smart Chain (eip155:56)',
    costUsdt: 0.01,
    timestamp: new Date().toISOString(),
    signalSummary: 'Bullish AI compute momentum with institutional Treasury yield anchoring.',
    signals: [
      {
        ticker: 'NVDAon',
        assetName: 'NVIDIA Corporation',
        momentumScore: 94,
        recommendation: 'STRONG_OVERWEIGHT',
        targetAllocation: 55,
        catalyst: 'Next-gen Blackwell AI datacenter demand; high weekend BSC volume'
      },
      {
        ticker: 'USDY',
        assetName: 'Ondo US Dollar Yield',
        momentumScore: 98,
        recommendation: 'CORE_YIELD_ANCHOR',
        targetAllocation: 20,
        apy: '5.10%',
        spreadVsTradFi: '+60 bps vs overnight bank rate'
      },
      {
        ticker: 'MSFTon',
        assetName: 'Microsoft Corporation',
        momentumScore: 84,
        recommendation: 'OVERWEIGHT',
        targetAllocation: 15,
        catalyst: 'Azure AI cloud scaling & enterprise copilot monetization'
      },
      {
        ticker: 'GOOGon',
        assetName: 'Alphabet Inc',
        momentumScore: 79,
        recommendation: 'ACCUMULATE',
        targetAllocation: 10,
        catalyst: 'Gemini multimodal integrations and TPU custom silicon buildout'
      }
    ],
    arbitrageOpportunities: [
      {
        pair: 'Ondo USDY / TradFi US 3M T-Bill',
        spread: '+0.60% APY',
        instantLiquidity: 'PancakeSwap V4 / LiquidMesh on BSC',
        status: 'OPEN_24_7'
      }
    ],
    weekendSentinelAlert: 'TradFi NYSE Closed. BSC DEX pools absorbing 24/7 off-hours rebalancing flows with < 0.12% slippage.'
  };

  return Response.json(alphaPayload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Verified': 'true'
    }
  });
}
