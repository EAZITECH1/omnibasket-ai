import crypto from 'crypto';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';

// BSC Mainnet addresses
const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955'; // USDT on BSC (18 decimals)
const BSC_USDY = '0x608593d17a2decbbc4399e4185be4922f97ed32e'; // Ondo USDY on BSC
const USER_WALLET = '0xB635a5eAe16695910C75be147f7676b546441d72';

async function testQuote() {
  console.log('📈 Testing Binance Web3 Quote for Tokenized Stock on BSC (10 USDT)...');

  const queryParams = new URLSearchParams({
    binanceChainId: '56',
    fromTokenAddress: BSC_USDT,
    toTokenAddress: BSC_USDY,
    amount: '10000000000000000000', // 10 USDT (meets >= 5 USD minimum)
    userWalletAddress: USER_WALLET
  });

  const timestamp = new Date().toISOString();
  const requestPath = `/build/api/v1/dex/aggregator/quote?${queryParams.toString()}`;
  const preHash = timestamp + 'GET' + requestPath + '';

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(preHash)
    .digest('base64');

  const url = `${BASE_URL}/api/v1/dex/aggregator/quote?${queryParams.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-OC-APIKEY': API_KEY,
        'X-OC-TIMESTAMP': timestamp,
        'X-OC-SIGN': signature,
        'Accept': 'application/json'
      }
    });

    console.log('HTTP Status:', res.status, res.statusText);
    const json = await res.json();
    console.log('Quote Result:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Quote request failed:', err.message);
  }
}

testQuote();
