import crypto from 'crypto';
import { BSC_RWA_TOKENS } from './services/tokens.js';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';
const USER_WALLET = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

function signRequest(method, path, body = '') {
  const timestamp = new Date().toISOString();
  const preHash = timestamp + method.toUpperCase() + path + body;
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(preHash)
    .digest('base64');
  return {
    'X-OC-APIKEY': API_KEY,
    'X-OC-TIMESTAMP': timestamp,
    'X-OC-SIGN': signature,
    'Accept': 'application/json'
  };
}

async function testLeg(ticker, usdAmount) {
  const token = BSC_RWA_TOKENS[ticker];
  if (!token) throw new Error(`Unknown ticker: ${ticker}`);

  const amountWei = (BigInt(Math.floor(usdAmount)) * 10n ** 18n).toString();
  const quoteParams = new URLSearchParams({
    binanceChainId: '56',
    fromTokenAddress: BSC_RWA_TOKENS.USDT.contractAddress,
    toTokenAddress: token.contractAddress,
    amount: amountWei,
    userWalletAddress: USER_WALLET
  });

  const quotePath = `/build/api/v1/dex/aggregator/quote?${quoteParams.toString()}`;
  const quoteRes = await fetch(`${BASE_URL}/api/v1/dex/aggregator/quote?${quoteParams.toString()}`, {
    headers: signRequest('GET', quotePath)
  });
  const quoteData = await quoteRes.json();
  if (quoteData.code !== 0 || !quoteData.data?.[0]) {
    console.error(`Quote failed for ${ticker}:`, quoteData);
    return { ticker, success: false, error: quoteData.msg };
  }

  const quote = quoteData.data[0];
  console.log(`[${ticker}] Quote OK: ${quote.toTokenAmount} (QuoteID: ${quote.quoteId}, Router: ${quote.vendorName})`);

  // Now call swap to get tx
  const swapParams = new URLSearchParams({
    quoteId: quote.quoteId,
    binanceChainId: '56',
    fromTokenAddress: BSC_RWA_TOKENS.USDT.contractAddress,
    toTokenAddress: token.contractAddress,
    amount: amountWei,
    userWalletAddress: USER_WALLET,
    slippagePercent: '0.5'
  });

  const swapPath = `/build/api/v1/dex/aggregator/swap?${swapParams.toString()}`;
  const swapRes = await fetch(`${BASE_URL}/api/v1/dex/aggregator/swap?${swapParams.toString()}`, {
    headers: signRequest('GET', swapPath)
  });
  const swapData = await swapRes.json();
  if (swapData.code !== 0 || !swapData.data?.tx) {
    console.error(`Swap build failed for ${ticker}:`, swapData);
    return { ticker, success: false, error: swapData.msg, swapData };
  }

  const tx = swapData.data.tx;
  console.log(`[${ticker}] Swap TX built: To=${tx.to}, Value=${tx.value}, DataLen=${tx.data?.length}`);

  // Now simulate transaction
  const simPath = '/build/api/v1/dex/pre-transaction/simulate';
  const simPayload = {
    binanceChainId: '56',
    evmTx: {
      from: USER_WALLET,
      to: tx.to,
      data: tx.data,
      value: tx.value || '0'
    }
  };
  const simBody = JSON.stringify(simPayload);
  const simRes = await fetch(`${BASE_URL}/api/v1/dex/pre-transaction/simulate`, {
    method: 'POST',
    headers: { ...signRequest('POST', simPath, simBody), 'Content-Type': 'application/json' },
    body: simBody
  });
  const simData = await simRes.json();
  console.log(`[${ticker}] Simulation: status=${simData.data?.status || simData.msg}`);

  return {
    ticker,
    success: simData.code === 0 && simData.data?.status === 'SUCCESS',
    quoteId: quote.quoteId,
    vendor: quote.vendorName,
    txTo: tx.to,
    simulation: simData.data
  };
}

async function run() {
  console.log('Testing Multi-Leg Quote + Swap + Simulate Pipeline:');
  const results = [];
  results.push(await testLeg('USDY', 10));
  results.push(await testLeg('NVDA', 10));
  console.log('\nPipeline Summary:\n', JSON.stringify(results, null, 2));
}

run();
