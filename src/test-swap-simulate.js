import crypto from 'crypto';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';

const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';
const BSC_USDY = '0x608593d17a2decbbc4399e4185be4922f97ed32e';
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

async function testSwapAndSimulate() {
  const quoteParams = new URLSearchParams({
    binanceChainId: '56',
    fromTokenAddress: BSC_USDT,
    toTokenAddress: BSC_USDY,
    amount: '10000000000000000000',
    userWalletAddress: USER_WALLET
  });

  const quoteRes = await fetch(`${BASE_URL}/api/v1/dex/aggregator/quote?${quoteParams.toString()}`, {
    headers: signRequest('GET', `/build/api/v1/dex/aggregator/quote?${quoteParams.toString()}`)
  });
  const quoteData = await quoteRes.json();
  const quote = quoteData.data[0];

  const swapParams = new URLSearchParams({
    quoteId: quote.quoteId,
    binanceChainId: '56',
    fromTokenAddress: BSC_USDT,
    toTokenAddress: BSC_USDY,
    amount: '10000000000000000000',
    userWalletAddress: USER_WALLET,
    slippagePercent: '0.5'
  });

  const swapRes = await fetch(`${BASE_URL}/api/v1/dex/aggregator/swap?${swapParams.toString()}`, {
    headers: signRequest('GET', `/build/api/v1/dex/aggregator/swap?${swapParams.toString()}`)
  });
  const swapData = await swapRes.json();

  console.log('Swap Tx Target:', swapData.data?.tx?.to);

  const simulatePath = '/build/api/v1/dex/pre-transaction/simulate';
  const simBody = JSON.stringify({
    binanceChainId: '56',
    evmParams: {
      from: USER_WALLET,
      to: swapData.data?.tx?.to,
      data: swapData.data?.tx?.data,
      value: swapData.data?.tx?.value || '0'
    }
  });

  const simHeaders = signRequest('POST', simulatePath, simBody);
  const simRes = await fetch(`${BASE_URL}/api/v1/dex/pre-transaction/simulate`, {
    method: 'POST',
    headers: { ...simHeaders, 'Content-Type': 'application/json' },
    body: simBody
  });

  const simData = await simRes.json();
  console.log('Simulation response:', JSON.stringify(simData, null, 2));
}

testSwapAndSimulate();
