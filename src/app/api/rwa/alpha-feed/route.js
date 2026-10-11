import { verifyTypedData } from 'viem';

// In-memory replay protection cache for consumed EIP-3009 nonces
const spentNonces = new Set();

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

  // Parse incoming payment authorization header
  let paymentPayload = null;
  try {
    let decoded = '';
    try {
      decoded = Buffer.from(authHeader, 'base64').toString('utf8');
      paymentPayload = JSON.parse(decoded);
    } catch (_) {
      paymentPayload = JSON.parse(authHeader);
    }
  } catch (err) {
    return Response.json({
      error: 'Invalid x402 payment authorization: malformed signature format.',
      requiredScheme: 'exact',
      network: 'eip155:56',
      asset: USDT_BSC
    }, { status: 400 });
  }

  if (!paymentPayload || typeof paymentPayload !== 'object' || Array.isArray(paymentPayload)) {
    return Response.json({
      error: 'Invalid x402 payment authorization: payload must be a JSON object.',
      requiredScheme: 'exact',
      network: 'eip155:56',
      asset: USDT_BSC
    }, { status: 400 });
  }

  // Extract authorization fields (support top-level or nested message/authorization structure)
  const authObj = paymentPayload.authorization || paymentPayload.message || paymentPayload;

  // 1. Mandatory Network Verification (strictly eip155:56, never defaulted)
  const network = paymentPayload.network || authObj.network;
  if (!network) {
    return Response.json({
      error: 'Missing required field: network. Authorization must specify eip155:56.',
      expectedNetwork: 'eip155:56'
    }, { status: 400 });
  }
  if (network !== 'eip155:56') {
    return Response.json({
      error: `Network mismatch: expected eip155:56 (BNB Smart Chain), got ${network}`,
      expectedNetwork: 'eip155:56'
    }, { status: 400 });
  }

  // 2. Mandatory Asset Verification (strictly BSC USDT, never defaulted)
  const asset = paymentPayload.asset || paymentPayload.token || authObj.asset || authObj.token;
  if (!asset) {
    return Response.json({
      error: `Missing required field: asset. Authorization must specify BSC USDT (${USDT_BSC}).`,
      expectedAsset: USDT_BSC
    }, { status: 400 });
  }
  if (asset.toLowerCase() !== USDT_BSC.toLowerCase()) {
    return Response.json({
      error: `Asset mismatch: expected BSC USDT (${USDT_BSC}), got ${asset}`,
      expectedAsset: USDT_BSC
    }, { status: 400 });
  }

  // 3. Mandatory Micropayment Amount Verification (>= 0.01 USDT, never defaulted)
  const rawAmount = paymentPayload.amount ?? authObj.amount ?? authObj.value;
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    return Response.json({
      error: 'Missing required field: amount. Authorization must specify payment amount in wei.',
      requiredAmount: '10000000000000000'
    }, { status: 400 });
  }
  try {
    const amountBig = BigInt(rawAmount.toString().replace(/n$/, ''));
    const minRequired = BigInt('10000000000000000'); // 0.01 USDT with 18 decimals
    if (amountBig < minRequired) {
      return Response.json({
        error: 'Insufficient micropayment amount: required at least 0.01 USDT (10000000000000000 wei).',
        requiredAmount: '10000000000000000',
        receivedAmount: rawAmount.toString()
      }, { status: 402 });
    }
  } catch (_) {
    return Response.json({ error: 'Invalid micropayment amount: must be valid numeric wei.' }, { status: 400 });
  }

  // 4. Mandatory Recipient Verification (strictly MERCHANT_WALLET, never defaulted)
  const payTo = paymentPayload.payTo || paymentPayload.to || authObj.payTo || authObj.to;
  if (!payTo) {
    return Response.json({
      error: `Missing required field: payTo. Authorization must be addressed to merchant (${MERCHANT_WALLET}).`,
      expectedRecipient: MERCHANT_WALLET
    }, { status: 400 });
  }
  if (payTo.toLowerCase() !== MERCHANT_WALLET.toLowerCase()) {
    return Response.json({
      error: `Recipient mismatch: expected ${MERCHANT_WALLET}, got ${payTo}`,
      expectedRecipient: MERCHANT_WALLET
    }, { status: 400 });
  }

  // 5. Mandatory Deadline Verification (strictly validBefore > current unix timestamp, never defaulted)
  const validBefore = paymentPayload.validBefore ?? authObj.validBefore;
  if (validBefore === undefined || validBefore === null || validBefore === '') {
    return Response.json({
      error: 'Missing required field: validBefore. Authorization deadline must be specified.',
    }, { status: 400 });
  }
  const nowUnix = Math.floor(Date.now() / 1000);
  if (Number(validBefore) <= nowUnix) {
    return Response.json({
      error: `EIP-3009 transfer authorization expired (validBefore ${validBefore} <= current time ${nowUnix}).`,
      validBefore,
      currentTime: nowUnix
    }, { status: 400 });
  }

  // Validate validAfter if provided
  const validAfter = paymentPayload.validAfter ?? authObj.validAfter;
  if (validAfter !== undefined && validAfter !== null && Number(validAfter) > nowUnix) {
    return Response.json({
      error: `EIP-3009 transfer authorization not yet valid (validAfter ${validAfter} > current time ${nowUnix}).`,
      validAfter,
      currentTime: nowUnix
    }, { status: 400 });
  }

  // 6. Mandatory Nonce Verification & Replay Protection (never defaulted)
  const nonce = paymentPayload.nonce || authObj.nonce || paymentPayload.paymentId;
  if (!nonce) {
    return Response.json({
      error: 'Missing required field: nonce. Replay protection nonce required.',
    }, { status: 400 });
  }
  if (spentNonces.has(nonce)) {
    return Response.json({
      error: `Replay attack detected: authorization nonce ${nonce} has already been spent.`,
      nonce
    }, { status: 409 });
  }

  // 7. Fail-Closed Demo Signature Enforcement
  const isDemoPayload = paymentPayload.demoMode === true || authObj.demoMode === true;
  if (isDemoPayload) {
    if (process.env.ALLOW_DEMO_SIGNATURES !== 'true') {
      return Response.json({
        error: 'Demo payment signatures rejected. Production BSC Mainnet settlement required.',
        mode: 'PRODUCTION_ENFORCED'
      }, { status: 403 });
    }
  }

  // 8. Cryptographic EIP-3009 Signature Verification (when running in production)
  const signature = paymentPayload.signature || authObj.signature;
  const signerAddress = paymentPayload.from || authObj.from || paymentPayload.signedBy || authObj.signedBy;
  if (!isDemoPayload) {
    if (!signature) {
      return Response.json({
        error: 'Missing required field: cryptographic signature for EIP-3009 transfer authorization.',
      }, { status: 400 });
    }
    if (!signerAddress || !/^0x[a-fA-F0-9]{40}$/.test(signerAddress)) {
      return Response.json({
        error: 'Missing or invalid signer address (from) for EIP-3009 transfer authorization.',
      }, { status: 400 });
    }

    try {
      const cleanNonce = nonce.replace(/-/g, '');
      const formattedNonce = cleanNonce.startsWith('0x') && cleanNonce.length === 66 
        ? cleanNonce 
        : `0x${cleanNonce.padEnd(64, '0').slice(0, 64)}`;

      const isVerified = await verifyTypedData({
        address: signerAddress,
        domain: {
          name: 'Tether USD',
          version: '1',
          chainId: 56,
          verifyingContract: USDT_BSC
        },
        types: {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' }
          ]
        },
        primaryType: 'TransferWithAuthorization',
        message: {
          from: signerAddress,
          to: MERCHANT_WALLET,
          value: BigInt(rawAmount.toString().replace(/n$/, '')),
          validAfter: BigInt(validAfter || 0),
          validBefore: BigInt(validBefore),
          nonce: formattedNonce
        },
        signature: signature
      });

      if (!isVerified) {
        return Response.json({
          error: 'EIP-3009 cryptographic signature verification failed for BSC USDT.',
          signer: signerAddress
        }, { status: 401 });
      }
    } catch (verErr) {
      return Response.json({
        error: `EIP-3009 signature verification error: ${verErr.message}`,
        signer: signerAddress
      }, { status: 401 });
    }
  }

  // Record nonce in replay protection set
  spentNonces.add(nonce);
  if (spentNonces.size > 10000) {
    const firstItem = spentNonces.values().next().value;
    spentNonces.delete(firstItem);
  }

  // Verified Payment Signature — Unlock Premium Alpha Feed
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
