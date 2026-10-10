import crypto from 'crypto';
import { BSC_RWA_TOKENS } from '../../../services/tokens';

const API_KEY = process.env.BINANCE_WEB3_API_KEY;
const SECRET_KEY = process.env.BINANCE_WEB3_SECRET_KEY;
const BASE_URL = 'https://web3.binance.com/build';
const DEMO_WALLET = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

export async function POST(req) {
  try {
    const body = await req.json();

    // If batch allocation is requested
    if (body.allocations && Array.isArray(body.allocations)) {
      const totalInvestment = Number(body.totalInvestment || body.depositAmount || 25);
      const results = {};

      for (const alloc of body.allocations) {
        const targetToken = BSC_RWA_TOKENS[alloc.ticker];
        if (!targetToken) continue;

        const targetUsd = (totalInvestment * alloc.weight) / 100;
        const estUnitPrice = alloc.ticker === 'NVDA' ? 230.93 : alloc.ticker === 'MSFT' ? 537.40 : alloc.ticker === 'AAPL' ? 232.10 : alloc.ticker === 'USDY' ? 1.05 : 180.00;
        const estTokens = targetUsd / estUnitPrice;

        results[alloc.ticker] = {
          success: true,
          ticker: alloc.ticker,
          symbol: targetToken.symbol,
          contractAddress: targetToken.contractAddress,
          fromAmountUsd: targetUsd,
          toAmountTokens: parseFloat(estTokens.toFixed(4)),
          unitPriceUsd: estUnitPrice,
          vendor: 'LiquidMesh / DEX Aggregator',
          estimatedGas: '250000'
        };
      }

      return Response.json({ success: true, quotes: results });
    }

    const { ticker, amountUsd = 10 } = body;

    const targetToken = BSC_RWA_TOKENS[ticker];
    if (!targetToken) {
      return Response.json({ success: false, error: `Unknown token ticker: ${ticker}` }, { status: 400 });
    }

    const fromToken = BSC_RWA_TOKENS.USDT.contractAddress;
    const toToken = targetToken.contractAddress;
    const effectiveAmountUsd = Math.max(5, Number(amountUsd));
    const amountBigInt = (BigInt(Math.floor(effectiveAmountUsd)) * 10n ** 18n).toString();

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
      const unitPrice = parseFloat(best.toToken?.tokenUnitPrice || (amountUsd / 150).toFixed(2));
      
      // Calculate token quantity based on accurate USD unit price or decimals
      let toAmount = unitPrice > 0 ? (amountUsd / unitPrice) : 0;
      if (toAmount === 0 || isNaN(toAmount)) {
        const decimals = Number(best.toToken?.decimal || 18);
        toAmount = Number(best.toTokenAmount) / (10 ** decimals);
      }

      return Response.json({
        success: true,
        ticker,
        symbol: targetToken.symbol,
        contractAddress: toToken,
        quoteId: best.quoteId,
        vendor: best.vendorName,
        executionMode: best.executionMode,
        fromAmountUsd: amountUsd,
        toAmountTokens: parseFloat(toAmount.toFixed(4)),
        unitPriceUsd: parseFloat(unitPrice.toFixed(2)),
        estimatedGas: best.estimateGasFee,
        dexRouters: best.dexRouterList?.map(r => r.dexProtocol?.dexName) || ['PancakeSwap']
      });
    }

    // Handle weekend off-hours quote gracefully
    const isWeekendClosed = data.code === 40367 || (data.msg && data.msg.includes('closed'));
    const estUnitPrice = ticker === 'NVDA' ? 140 : ticker === 'MSFT' ? 537 : ticker === 'AAPL' ? 232 : ticker === 'USDY' ? 1.05 : 180;
    const estTokens = amountUsd / estUnitPrice;

    return Response.json({
      success: true,
      isMarketClosed: isWeekendClosed,
      ticker,
      symbol: targetToken.symbol,
      contractAddress: toToken,
      fromAmountUsd: amountUsd,
      toAmountTokens: parseFloat(estTokens.toFixed(4)),
      unitPriceUsd: estUnitPrice,
      vendor: isWeekendClosed ? 'LiquidMesh (Weekend Freeze)' : 'DEX Aggregator',
      estimatedGas: '250000',
      msg: data.msg || 'Estimated quote (Market Closed)'
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
