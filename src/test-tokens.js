/**
 * OmniBasket AI - Tokenized Stock Discovery Script
 * Queries Ondo & bStocks tokenized stocks available on BNB Smart Chain (Chain ID: 56).
 */

async function fetchTokenizedStocks() {
  const url = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=1';
  
  console.log('🔍 Fetching tokenized stocks from Binance Web3 RWA API...');
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept-Encoding': 'identity',
        'User-Agent': 'binance-web3/1.1 (Skill)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.data)) {
      console.error('Unexpected response format:', data);
      return;
    }

    // Filter tokens for BNB Smart Chain (chainId: "56")
    const bscTokens = data.data.filter(t => t.chainId === '56');

    console.log(`\n✅ Successfully retrieved ${bscTokens.length} tokenized stocks on BNB Smart Chain (BSC):\n`);
    console.table(
      bscTokens.slice(0, 15).map(t => ({
        Ticker: t.ticker,
        Symbol: t.symbol,
        ContractAddress: t.contractAddress,
        Multiplier: t.multiplier,
        Decimals: t.d
      }))
    );

    console.log(`\n💡 Tip: Notice baskets like MAG7Xon (Magnificent 7) and AIon (AI Basket) are already available on BSC!`);
  } catch (error) {
    console.error('❌ Failed to fetch tokenized stocks:', error.message);
  }
}

fetchTokenizedStocks();
