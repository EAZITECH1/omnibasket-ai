import crypto from 'crypto';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';

async function testAuth() {
  console.log('🔑 Testing Binance Web3 API Authentication...');
  console.log('API Key:', API_KEY);

  const timestamp = new Date().toISOString();
  const requestPath = '/build/api/v1/dex/aggregator/supported/chain';
  const preHash = timestamp + 'GET' + requestPath + '';

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(preHash)
    .digest('base64');

  const url = `${BASE_URL}/api/v1/dex/aggregator/supported/chain`;

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
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

testAuth();
