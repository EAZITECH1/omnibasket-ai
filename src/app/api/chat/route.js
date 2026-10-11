import { execFile } from 'child_process';
import util from 'util';
import { BSC_RWA_TOKENS, PRESET_BASKETS } from '../../../services/tokens.js';
import { getMarketHoursStatus } from '../../../services/marketHours.js';
import { readBscBalances } from '../../../services/bscBalanceReader.js';

const execFilePromise = util.promisify(execFile);
const USDT_ADDRESS = BSC_RWA_TOKENS.USDT.contractAddress;

const TICKER_SYNONYMS = {
  NVDA: ['nvda', 'nvidia', 'nvdaon', 'chip', 'chips', 'compute'],
  AAPL: ['aapl', 'apple', 'aaplon', 'iphone', 'mac'],
  MSFT: ['msft', 'microsoft', 'msfton', 'cloud', 'azure'],
  GOOG: ['goog', 'googl', 'google', 'alphabet', 'googon', 'search'],
  TSLA: ['tsla', 'tesla', 'tslaon', 'ev', 'musk'],
  USDY: ['usdy', 'ondo', 'treasury', 'yield', 'bonds', 'cash', 't-bill', 't-bills'],
  MAG7X: ['mag7', 'mag7x', 'magnificent 7', 'mag 7', 'magnificent seven']
};

function resolveTicker(word) {
  if (!word) return null;
  const w = word.toLowerCase().trim();
  for (const [ticker, syns] of Object.entries(TICKER_SYNONYMS)) {
    if (syns.some(s => w === s || w.includes(s))) return ticker;
  }
  if (w.includes('usdt') || w.includes('tether') || w.includes('dollar') || w.includes('cash') || w.includes('stable')) return 'USDT';
  return null;
}

export async function POST(req) {
  try {
    const { message, model = 'omnibasket-neuro', apiKey, userAddress } = await req.json();
    const userPrompt = (message || '').trim();
    const lower = userPrompt.toLowerCase();
    const marketStatus = getMarketHoursStatus();

    const activeOpenAiKey = apiKey || process.env.OPENROUTER_API_KEY;
    const isOpenRouterKey = (apiKey && apiKey.startsWith('sk-or-')) || (!apiKey && !!process.env.OPENROUTER_API_KEY);
    const activeGeminiKey = process.env.GEMINI_API_KEY || null;

    // Read real user wallet state via BSC on-chain reader if connected extension address is provided
    let liveWallet = { connected: false, usdtBal: 0, bnbBal: 0, heldStocks: [], tokens: [] };
    if (userAddress && userAddress.startsWith('0x') && userAddress.length === 42) {
      try {
        const onchain = await readBscBalances(userAddress);
        if (onchain && onchain.success && Array.isArray(onchain.tokens)) {
          const usdtToken = onchain.tokens.find(t => t.symbol === 'USDT');
          const bnbToken = onchain.tokens.find(t => t.symbol === 'BNB');
          const usdtBal = usdtToken ? usdtToken.balance : 0;
          const bnbBal = bnbToken ? bnbToken.balance : 0;
          const heldStocks = onchain.tokens.filter(t => 
            t.symbol !== 'USDT' && t.symbol !== 'BNB' && t.balance > 0.000001
          );
          liveWallet = { connected: true, usdtBal, bnbBal, heldStocks, tokens: onchain.tokens };
        }
      } catch (e) {
        console.warn('On-chain balance query notice in chat:', e.message);
      }
    } else if (process.env.ENABLE_AGENTIC_WALLET === 'true') {
      try {
        const { stdout: balOut } = await execFilePromise('baw', ['wallet', 'balance', '--binanceChainId', '56', '--json']);
        const balParsed = JSON.parse(balOut);
        if (balParsed.success && Array.isArray(balParsed.data)) {
          const balList = balParsed.data;
          const usdtToken = balList.find(t => t.address.toLowerCase() === USDT_ADDRESS.toLowerCase());
          const bnbToken = balList.find(t => t.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
          const usdtBal = usdtToken ? parseFloat(usdtToken.balance || 0) : 0;
          const bnbBal = bnbToken ? parseFloat(bnbToken.balance || 0) : 0;
          const heldStocks = balList.filter(t => 
            t.address.toLowerCase() !== USDT_ADDRESS.toLowerCase() &&
            t.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' &&
            parseFloat(t.balance || 0) > 0.000001
          );
          liveWallet = { connected: true, usdtBal, bnbBal, heldStocks, tokens: balList };
        }
      } catch (_) {}
    }

    // Detect explicit deposit/order size intent in prompt (e.g. "$50", "25 USDT", "$10", "order size 50", "allocate $50")
    const amtMatch = lower.match(/(?:\$)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|usdt|\$)|(?:order size|deposit|size|allocate|invest)\s+(?:of\s+)?(?:\$)?(\d+(?:\.\d+)?)/i);
    let detectedDepositAmount = null;
    if (amtMatch) {
      const parsedVal = parseFloat(amtMatch[1] || amtMatch[2] || amtMatch[3]);
      if (!isNaN(parsedVal) && parsedVal >= 5) {
        detectedDepositAmount = parsedVal;
      }
    }

    // 0A. WALLET BALANCE & PORTFOLIO INQUIRIES
    const isBalanceOrPortfolioQuery = 
      (lower.includes('balance') || lower.includes('portfolio') || lower.includes('holding') || lower.includes('what do i own') || lower.includes('what do i have') || lower.includes('how much money') || lower.includes('how much usdt') || lower.includes('my wallet') || lower.includes('positions') || lower.includes('what tokens')) &&
      !lower.includes('sell') && !lower.includes('swap') && !lower.includes('rotate') && !lower.includes('liquidate') && !lower.includes('convert') && !lower.includes('rebalance') && !lower.includes('drift');

    if (isBalanceOrPortfolioQuery) {
      const stockSummary = liveWallet.heldStocks.length > 0
        ? liveWallet.heldStocks.map(s => `• **${s.symbol}**: \`${parseFloat(s.balance).toFixed(4)}\` (~$${parseFloat(s.value || 0).toFixed(2)} USD)`).join('\n')
        : '• _No active tokenized stock positions currently held (100% liquid stablecoin)._';

      const buyingPower = liveWallet.usdtBal >= 5
        ? `💡 **Buying Power**: You have **$${liveWallet.usdtBal.toFixed(2)} USDT** liquid, ready to allocate across AI stocks or Ondo US Treasury yield (meets Binance Agentic Wallet $5 order minimum).`
        : `⚠️ **Deposit Notice**: You currently have **$${liveWallet.usdtBal.toFixed(2)} USDT**. Binance Agentic Wallet requires a **$5.00 minimum swap size** per trade on BSC.`;

      return Response.json({
        type: 'INFO',
        reply: `💼 **Live Wallet Portfolio (BNB Smart Chain #56)**:\n\n• **Liquid USDT**: **$${liveWallet.usdtBal.toFixed(2)} USDT**\n• **Gas Reserve**: **${liveWallet.bnbBal.toFixed(4)} BNB** (~$${(liveWallet.bnbBal * 750).toFixed(2)} USD)\n\n**Active Tokenized Equities**:\n${stockSummary}\n\n${buyingPower}\n\n*Synced live from Binance Agentic Wallet on BSC Mainnet.*`,
        marketStatus,
        modelUsed: model.startsWith('gpt') ? 'BNB Agent Studio (GPT-4o) 🧠' : model.startsWith('gemini') ? 'Google Gemini 1.5 Flash 🤖' : 'OmniBasket Neuro ⚡'
      });
    }

    // 0B. ORDER SIZING & ALLOCATION COMMANDS (e.g. "Allocate $50", "Invest $25", "Set size to $10")
    const hasTickerInPrompt = Object.keys(TICKER_SYNONYMS).some(ticker => 
      TICKER_SYNONYMS[ticker].some(syn => lower.includes(syn))
    );

    const isOrderSizingCommand = 
      detectedDepositAmount && !hasTickerInPrompt && (
        lower.startsWith('allocate') || lower.startsWith('invest') || lower.startsWith('deposit') ||
        lower.startsWith('set') || lower.startsWith('change') || lower.startsWith('order size') ||
        lower.startsWith('size') || lower === `$${detectedDepositAmount}` || lower === `${detectedDepositAmount} usdt` ||
        lower === `${detectedDepositAmount}$` || lower === `${detectedDepositAmount} usd` ||
        lower.includes('order size') || lower.includes('deposit amount')
      );

    if (isOrderSizingCommand) {
      return Response.json({
        type: 'INFO',
        reply: `✅ **Order Size Updated**: Thematic stock basket order size is now set to **$${detectedDepositAmount.toFixed(2)} USDT**.\n\nThe Thematic Basket Suite has synced to this allocation size. You can now test quotes, run pre-transaction simulation, or execute on BSC with this size.`,
        depositAmount: detectedDepositAmount,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // 0C. REBALANCE & DRIFT SENTINEL INQUIRIES
    const isRebalanceQuery = 
      (lower.includes('rebalance') || lower.includes('drift') || lower.includes('deviation') || lower.includes('rebalancing')) &&
      !lower.includes('swap') && !lower.includes('rotate');

    if (isRebalanceQuery) {
      const stockDesc = liveWallet.heldStocks.length > 0
        ? `Your active on-chain positions: ${liveWallet.heldStocks.map(s => `${s.symbol} (${parseFloat(s.balance).toFixed(4)})`).join(', ')}.`
        : `Your connected wallet holds **$${liveWallet.usdtBal.toFixed(2)} USDT** with no drifting equity positions.`;

      return Response.json({
        type: 'INFO',
        reply: `⚖️ **24/7 Drift Sentinel & Rebalance Engine**:\n\n• **Status**: Active monitoring across BSC Mainnet\n• **Drift Sensitivity**: Flags any position deviating **>5%** from target weight\n• **Portfolio State**: ${stockDesc}\n\nTo view real-time drift gauges and execute zero-revert rebalancing routes, visit the **[24/7 Rebalance](/rebalance)** dashboard!`,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // 0D. BASKET EXECUTION & DEPLOY GUIDANCE
    const isExecuteBasketQuery = 
      (lower.includes('execute') || lower.includes('deploy') || lower.includes('invest') || lower.includes('buy basket')) &&
      (lower.includes('basket') || lower.includes('strategy') || lower.includes('portfolio') || lower.includes('suite') || lower === 'execute' || lower === 'deploy');

    if (isExecuteBasketQuery && !lower.includes('swap') && !lower.includes('rotate')) {
      return Response.json({
        type: 'INFO',
        reply: `🚀 **Basket Execution Pipeline Ready**:\n\nTo execute multi-leg basket allocations on BNB Smart Chain:\n1. Verify your allocations in the **Thematic Stock Basket Suite** directly below.\n2. Click **Simulate Safe Allocation** to verify pre-transaction EVM state with **$0 gas risk**.\n3. Click **Execute Allocation on BSC** to broadcast multi-leg swaps via **Binance Agentic Wallet**!\n\n*Or execute single-asset trades in chat by saying e.g. "Buy $5 of NVDA".*`,
        marketStatus,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
    }

    // 0E. TRADE & ROTATION INTENTS (Reverse Exit to USDT & Stock-to-Stock)
    const isTradeIntent = 
      lower.includes('swap') || lower.includes('rotate') || lower.includes('liquidate') || 
      lower.includes('sell') || lower.includes('convert') || lower.includes('cash out') ||
      (lower.includes('exit') && lower.includes('usdt'));

    if (isTradeIntent) {
      try {
        const balList = liveWallet.tokens || [];
        const usdtBal = liveWallet.usdtBal.toFixed(2);
        const heldStocks = liveWallet.heldStocks || [];

        const pairRegex = /(?:swap|rotate|convert|trade|invest|buy)\s+(?:from\s+|all\s+(?:of\s+)?(?:my\s+)?|my\s+)?([a-z0-9_]+)\s+(?:to|into|for|in|with)\s+([a-z0-9_]+)/i;
        const singleRotateRegex = /(?:rotate|swap|convert)\s+(?:(?:all\s+(?:of\s+)?(?:my\s+)?)?stock\s+)?(?:to|into|for)\s+([a-z0-9_]+)/i;
        const pairMatch = lower.match(pairRegex);
        const singleMatch = lower.match(singleRotateRegex);

        let fromWord = pairMatch ? pairMatch[1] : null;
        let toWord = pairMatch ? pairMatch[2] : (singleMatch ? singleMatch[1] : null);

        if (!pairMatch && singleMatch) {
          if (heldStocks.length > 0) {
            fromWord = heldStocks[0]?.symbol || 'stock';
          } else {
            fromWord = 'usdt';
          }
        }

        if (!pairMatch && !singleMatch && (lower.includes('liquidate') || lower.includes('cash out') || (lower.includes('exit') && lower.includes('usdt')) || (lower.includes('sell') && !lower.includes('buy')))) {
          toWord = 'usdt';
          fromWord = heldStocks[0]?.symbol || 'stock';
        }

        if (fromWord || toWord) {
          let fromTicker = resolveTicker(fromWord);
          let toTicker = resolveTicker(toWord);

          if (!fromTicker && (fromWord === 'stock' || fromWord === 'stocks' || fromWord === 'asset' || fromWord === 'assets' || fromWord === 'holding' || fromWord === 'holdings' || fromWord === 'current' || fromWord === 'all')) {
            if (heldStocks.length > 0) {
              const matchedHeld = heldStocks.find(h => Object.keys(BSC_RWA_TOKENS).some(k => BSC_RWA_TOKENS[k].contractAddress.toLowerCase() === h.address.toLowerCase())) || heldStocks[0];
              fromTicker = Object.keys(BSC_RWA_TOKENS).find(k => BSC_RWA_TOKENS[k].contractAddress.toLowerCase() === matchedHeld.address.toLowerCase()) || matchedHeld.symbol.replace(/on$/i, '');
            } else {
              fromTicker = 'USDT';
            }
          }

          // CASE 1: BUY STOCK FROM USDT (e.g. "Rotate all my USDT to NVDA", "Swap USDT to MSFT")
          if (fromTicker === 'USDT' && toTicker && toTicker !== 'USDT') {
            const targetTokenObj = BSC_RWA_TOKENS[toTicker];
            const REFERENCE_PRICES = {
              NVDA: 231.20,
              AAPL: 337.47,
              MSFT: 536.09,
              TSLA: 384.12,
              USDY: 1.16,
              GOOG: 182.40,
              MAG7X: 100.00
            };
            const targetPrice = REFERENCE_PRICES[toTicker] || targetTokenObj?.mockPrice || 140;

            if (liveWallet.usdtBal < 4.90) {
              return Response.json({
                type: 'INFO',
                reply: `⚠️ **Insufficient USDT Balance**:\n\nYour connected wallet holds **$${liveWallet.usdtBal.toFixed(2)} USDT**.\n\nBinance Agentic Wallet requires a **$5.00 minimum swap size** per trade on BSC. Please deposit at least **$${(5 - liveWallet.usdtBal).toFixed(2)} USDT** to execute this trade on BSC.`,
                marketStatus,
                modelUsed: 'OmniBasket Neuro ⚡'
              });
            }

            const isAll = lower.includes('all') || lower.includes('entire') || lower.includes('max') || lower.includes('100%');
            const buyAmt = isAll 
              ? Math.floor(liveWallet.usdtBal * 100) / 100
              : ((detectedDepositAmount && detectedDepositAmount >= 5 && detectedDepositAmount <= liveWallet.usdtBal) 
                  ? detectedDepositAmount 
                  : (liveWallet.usdtBal >= 5 ? 5.00 : liveWallet.usdtBal));

            const estOutput = (buyAmt / targetPrice).toFixed(4);

            return Response.json({
              type: 'TRADE_PROPOSAL',
              reply: `🎯 **USDT to ${toTicker} Allocation Proposal**:\n\n• **Order Amount**: **$${buyAmt.toFixed(2)} USDT** (${isAll ? '100% of liquid balance' : 'meets BSC $5 minimum'})\n• **Target Asset**: **${toTicker}** (${targetTokenObj?.name || toTicker})\n• **Estimated Output**: **~${estOutput} ${toTicker}**\n• **Routing Pipeline**: Direct AMM swap via PancakeSwap & LiquidMesh on BSC #56\n\nClick **Confirm & Execute on BSC** below to broadcast via **Binance Agentic Wallet**!`,
              action: {
                type: 'EXECUTE_SWAP',
                mode: 'BUY_FROM_USDT',
                fromTicker: 'USDT',
                toTicker: toTicker,
                fromQty: buyAmt.toString(),
                estimatedOutput: `~${estOutput} ${toTicker}`,
                label: `Execute $${buyAmt.toFixed(2)} Buy: ${buyAmt.toFixed(2)} USDT → ${toTicker} on BSC`
              },
              basket: {
                id: `single-${Date.now()}`,
                name: `100% ${toTicker} Single-Asset Strategy`,
                description: `100% allocation to ${toTicker} on BNB Smart Chain`,
                badge: 'Single Asset · $5 Compatible ⚡',
                allocations: [{ ticker: toTicker, weight: 100 }]
              },
              depositAmount: buyAmt,
              marketStatus,
              modelUsed: 'OmniBasket Neuro ⚡'
            });
          }

          // CASE 2: REVERSE EXIT TO USDT (Stock -> USDT)
          if (toTicker === 'USDT' || lower.includes('liquidate')) {
            if (heldStocks.length === 0) {
              return Response.json({
                type: 'INFO',
                reply: `🔍 **Portfolio Scan (BSC #56)**:\n\nYour connected wallet holds **${usdtBal} USDT** and gas BNB. You currently have **no stock positions (NVDAon, MSFTon, AAPLon)** to liquidate.\n\nAll your capital is already in liquid USDT ready for allocations!`,
                marketStatus,
                modelUsed: 'OmniBasket Neuro ⚡'
              });
            }

            let targetStock = heldStocks[0];
            if (fromTicker) {
              const match = heldStocks.find(h => h.symbol.toUpperCase().includes(fromTicker) || fromTicker.includes(h.symbol.toUpperCase().replace('ON', '')));
              if (match) targetStock = match;
            }

            const cleanTicker = targetStock.symbol.replace(/on$/i, '');
            let estimatedUsdt = (parseFloat(targetStock.balance) * (parseFloat(targetStock.price) || 150)).toFixed(2);

            return Response.json({
              type: 'TRADE_PROPOSAL',
              reply: `⚡ **Stock Reverse Exit Proposal**:\n\n• **Selling Position**: \`${parseFloat(targetStock.balance).toFixed(6)}\` **${cleanTicker}** (~$${parseFloat(targetStock.value || 0).toFixed(2)} USD)\n• **Destination**: **USDT** on BNB Smart Chain\n• **Estimated Output**: **~${estimatedUsdt} USDT**\n• **Routing**: Direct AMM via PancakeSwap on BSC #56\n\nClick **Confirm & Swap to USDT** below to sign and broadcast with your **connected Binance Web3 Wallet**!`,
              action: {
                type: 'EXECUTE_SWAP',
                mode: 'REVERSE_EXIT_TO_USDT',
                fromTicker: cleanTicker,
                toTicker: 'USDT',
                fromQty: targetStock.balance,
                estimatedOutput: `${estimatedUsdt} USDT`,
                label: `Reverse Exit: ${parseFloat(targetStock.balance).toFixed(4)} ${cleanTicker} → ${estimatedUsdt} USDT`
              },
              marketStatus,
              modelUsed: 'OmniBasket Neuro ⚡'
            });
          }

          // CASE 2: STOCK-TO-STOCK ROTATION (Stock A -> Stock B)
          if (fromTicker && toTicker && fromTicker !== toTicker && fromTicker !== 'USDT' && toTicker !== 'USDT') {
            const held = heldStocks.find(h => h.symbol.toUpperCase().includes(fromTicker) || fromTicker.includes(h.symbol.toUpperCase().replace('ON', '')));
            
            if (!held || parseFloat(held.balance || 0) <= 0) {
              if (heldStocks.length > 0) {
                const altHeld = heldStocks[0];
                const altTicker = Object.keys(BSC_RWA_TOKENS).find(k => BSC_RWA_TOKENS[k].contractAddress.toLowerCase() === altHeld.address.toLowerCase()) || altHeld.symbol.replace(/on$/i, '');
                return Response.json({
                  type: 'TRADE_PROPOSAL',
                  reply: `💡 **Active Position Auto-Detected**:\n\nYou don't currently hold **${fromTicker}**, but you do hold \`${parseFloat(altHeld.balance).toFixed(4)}\` **${altTicker}** (~$${parseFloat(altHeld.value || 0).toFixed(2)} USD).\n\nOmniBasket has automatically configured a **2-Hop Rotation from your active ${altTicker} into ${toTicker}** on BSC!\n\nClick **Execute Stock Rotation** below to convert into **${toTicker}** via **Binance Agentic Wallet**!`,
                  action: {
                    type: 'EXECUTE_SWAP',
                    mode: 'STOCK_TO_STOCK_ROTATION',
                    fromTicker: altTicker,
                    toTicker: toTicker,
                    fromQty: altHeld.balance,
                    estimatedOutput: `~${(parseFloat(altHeld.value || 0) / 140).toFixed(4)} ${toTicker}`,
                    label: `Rotate: ${parseFloat(altHeld.balance).toFixed(4)} ${altTicker} → ${toTicker} (2-Hop BSC)`
                  },
                  marketStatus,
                  modelUsed: 'OmniBasket Neuro ⚡'
                });
              }

              return Response.json({
                type: 'INFO',
                reply: `⚠️ **Insufficient ${fromTicker} Balance**:\n\nYour connected wallet holds **0 ${fromTicker}** (available balance: **${usdtBal} USDT**).\n\nTo rotate from ${fromTicker} to ${toTicker}, you first need to hold ${fromTicker}, or you can swap your USDT directly into ${toTicker}!`,
                marketStatus,
                modelUsed: 'OmniBasket Neuro ⚡'
              });
            }

            return Response.json({
              type: 'TRADE_PROPOSAL',
              reply: `🔄 **Stock-to-Stock Rotation Proposal**:\n\n• **Source Position**: \`${parseFloat(held.balance).toFixed(6)}\` **${fromTicker}** (~$${parseFloat(held.value || 0).toFixed(2)} USD)\n• **Target Position**: **${toTicker}**\n• **Routing Pipeline**: **2-Hop Atomic BSC Route** (\`${fromTicker}\` → \`USDT\` → \`${toTicker}\`)\n• **Architecture**: Because Ondo/Backed stock pairs on BSC require stablecoin liquidity, OmniBasket routes Leg 1 into USDT and immediately converts Leg 2 into ${toTicker} in a continuous agentic transaction.\n\nClick **Execute Stock Rotation** below to broadcast via **Binance Agentic Wallet**!`,
              action: {
                type: 'EXECUTE_SWAP',
                mode: 'STOCK_TO_STOCK_ROTATION',
                fromTicker: fromTicker,
                toTicker: toTicker,
                fromQty: held.balance,
                estimatedOutput: `~${(parseFloat(held.value || 0) / 150).toFixed(4)} ${toTicker}`,
                label: `Rotate: ${parseFloat(held.balance).toFixed(4)} ${fromTicker} → ${toTicker} (2-Hop BSC)`
              },
              marketStatus,
              modelUsed: 'OmniBasket Neuro ⚡'
            });
          }
        }
      } catch (tradeErr) {
        console.warn('Trade intent parsing error:', tradeErr.message);
      }
    }

    const walletPromptContext = `User's Connected Wallet on BSC (#56):
- Liquid USDT: $${liveWallet.usdtBal.toFixed(2)} USDT
- Gas BNB: ${liveWallet.bnbBal.toFixed(4)} BNB
- Held Equities: ${liveWallet.heldStocks.length > 0 ? liveWallet.heldStocks.map(s => `${s.symbol} (${s.balance})`).join(', ') : 'None (100% liquid USDT)'}
- Minimum Order Floor: $5.00 USDT per swap on BSC.`;

    // 1A. Gemini via OpenRouter
    if (model.startsWith('gemini') && isOpenRouterKey) {
      try {
        const orKey = apiKey || process.env.OPENROUTER_API_KEY;
        const orModel = model.includes('pro') ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${orKey}`,
            'HTTP-Referer': 'https://omnibasket.ai',
            'X-Title': 'OmniBasket AI'
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              {
                role: 'system',
                content: `You are OmniBasket AI on BNB Smart Chain (BSC #56).\n${walletPromptContext}\nSupported tokens: NVDA, AAPL, MSFT, GOOG, TSLA, USDY (5.1% APY Ondo), MAG7X.\n\nAnalyze user intent:\n1. If they ask about wallet balance/portfolio, answer accurately using the wallet data above. Set "basket": null.\n2. If they want a basket or strategy, output JSON with "reply" and "basket" (name, description, allocations with ticker & weight summing to 100).\n3. If they ask to buy a specific token (e.g. NVDA) with USDT, include an "action" object:\n{"type":"EXECUTE_SWAP","mode":"BUY_FROM_USDT","fromTicker":"USDT","toTicker":"<TICKER>","fromQty":"5","estimatedOutput":"~<AMOUNT> <TICKER>","label":"Execute $5 Buy: 5 USDT → <TICKER> on BSC"}\n4. If informational/Q&A, provide a helpful markdown reply and set "basket": null, "action": null.\nReturn ONLY valid JSON.`
              },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
          })
        });
        const orData = await orRes.json();
        if (orData.error) {
          console.warn('OpenRouter Gemini API notice:', orData.error);
          return Response.json({
            type: 'INFO',
            reply: `⚠️ **OpenRouter API Notice**:\n\n${orData.error.message || 'OpenRouter authentication error'}.\n\nPlease check your OpenRouter API key balance or configuration.\n\n*Falling back to built-in OmniBasket Neuro Engine for this prompt.*`,
            marketStatus,
            modelUsed: 'OpenRouter (Error Notice)'
          });
        }

        const rawContent = orData.choices?.[0]?.message?.content;
        if (rawContent) {
          let cleanContent = rawContent.trim();
          if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          const parsed = JSON.parse(cleanContent);
          return Response.json({
            type: parsed.action ? 'TRADE_PROPOSAL' : (parsed.basket ? 'BASKET_SUGGESTION' : 'INFO'),
            reply: parsed.reply,
            action: parsed.action || null,
            basket: parsed.basket ? {
              id: `gemini-or-${Date.now()}`,
              name: parsed.basket.name || 'Gemini Custom Strategy',
              description: parsed.basket.description || 'Constructed via Gemini on OpenRouter',
              badge: 'Gemini (OpenRouter) 🤖',
              allocations: parsed.basket.allocations
            } : null,
            marketStatus,
            modelUsed: `Gemini 1.5/2.5 Flash via OpenRouter 🤖`
          });
        }
      } catch (orErr) {
        console.warn('OpenRouter Gemini fallback:', orErr.message);
      }
    }

    // 1B. Native Google Gemini API
    if ((model.startsWith('gemini') || activeGeminiKey) && activeGeminiKey && !isOpenRouterKey && !model.startsWith('gpt')) {
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
${walletPromptContext}
Supported BSC Tokens:
- NVDA: NVIDIA Corporation (bStock, 24/7 AMM on BSC)
- AAPL: Apple Inc. (bStock, 24/7 AMM on BSC)
- MSFT: Microsoft Corporation (bStock, 24/7 AMM on BSC)
- GOOG: Alphabet Inc. (bStock)
- TSLA: Tesla Inc. (bStock)
- USDY: Ondo US Dollar Yield (5.10% APY US Treasury Bill)
- MAG7X: Magnificent 7 Thematic Index (xStock)

User Message: "${userPrompt}"

Analyze user intent:
1. If the user asks about their balance, portfolio, or holdings, answer directly using the Connected Wallet data above. Set "basket": null.
2. If they want a basket, output JSON with "reply" and "basket": {"name": "Strategy Name", "description": "Brief description", "allocations": [{"ticker": "NVDA", "weight": 50}, {"ticker": "MSFT", "weight": 50}]}. Weights MUST sum to 100.
3. If they ask to buy a token with USDT, include "action": {"type":"EXECUTE_SWAP","mode":"BUY_FROM_USDT","fromTicker":"USDT","toTicker":"<TICKER>","fromQty":"5","estimatedOutput":"~<AMOUNT> <TICKER>","label":"Execute $5 Buy: 5 USDT → <TICKER> on BSC"}.
4. If informational, provide a markdown reply and set "basket": null, "action": null.
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
            type: parsed.action ? 'TRADE_PROPOSAL' : (parsed.basket ? 'BASKET_SUGGESTION' : 'INFO'),
            reply: parsed.reply,
            action: parsed.action || null,
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

    // 2. Try OpenAI or OpenRouter API if requested
    if (model.startsWith('gpt') && activeOpenAiKey) {
      try {
        const isOpenRouter = activeOpenAiKey.startsWith('sk-or-') || !!process.env.OPENROUTER_API_KEY;
        const apiEndpoint = isOpenRouter 
          ? 'https://openrouter.ai/api/v1/chat/completions' 
          : 'https://api.openai.com/v1/chat/completions';
        const requestModel = isOpenRouter ? 'openai/gpt-4o' : model;

        const openaiRes = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeOpenAiKey}`,
            ...(isOpenRouter ? {
              'HTTP-Referer': 'https://omnibasket.ai',
              'X-Title': 'OmniBasket AI'
            } : {})
          },
          body: JSON.stringify({
            model: requestModel,
            messages: [
              {
                role: 'system',
                content: `You are OmniBasket AI on BNB Smart Chain (BSC #56).\n${walletPromptContext}\nSupported tokens: NVDA, AAPL, MSFT, GOOG, TSLA, USDY (5.1% APY Ondo), MAG7X.\n\nAnalyze user intent:\n1. If they ask about wallet balance/portfolio, answer accurately using the wallet data above. Set "basket": null.\n2. If they want a basket, output JSON with "reply" and "basket" (name, description, allocations with ticker & weight summing to 100).\n3. If they ask to buy a token with USDT, include "action": {"type":"EXECUTE_SWAP","mode":"BUY_FROM_USDT","fromTicker":"USDT","toTicker":"<TICKER>","fromQty":"5","estimatedOutput":"~<AMOUNT> <TICKER>","label":"Execute $5 Buy: 5 USDT → <TICKER> on BSC"}.\n4. If informational, answer in markdown and set "basket": null, "action": null.\nReturn ONLY valid JSON.`
              },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
          })
        });
        const openaiData = await openaiRes.json();
        if (openaiData.error) {
          console.warn('OpenRouter/OpenAI API notice:', openaiData.error);
          return Response.json({
            type: 'INFO',
            reply: `⚠️ **OpenRouter / OpenAI Notice**:\n\n${openaiData.error.message || 'API authentication error'}.\n\n*Falling back to OmniBasket Neuro engine.*`,
            marketStatus,
            modelUsed: 'OpenRouter (Notice)'
          });
        }

        const rawContent = openaiData.choices?.[0]?.message?.content;
        if (rawContent) {
          let cleanContent = rawContent.trim();
          if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          const parsed = JSON.parse(cleanContent);
          return Response.json({
            type: parsed.action ? 'TRADE_PROPOSAL' : (parsed.basket ? 'BASKET_SUGGESTION' : 'INFO'),
            reply: parsed.reply,
            action: parsed.action || null,
            basket: parsed.basket ? {
              id: `openai-${Date.now()}`,
              name: parsed.basket.name || 'AI Custom Strategy',
              description: parsed.basket.description || 'Constructed via GPT-4o Intelligence',
              badge: isOpenRouter ? 'OpenRouter (GPT-4o) 🧠' : 'GPT-4o 🧠',
              allocations: parsed.basket.allocations
            } : null,
            marketStatus,
            modelUsed: isOpenRouter ? 'BNB Agent Studio (GPT-4o via OpenRouter) 🧠' : model
          });
        }
      } catch (err) {
        console.warn('OpenAI/OpenRouter fallback:', err.message);
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

    if (detected.length === 1 && (lower.includes('100%') || lower.includes('basket') || lower.includes('allocate') || lower.includes('invest') || lower.includes('buy') || lower.includes('single') || lower.includes('test') || lower.includes('only') || lower.includes('$5') || lower.includes('5 usdt') || lower.includes('5$'))) {
      const ticker = detected[0].ticker;
      const customBasket = {
        id: `single-${Date.now()}`,
        name: `100% ${ticker} Single-Asset Strategy`,
        description: `100% allocation to ${ticker} on BNB Smart Chain (Optimized for $5 order minimum)`,
        badge: 'Single Asset · $5 Compatible ⚡',
        allocations: [{ ticker, weight: 100 }]
      };

      try {
        const balList = liveWallet.tokens || [];
        const usdtBal = liveWallet.usdtBal;
        const heldStocks = liveWallet.heldStocks || [];

        const targetTokenObj = BSC_RWA_TOKENS[ticker];
        const REFERENCE_PRICES = {
          NVDA: 231.20,
          AAPL: 337.47,
          MSFT: 536.09,
          TSLA: 384.12,
          USDY: 1.16,
          GOOG: 182.40,
          MAG7X: 100.00
        };
        const targetPrice = REFERENCE_PRICES[ticker] || targetTokenObj?.mockPrice || 140;

        // SCENARIO 1: User has >= 4.90 USDT -> Execute Direct Buy from USDT
        if (usdtBal >= 4.90) {
          const buyAmt = (detectedDepositAmount && detectedDepositAmount >= 5 && detectedDepositAmount <= (usdtBal + 0.1))
            ? detectedDepositAmount
            : (usdtBal >= 5 ? 5.00 : usdtBal);
          const estOutput = (buyAmt / targetPrice).toFixed(4);
          return Response.json({
            type: 'TRADE_PROPOSAL',
            reply: `🎯 **100% ${ticker} Allocation Ready**:\n\n• **Order Amount**: **$${buyAmt.toFixed(2)} USDT** (meets Binance Agentic Wallet $5 minimum)\n• **Target Asset**: **${ticker}** (${targetTokenObj?.name || ticker})\n• **Estimated Output**: **~${estOutput} ${ticker}**\n• **Routing Pipeline**: Direct AMM swap via PancakeSwap & LiquidMesh on BSC #56\n\nClick **Confirm & Execute on BSC** below to broadcast via **Binance Agentic Wallet**!`,
            action: {
              type: 'EXECUTE_SWAP',
              mode: 'BUY_FROM_USDT',
              fromTicker: 'USDT',
              toTicker: ticker,
              fromQty: buyAmt.toString(),
              estimatedOutput: `~${estOutput} ${ticker}`,
              label: `Execute $${buyAmt.toFixed(0)} Buy: ${buyAmt.toFixed(0)} USDT → ${ticker} on BSC`
            },
            basket: customBasket,
            depositAmount: buyAmt,
            marketStatus,
            modelUsed: 'OmniBasket Neuro ⚡'
          });
        }

        // SCENARIO 2: User has < 4.90 USDT but holds another stock (e.g. AAPL) -> Rotate Stock to Target
        if (heldStocks.length > 0) {
          const heldStock = heldStocks.find(h => !h.symbol.toUpperCase().includes(ticker)) || heldStocks[0];
          const heldTicker = Object.keys(BSC_RWA_TOKENS).find(k => BSC_RWA_TOKENS[k].contractAddress.toLowerCase() === heldStock.address.toLowerCase()) || heldStock.symbol.replace(/on$/i, '');
          
          if (heldTicker !== ticker) {
            const heldVal = parseFloat(heldStock.value || 5);
            const estOutput = (heldVal / targetPrice).toFixed(4);

            return Response.json({
              type: 'TRADE_PROPOSAL',
              reply: `🎯 **100% ${ticker} Allocation Strategy**:\n\n• **Live Wallet State**: You currently hold **${usdtBal.toFixed(2)} USDT** liquid and \`${parseFloat(heldStock.balance).toFixed(4)}\` **${heldTicker}** (~$${heldVal.toFixed(2)} USD).\n• **Execution Path**: Because your ~$5 capital is currently allocated in **${heldTicker}**, OmniBasket can rotate **${heldTicker} → ${ticker}** directly via an atomic 2-hop route!\n\nClick **Confirm & Execute on BSC** below to rotate your position into **${ticker}** via **Binance Agentic Wallet**!`,
              action: {
                type: 'EXECUTE_SWAP',
                mode: 'STOCK_TO_STOCK_ROTATION',
                fromTicker: heldTicker,
                toTicker: ticker,
                fromQty: heldStock.balance,
                estimatedOutput: `~${estOutput} ${ticker}`,
                label: `Rotate: ${parseFloat(heldStock.balance).toFixed(4)} ${heldTicker} → ${ticker} (2-Hop BSC)`
              },
              basket: customBasket,
              marketStatus,
              modelUsed: 'OmniBasket Neuro ⚡'
            });
          }
        }

        // SCENARIO 3: User already holds the target ticker
        const alreadyHeld = heldStocks.find(h => h.symbol.toUpperCase().includes(ticker));
        if (alreadyHeld) {
          return Response.json({
            type: 'INFO',
            reply: `✅ **Position Already Active**:\n\nYour connected wallet already holds \`${parseFloat(alreadyHeld.balance).toFixed(4)}\` **${ticker}** (~$${parseFloat(alreadyHeld.value || 0).toFixed(2)} USD).\n\nAll your capital is already allocated to ${ticker}! If you'd like to exit, click **Exit Stock to USDT** or type "swap ${ticker} to USDT".`,
            basket: customBasket,
            marketStatus,
            modelUsed: 'OmniBasket Neuro ⚡'
          });
        }

        // SCENARIO 4: Insufficient USDT and no stocks
        return Response.json({
          type: 'INFO',
          reply: `⚠️ **Insufficient Balance for BSC $5 Order Floor**:\n\nYour connected wallet holds **${usdtBal.toFixed(2)} USDT** and 0 stock positions.\n\nBinance Agentic Wallet enforces a **$5.00 minimum swap size** per trade on BSC. Please deposit at least **$${(5 - usdtBal).toFixed(2)} USDT** to execute this trade on BSC.`,
          basket: customBasket,
          marketStatus,
          modelUsed: 'OmniBasket Neuro ⚡'
        });
      } catch (err) {
        console.warn('Single asset execution error:', err.message);
      }

      return Response.json({
        type: 'BASKET_SUGGESTION',
        reply: `🎯 Configured **100% ${ticker}** strategy!\n\n**Note for BSC Execution**: Because Binance Agentic Wallet enforces a **$5.00 minimum swap size** per trade, allocating 100% to ${ticker} allows your entire $5 USDT balance to execute in a single on-chain transaction without splitting below the limit.`,
        basket: customBasket,
        modelUsed: 'OmniBasket Neuro ⚡'
      });
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
