import crypto from 'crypto';
import { BSC_RWA_TOKENS } from '../../../services/tokens';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';
const DEMO_WALLET = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

export async function POST(req) {
  try {
    const { ticker, amountUsd } = await req.json();

    const targetToken = BSC_RWA_TOKENS[ticker];
    if (!targetToken) {
      return Response.json({ success: false, error: `Unknown token ticker: ${ticker}` }, { status: 400 });
    }

    const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;
    const toToken = targetToken.contractAddress;
    const amountBigInt = (BigInt(Math.floor(amountUsd)) * 10n ** 18n).toString();

    const queryParams = new URLSearchParams({
      binanceChainId: '56',
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: amountBigInt,
      userWalletAddress: DEMO_WALLET
    });

    const timestamp = new Date().toISOString();
    const requestPath = `/build/api/v1/dex/aggregator/quote?${queryParams.toString()}`;
    const preHash = timestamp + 'GET' + requestPath + '';

    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(preHash)
      .digest('base64');

    const url = `${BASE_URL}/api/v1/dex/aggregator/quote?${queryParams.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-OC-APIKEY': API_KEY,
        'X-OC-TIMESTAMP': timestamp,
        'X-OC-SIGN': signature,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();

    if (data.code === 0 && data.data && data.data.length > 0) {
      const best = data.data.find(r => r.isBest) || data.data[0];
      const toAmount = Number(BigInt(best.toTokenAmount) / 10n ** 14n) / 10000;
      const unitPrice = parseFloat(best.toToken?.tokenUnitPrice || (amountUsd / toAmount).toFixed(2));

      return Response.json({
        success: true,
        ticker,
        symbol: targetToken.symbol,
        contractAddress: toToken,
        quoteId: best.quoteId,
        vendor: best.vendorName,
        executionMode: best.executionMode,
        fromAmountUsd: amountUsd,
        toAmountTokens: toAmount,
        unitPriceUsd: unitPrice,
        estimatedGas: best.estimateGasFee,
        dexRouters: best.dexRouterList?.map(r => r.dexProtocol?.dexName) || ['PancakeSwap']
      });
    }

    return Response.json({
      success: false,
      ticker,
      msg: data.msg || 'No route found',
      raw: data
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
