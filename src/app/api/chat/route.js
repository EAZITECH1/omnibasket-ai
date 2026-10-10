import { BSC_RWA_TOKENS, PRESET_BASKETS } from '../../../services/tokens';
import { getMarketHoursStatus } from '../../../services/marketHours';

const TICKER_SYNONYMS = {
  NVDA: ['nvda', 'nvidia', 'nvdaon', 'chip', 'chips', 'compute'],
  AAPL: ['aapl', 'apple', 'aaplon', 'iphone', 'mac'],
  MSFT: ['msft', 'microsoft', 'msfton', 'cloud', 'azure'],
  GOOG: ['goog', 'googl', 'google', 'alphabet', 'googon', 'search'],
  TSLA: ['tsla', 'tesla', 'tslaon', 'ev', 'musk'],
  USDY: ['usdy', 'ondo', 'treasury', 'yield', 'bonds', 'cash', 't-bill', 't-bills'],
  MAG7X: ['mag7', 'mag7x', 'magnificent 7', 'mag 7', 'magnificent seven']
};

export async function POST(req) {
  try {
    const { message, model = 'omnibasket-neuro', apiKey } = await req.json();
    const userPrompt = (message || '').trim();
    const lower = userPrompt.toLowerCase();
    const marketStatus = getMarketHoursStatus();

    const activeGeminiKey = apiKey || process.env.GEMINI_API_KEY;
    const activeOpenAiKey = apiKey || process.env.OPENAI_API_KEY;

    // 1. Try Gemini API if requested or if key is provided
    if ((model.startsWith('gemini') || activeGeminiKey) && activeGeminiKey && !model.startsWith('gpt')) {
      try {
        const modelName = model.includes('pro') ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${activeGeminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `You are OmniBasket AI, an autonomous portfolio agent on BNB Smart Chain (BSC #56).
Supported BSC Tokens:
- NVDA: NVIDIA Corporation (bStock, 24/7 AMM on BSC)
- AAPL: Apple Inc. (bStock, 24/7 AMM on BSC)
- MSFT: Microsoft Corporation (bStock, 24/7 AMM on BSC)
- GOOG: Alphabet Inc. (bStock)
- TSLA: Tesla Inc. (bStock)
- USDY: Ondo US Dollar Yield (5.10% APY US Treasury Bill)
- MAG7X: Magnificent 7 Thematic Index (xStock)

User Message: "${userPrompt}"

Analyze user intent. If they want a basket, output JSON with:
{
  "reply": "Clear concise explanation of strategy",
  "basket": {
    "name": "Strategy Name",
    "description": "Brief description",
    "allocations": [
      {"ticker": "NVDA", "weight": 50},
      {"ticker": "MSFT", "weight": 50}
    ]
  }
}
Weights MUST sum to 100.
If they ask an informational or technical question, provide a concise markdown reply and set "basket": null.
Return ONLY valid JSON.`
                  }
                ]
              }
            ],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        const geminiData = await geminiRes.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return Response.json({
            type: parsed.basket ? 'BASKET_SUGGESTION' : 'INFO',
            reply: parsed.reply,
            basket: parsed.basket ? {
              id: `gemini-${Date.now()}`,
              name: parsed.basket.name || 'AI Custom Strategy',
              description: parsed.basket.description || 'Constructed via Gemini Intelligence',
              badge: 'Gemini AI 🤖',
              allocations: parsed.basket.allocations
            } : null,
            marketStatus,
            modelUsed: modelName
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini inference fallback:', geminiErr.message);
      }
    }

    // 2. Try OpenAI API if requested
    if (model.startsWith('gpt') && activeOpenAiKey) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeOpenAiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: `You are OmniBasket AI on BNB Smart Chain (BSC #56). Supported tokens: NVDA, AAPL, MSFT, GOOG, TSLA, USDY (5.1% APY Ondo), MAG7X. Output JSON with "reply" and "basket" (name, description, allocations with ticker & weight summing to 100, or null if informational).`
              },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
          })
        });
        const openaiData = await openaiRes.json();
        const content = openaiData.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return Response.json({
            type: parsed.basket ? 'BASKET_SUGGESTION' : 'INFO',
            reply: parsed.reply,
            basket: parsed.basket ? {
              id: `openai-${Date.now()}`,
              name: parsed.basket.name || 'OpenAI Custom Strategy',
              description: parsed.basket.description || 'Constructed via OpenAI Intelligence',
              badge: 'GPT-4o 🧠',
              allocations: parsed.basket.allocations
            } : null,
            marketStatus,
            modelUsed: model
          });
        }
      } catch (err) {
        console.warn('OpenAI fallback:', err.message);
      }
    }

    // 3. Intelligent Built-in Financial Reasoning Engine (OmniBasket Neuro)
    // A. Market hours / Weekend Sentinel queries
    if (lower.includes('weekend') || lower.includes('hour') || lower.includes('open') || lower.includes('close') || lower.includes('freeze') || lower.includes('tradfi')) {
      return Response.json({
        type: 'MARKET_HOURS',
        reply: `🕒 **TradFi Market Clock**: ${marketStatus.session} (NYSE ${marketStatus.nyTime}).\n\n${marketStatus.message}\n\n**On BNB Smart Chain**, tokenized stocks (bStocks & Ondo USDY) trade 24/7 across weekends through LiquidMesh & PancakeSwap AMM pools without waiting for Monday morning.`,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // B. Single Ticker Inquiries
    if ((lower.includes('what is') || lower.includes('tell me about') || lower.includes('info on') || lower.includes('explain')) && !lower.includes('%')) {
      if (lower.includes('usdy') || lower.includes('ondo') || lower.includes('yield') || lower.includes('treasury')) {
        return Response.json({
          type: 'INFO',
          reply: `🏦 **Ondo US Dollar Yield (USDY)** on BNB Smart Chain:\n• **Type**: Tokenized US Treasury Bill (RWA)\n• **Current APY**: **5.10%** institutional yield paid on-chain\n• **BSC Address**: \`0x55d398326f99059ff775485246999027b3197955\`\n• **Advantage**: Core defensive anchor in volatile markets. Trades 24/7 with zero lockup on PancakeSwap.`,
          marketStatus,
          modelUsed: 'OmniBasket Neuro ⚡'
        });
      }
      if (lower.includes('nvda') || lower.includes('nvidia')) {
        return Response.json({
          type: 'INFO',
          reply: `🔥 **NVIDIA Corporation (NVDAon)** on BNB Smart Chain:\n• **Type**: Tokenized Equities (bStock / Backed Finance)\n• **Underlying**: NVIDIA Corp Common Stock (NASDAQ: NVDA)\n• **BSC Address**: \`0xa9ee28c80f960b889dfbd1902055218cba016f75\`\n• **24/7 Liquidity**: LiquidMesh & PancakeSwap AMM pools allow continuous swaps even on weekends.`,
          marketStatus,
          modelUsed: 'OmniBasket Neuro ⚡'
        });
      }
      if (lower.includes('msft') || lower.includes('microsoft')) {
        return Response.json({
          type: 'INFO',
          reply: `💻 **Microsoft Corporation (MSFTon)** on BNB Smart Chain:\n• **Type**: Tokenized Equities (bStock)\n• **Underlying**: Microsoft Corp (NASDAQ: MSFT)\n• **BSC Address**: \`0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3\`\n• **Role**: Core cloud & enterprise AI exposure with institutional backing.`,
          marketStatus,
          modelUsed: 'OmniBasket Neuro ⚡'
        });
      }
    }

    // C. Check for Explicit Tickers & Percentages (Dynamic Strategy Construction)
    const detected = [];
    for (const [ticker, synonyms] of Object.entries(TICKER_SYNONYMS)) {
      const isPresent = synonyms.some(syn => lower.includes(syn));
      if (isPresent) {
        let weight = null;
        for (const syn of synonyms) {
          const regex1 = new RegExp(`(\\d{1,3})%?\\s*(?:of)?\\s*${syn}`, 'i');
          const regex2 = new RegExp(`${syn}\\s*[:=]?\\s*(\\d{1,3})%?`, 'i');
          const match = lower.match(regex1) || lower.match(regex2);
          if (match) {
            weight = parseInt(match[1], 10);
            break;
          }
        }
        detected.push({ ticker, weight });
      }
    }

    if (detected.length >= 2) {
      let finalAllocations = [];
      const hasExplicitWeights = detected.some(d => d.weight !== null);

      if (hasExplicitWeights) {
        const specifiedTotal = detected.reduce((sum, d) => sum + (d.weight || 0), 0);
        const unweightedCount = detected.filter(d => d.weight === null).length;
        const remainder = Math.max(0, 100 - specifiedTotal);
        const defaultWeight = unweightedCount > 0 ? Math.floor(remainder / unweightedCount) : 0;

        finalAllocations = detected.map(d => ({
          ticker: d.ticker,
          weight: d.weight !== null ? d.weight : defaultWeight
        }));

        const totalSum = finalAllocations.reduce((s, a) => s + a.weight, 0);
        if (totalSum !== 100 && totalSum > 0) {
          finalAllocations[0].weight += (100 - totalSum);
        }
      } else {
        const equalWeight = Math.floor(100 / detected.length);
        const remainder = 100 - equalWeight * detected.length;
        finalAllocations = detected.map((d, idx) => ({
          ticker: d.ticker,
          weight: idx === 0 ? equalWeight + remainder : equalWeight
        }));
      }

      const customBasket = {
        id: `custom-${Date.now()}`,
        name: `Custom ${detected.map(d => d.ticker).join('/')} Basket`,
        description: `Custom multi-asset portfolio compiled on BNB Smart Chain`,
        badge: 'Custom Strategy 🤖',
        allocations: finalAllocations
      };

      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `✨ Compiled custom strategy: **${finalAllocations.map(a => `${a.weight}% ${a.ticker}`).join(', ')}**.\n\nI've calculated the BSC routing. You can test quotes or simulate allocation now.`,
        basket: customBasket,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // D. Presets Trigger
    if (lower.includes('ai supercycle') || lower.includes('ai chips') || lower.includes('supercycle') || lower.includes('ai tech')) {
      const preset = PRESET_BASKETS[0];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `🚀 Loaded the **${preset.name}**: **50% NVDA, 30% MSFT, 20% AAPL**.\n\nTargets the core AI compute, cloud, and edge infrastructure on BSC with 24/7 continuous liquidity.`,
        basket: preset,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    if (lower.includes('defensive') || lower.includes('yield') || lower.includes('safe') || lower.includes('cash') || lower.includes('treasury')) {
      const preset = PRESET_BASKETS[1];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `🛡️ Loaded the **${preset.name}**: **40% Ondo USDY (5.1% APY Treasury Yield), 30% Apple, 30% Microsoft**.\n\nCombines institutional cash yield stability with resilient big-tech cash flows.`,
        basket: preset,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    if (lower.includes('hybrid') || (lower.includes('nvda') && lower.includes('usdy'))) {
      const preset = PRESET_BASKETS[2];
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `⚡ Loaded the **${preset.name}**: **50% NVDA, 50% Ondo USDY**.\n\nBalanced blend of high-growth AI compute exposure paired with 5.10% US Treasury yield.`,
        basket: preset,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    if (lower.includes('mag') || lower.includes('magnificent') || lower.includes('seven')) {
      const customBasket = {
        id: 'mag7-composite',
        name: 'Magnificent 7 Composite',
        description: 'Top US megacap leaders on BSC',
        badge: 'Megacap ⚡',
        allocations: [
          { ticker: 'NVDA', weight: 35 },
          { ticker: 'MSFT', weight: 35 },
          { ticker: 'AAPL', weight: 30 }
        ]
      };
      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `⚡ Loaded the **Magnificent 7 Composite**: **35% NVDA, 35% MSFT, 30% AAPL**.\n\nMegacap technology leaders with 24/7 on-chain BSC liquidity routing.`,
        basket: customBasket,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // E. Educational & Concept Guidance
    if (lower.includes('simulation') || lower.includes('dry run') || lower.includes('safety') || lower.includes('revert')) {
      return Response.json({
        type: 'INFO',
        reply: `🛡️ **Pre-Transaction Simulation Guard**: OmniBasket AI calls Binance Web3's simulation endpoint (\`/dex/pre-transaction/simulate\`) to dry-run trades in an EVM sandbox against current BSC state before broadcasting. This guarantees zero-revert execution with **$0 gas lost**.`,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    if (lower.includes('x402') || lower.includes('micropayment') || lower.includes('paywall') || lower.includes('bounty') || lower.includes('agent studio')) {
      return Response.json({
        type: 'INFO',
        reply: `⚡ **x402 Micropayment Protocol (BNB Agent Studio)**:\nPaywalls institutional RWA momentum signals behind HTTP 402 Payment Required.\nThe autonomous sentinel previews via \`baw x402-payment preview\` and signs EIP-3009 transfer authorizations for 0.01 USDT on BSC.`,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    return Response.json({
      type: 'INFO',
      reply: `👋 **OmniBasket AI Strategy Engine** online.\n\nTry prompts like:\n• *"Build an AI chips basket with 60% Nvidia and 40% Microsoft"*\n• *"Create a defensive yield portfolio with 50% Ondo USDY and 50% Apple"*\n• *"What is Ondo USDY on BSC?"*\n• *"How does 24/7 weekend trading work when NYSE closes?"*\n• *"Explain pre-transaction simulation on BSC"*`,
      marketStatus,
      modelUsed: 'OmniBasket Neuro ⚡'
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
