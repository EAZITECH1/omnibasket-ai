import { BSC_RWA_TOKENS, PRESET_BASKETS } from '../../../services/tokens';
import { getMarketHoursStatus } from '../../../services/marketHours';

export async function POST(req) {
  try {
    const { message } = await req.json();
    const lower = (message || '').toLowerCase();

    const marketStatus = getMarketHoursStatus();

    // 1. Check for Weekend / Market Hours query
    if (lower.includes('weekend') || lower.includes('hour') || lower.includes('open') || lower.includes('close') || lower.includes('freeze')) {
      return Response.json({
        type: 'MARKET_HOURS',
        reply: `🕒 **TradFi Status**: ${marketStatus.session} (NY Time: ${marketStatus.nyTime}).\n\n${marketStatus.message}\n\nOn **BNB Smart Chain**, OmniBasket AI continues trading tokenized stocks around the clock without waiting for Monday's opening bell.`,
        marketStatus
      });
    }

    // 2. Check for Preset Basket triggers
    if (lower.includes('ai') && (lower.includes('chip') || lower.includes('supercycle') || lower.includes('basket'))) {
      const preset = PRESET_BASKETS[0];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `🚀 I've loaded the **${preset.name}** for you: **50% NVDA, 30% MSFT, 20% GOOG**.\n\nThis basket targets the core generative AI and compute stack on BSC. Ready to allocate or rebalance!`,
        basket: preset
      });
    }

    if (lower.includes('defensive') || lower.includes('yield') || lower.includes('safe') || lower.includes('ondo')) {
      const preset = PRESET_BASKETS[1];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `🛡️ I've loaded the **${preset.name}**: **40% Ondo USDY (5.1% APY Treasury Yield), 30% Apple, 30% Microsoft**.\n\nThis pairs cash yield stability with resilient big-tech growth.`,
        basket: preset
      });
    }

    if (lower.includes('mag') || lower.includes('magnificent') || lower.includes('seven')) {
      const preset = PRESET_BASKETS[2];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `⚡ I've loaded the **${preset.name}**: **100% MAG7Xon**.\n\nSingle-token composite exposure across Microsoft, Apple, Nvidia, Alphabet, Amazon, Meta, and Tesla on BSC.`,
        basket: preset
      });
    }

    // 3. Custom allocation parsing from plain English
    // Detect mentions of known tickers
    const mentionedTickers = [];
    const tickerKeys = Object.keys(BSC_RWA_TOKENS).filter(k => k !== 'USDT');

    for (const ticker of tickerKeys) {
      const aliases = [ticker.toLowerCase(), BSC_RWA_TOKENS[ticker].name.toLowerCase()];
      if (aliases.some(alias => lower.includes(alias))) {
        mentionedTickers.push(ticker);
      }
    }

    if (mentionedTickers.length >= 2) {
      // Equal split or detect percentage numbers
      const equalWeight = Math.floor(100 / mentionedTickers.length);
      const remainder = 100 - equalWeight * mentionedTickers.length;

      const customAllocations = mentionedTickers.map((t, idx) => ({
        ticker: t,
        weight: idx === 0 ? equalWeight + remainder : equalWeight
      }));

      const customBasket = {
        id: `custom-${Date.now()}`,
        name: `Custom ${mentionedTickers.join('/')} Basket`,
        description: `Custom basket built on BSC with ${mentionedTickers.join(', ')}`,
        badge: 'Custom AI 🤖',
        allocations: customAllocations
      };

      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `✨ Created a custom strategy for you: **${customAllocations.map(a => `${a.weight}% ${a.ticker}`).join(', ')}**.\n\nI've calculated the BSC routing. You can test quotes or simulate allocation now.`,
        basket: customBasket
      });
    }

    // Fallback general guidance
    return Response.json({
      type: 'INFO',
      reply: `👋 I am **OmniBasket AI**, your autonomous stock basket agent on BNB Smart Chain.\n\nYou can prompt me with commands like:\n• *"Build an AI chips basket with Nvidia, Microsoft, and Google"*\n• *"Create a defensive portfolio with Ondo USDY and Apple"*\n• *"How does weekend trading work when Wall Street is closed?"*\n• *"Load the Magnificent 7 index"*`,
      marketStatus
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
