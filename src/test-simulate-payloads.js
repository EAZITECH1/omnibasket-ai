import crypto from 'crypto';

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

async function trySimulate(label, payload) {
  const path = '/build/api/v1/dex/pre-transaction/simulate';
  const body = JSON.stringify(payload);
  const headers = signRequest('POST', path, body);
  const res = await fetch(`${BASE_URL}/api/v1/dex/pre-transaction/simulate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body
  });
  const data = await res.json();
  console.log(`[${label}] Response:`, data.code, data.msg, data.data ? 'DATA OK' : '');
  if (data.data) console.log(JSON.stringify(data.data, null, 2));
}

async function run() {
  // Test format A: evmParams as object with evmTx
  await trySimulate('Format A: evmTx inside evmParams', {
    binanceChainId: '56',
    evmParams: {
      from: USER_WALLET,
      to: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5',
      data: '0x',
      value: '0'
    }
  });

  // Test format B: evmTx as key
  await trySimulate('Format B: evmTx direct', {
    binanceChainId: '56',
    evmTx: {
      from: USER_WALLET,
      to: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5',
      data: '0x',
      value: '0'
    }
  });

  // Test format C: evmParams as array
  await trySimulate('Format C: evmParams as array', {
    binanceChainId: '56',
    evmParams: [{
      from: USER_WALLET,
      to: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5',
      data: '0x',
      value: '0'
    }]
  });
}

run();
