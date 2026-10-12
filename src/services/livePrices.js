/**
 * Live Market Price Engine
 * Fetches real-time market prices for BNB (Binance API) and Tokenized Stocks (Yahoo Finance API).
 * In-memory TTL cache (30 seconds) for high throughput and instantaneous API responses.
 */

const CACHE_TTL_MS = 30000; // 30 seconds

let priceCache = {
  timestamp: 0,
  prices: {
    USDT: 1.0,
    BNB: 753.0,
    NVDA: 229.28,
    AAPL: 336.64,
    MSFT: 535.07,
    TSLA: 382.70,
    GOOG: 347.86,
    USDY: 1.16,
    MAG7X: 100.0,
    AI: 100.0
  }
};

export async function getLivePrices() {
  const now = Date.now();
  if (now - priceCache.timestamp < CACHE_TTL_MS && priceCache.timestamp > 0) {
    return priceCache.prices;
  }

  const updated = { ...priceCache.prices };

  // 1. Fetch live BNB price from Binance public ticker API
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.price) {
        updated.BNB = parseFloat(parseFloat(data.price).toFixed(2));
      }
    }
  } catch (err) {
    // Keep cached BNB price
  }

  // 2. Fetch live stock prices
  const stockTickers = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'GOOG'];
  await Promise.all(
    stockTickers.map(async (ticker) => {
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          next: { revalidate: 30 }
        });
        if (res.ok) {
          const data = await res.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (typeof price === 'number' && price > 0) {
            updated[ticker] = parseFloat(price.toFixed(2));
          }
        }
      } catch (_) {
        // Keep cached stock price
      }
    })
  );

  priceCache = {
    timestamp: now,
    prices: updated
  };

  return updated;
}

export function getCachedPrices() {
  return priceCache.prices;
}
