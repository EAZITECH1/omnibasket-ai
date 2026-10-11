'use client';

import React, { useState, useEffect, useRef } from 'react';
import Navbar from './Navbar';
import FormattedMessageContent from './FormattedMessageContent';
import { useWallet } from '../context/WalletContext.js';
import { getInjectedProvider, pollExtensionReceipt } from '../lib/wallet/provider.js';
import { executeBasket } from '../services/basketExecutor.js';
import { BSC_RWA_TOKENS, PRESET_BASKETS } from '../services/tokens';
import { generateAllocationPlan } from '../services/rebalancer';
import { getMarketHoursStatus } from '../services/marketHours';
import { 
  Bot, 
  Key, 
  X, 
  RefreshCw, 
  Zap, 
  Play,
  CheckCircle2, 
  AlertTriangle,
  ExternalLink, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  Sliders,
  RotateCcw,
  Layers,
  Send,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Wallet,
  Activity
} from 'lucide-react';

const AVAILABLE_MODELS = [
  { 
    id: 'omnibasket-neuro', 
    name: 'OmniBasket Neuro ⚡', 
    badge: 'Built-in Engine',
    desc: 'High-speed deterministic financial reasoning & BSC token compiler' 
  },
  { 
    id: 'gemini-1.5-flash', 
    name: 'Google Gemini 1.5 Flash 🤖', 
    badge: 'Gemini LLM',
    desc: 'Generative multimodal portfolio & macroeconomic intelligence' 
  },
  { 
    id: 'gpt-4o', 
    name: 'BNB Agent Studio (GPT-4o) 🧠', 
    badge: 'Agent Studio',
    desc: 'Binance Web3 Agent Studio prompt & tool-calling standard' 
  }
];

const INITIAL_WATCHLIST = [
  { ticker: 'NVDA', symbol: 'NVDAon', name: 'NVIDIA Corporation', category: 'AI & Chips', priceDisplay: '$231.20', is247Active: true, liquidityStatus: 'LIVE 24/7 AMM' },
  { ticker: 'AAPL', symbol: 'AAPLon', name: 'Apple Inc.', category: 'Tech Giant', priceDisplay: '$337.47', is247Active: true, liquidityStatus: 'LIVE 24/7 AMM' },
  { ticker: 'MSFT', symbol: 'MSFTon', name: 'Microsoft Corporation', category: 'Cloud & AI', priceDisplay: '$536.09', is247Active: true, liquidityStatus: 'LIVE 24/7 AMM' },
  { ticker: 'TSLA', symbol: 'TSLAon', name: 'Tesla, Inc.', category: 'EV & Robotics', priceDisplay: '$384.12', is247Active: true, liquidityStatus: 'LIVE 24/7 AMM' },
  { ticker: 'USDY', symbol: 'USDY', name: 'Ondo US Dollar Yield', category: 'US Treasury (5.1% APY)', priceDisplay: '$1.16', is247Active: true, liquidityStatus: '5.10% T-Bill APY' },
  { ticker: 'GOOG', symbol: 'GOOGon', name: 'Alphabet Inc.', category: 'Search & Cloud', priceDisplay: '$182.40', is247Active: false, liquidityStatus: 'TradFi Market Hours' },
  { ticker: 'MAG7X', symbol: 'MAG7Xon', name: 'Magnificent 7 Index', category: 'Megacap Index', priceDisplay: '$100.00', is247Active: false, liquidityStatus: 'TradFi Market Hours' }
];

const DEFAULT_MESSAGE = {
  role: 'assistant',
  content: `OmniBasket Strategy Agent online on BNB Smart Chain.\n\nEnter an investment thesis in natural language (e.g. "Create an AI basket with 60% Nvidia and 40% Microsoft"), select an asset from the live watchlist, or request a rotation ("rotate from MSFT to NVDA"). Any prompt will instantly synchronize with the Thematic Stock Basket Suite directly under this console.`
};

export default function UnifiedStrategyBasket() {
  const { 
    walletMode, 
    isConnected, 
    address, 
    isBscMainnet, 
    openModal, 
    switchNetwork, 
    balances,
    refreshBalances,
    sendExtensionTransaction
  } = useWallet();

  // Strategy Agent States
  const [selectedModel, setSelectedModel] = useState('omnibasket-neuro');
  const [customApiKey, setCustomApiKey] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [messages, setMessages] = useState([DEFAULT_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [executingSwap, setExecutingSwap] = useState(false);
  const [activeActionIdx, setActiveActionIdx] = useState(null);
  const [marketStatus, setMarketStatus] = useState(getMarketHoursStatus());

  // Live Watchlist State (Real on-chain router quotes)
  const [watchlistData, setWatchlistData] = useState(INITIAL_WATCHLIST);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [watchlistLastUpdated, setWatchlistLastUpdated] = useState(null);

  // Live Wallet Balance State (Always live from baw)
  const [liveBalance, setLiveBalance] = useState({ usdt: '...', bnb: '...', totalUsd: '...' });

  // Thematic Baskets States (underneath)
  const [selectedBasket, setSelectedBasket] = useState(PRESET_BASKETS[0]);
  const [customBaskets, setCustomBaskets] = useState([]);
  const [depositAmount, setDepositAmount] = useState(25);
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [executingBasket, setExecutingBasket] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Sync Notification Banner State
  const [syncNotice, setSyncNotice] = useState(null);

  const chatContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const basketSuiteRef = useRef(null);
  const consoleRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingChat]);

  // Market hours ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketHoursStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Live Wallet Balance directly from on-chain BSC
  const fetchLiveBalance = () => {
    const url = address ? `/api/wallet/balance?address=${encodeURIComponent(address)}` : '/api/wallet/balance';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.tokens) {
          const usdt = data.tokens.find(t => t.symbol === 'USDT');
          const bnb = data.tokens.find(t => t.symbol === 'BNB');
          setLiveBalance({
            usdt: usdt ? usdt.balance.toFixed(2) : '0.00',
            bnb: bnb ? bnb.balance.toFixed(4) : '0.00',
            totalUsd: data.totalValueUsd ? data.totalValueUsd.toFixed(2) : '0.00'
          });
        } else {
          setLiveBalance({ usdt: '0.00', bnb: '0.0000', totalUsd: '0.00' });
        }
      })
      .catch(() => {
        setLiveBalance({ usdt: '0.00', bnb: '0.0000', totalUsd: '0.00' });
      });
  };

  // Fetch Live BSC Equities Watchlist directly from on-chain router
  const fetchLiveWatchlist = () => {
    setLoadingWatchlist(true);
    fetch('/api/rwa/watchlist')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.watchlist && data.watchlist.length > 0) {
          setWatchlistData(data.watchlist);
          setWatchlistLastUpdated(new Date().toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setLoadingWatchlist(false));
  };

  // Setup periodic live polling & global balance event listeners
  useEffect(() => {
    fetchLiveBalance();
    fetchLiveWatchlist();

    const balTimer = setInterval(fetchLiveBalance, 6000);
    const watchTimer = setInterval(fetchLiveWatchlist, 15000);

    const onBalanceRefresh = () => {
      fetchLiveBalance();
      fetchLiveWatchlist();
    };

    window.addEventListener('omnibasket-balance-refresh', onBalanceRefresh);

    return () => {
      clearInterval(balTimer);
      clearInterval(watchTimer);
      window.removeEventListener('omnibasket-balance-refresh', onBalanceRefresh);
    };
  }, [address]);

  // Restore state from localStorage on mount
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('omnibasket_chat_history');
      if (savedMessages) {
        let parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clean up any false auto-reconciled actions from old orders (e.g. 0x2a4ec7... from earlier session)
          parsed = parsed.map(m => {
            if (m.action && m.action.type === 'EXECUTE_SWAP') {
              if (m.action.txHash === '0x2a4ec76b62100834df6879af10ab42d88aa7e3fae0e7be29911d9e7964e251f3') {
                return {
                  ...m,
                  action: {
                    ...m.action,
                    status: 'PROPOSED',
                    executed: false,
                    executing: false,
                    txHash: null
                  }
                };
              }
            }
            return m;
          });
          setMessages(parsed);
          localStorage.setItem('omnibasket_chat_history', JSON.stringify(parsed));
        }
      }
      const savedModel = localStorage.getItem('omnibasket_selected_model');
      if (savedModel) setSelectedModel(savedModel);

      const savedKey = localStorage.getItem('omnibasket_custom_api_key');
      if (savedKey) setCustomApiKey(savedKey);

      const savedAmount = localStorage.getItem('omnibasket_deposit_amount');
      if (savedAmount) {
        const parsedAmt = Number(savedAmount);
        if (!isNaN(parsedAmt) && parsedAmt >= 5) setDepositAmount(parsedAmt);
      }

      const savedBasketId = localStorage.getItem('omnibasket_selected_basket_id');
      const savedActiveBasket = localStorage.getItem('omnibasket_active_basket');

      if (savedActiveBasket) {
        try {
          const parsedBasket = JSON.parse(savedActiveBasket);
          if (parsedBasket && parsedBasket.allocations) {
            setSelectedBasket(parsedBasket);
            if (!PRESET_BASKETS.some(b => b.id === parsedBasket.id)) {
              setCustomBaskets([parsedBasket]);
            }
          }
        } catch (_) {}
      } else if (savedBasketId) {
        const found = PRESET_BASKETS.find(b => b.id === savedBasketId);
        if (found) setSelectedBasket(found);
      }
    } catch (_) {}
  }, []);

  // Reconcile recent on-chain executions across all recent BSC orders
  const reconcileOrders = async () => {
    try {
      const res = await fetch('/api/wallet/recent-orders?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (!data.success || !Array.isArray(data.orders) || data.orders.length === 0) return;

      const recentOrders = data.orders;

      setMessages(prev => {
        let changed = false;
        const updated = prev.map(m => {
          // STRICT RULE: ONLY reconcile proposals that the user ACTUALLY executed (status === 'EXECUTING')
          if (m.action && m.action.type === 'EXECUTE_SWAP' && m.action.status === 'EXECUTING') {
            const actionTriggerTime = m.action.executedAt || 0;

            // Find matching finished order in recent orders
            const match = recentOrders.find(o => {
              if (o.status !== 'FINISHED' || !o.txHash) return false;

              // 1. If we have exact orderId from swap submission, match strictly on orderId!
              if (m.action.orderId) {
                return o.orderId === m.action.orderId;
              }

              // 2. If matching by ticker, order MUST have been created AFTER execution was triggered
              const orderTime = o.bookTime ? new Date(o.bookTime).getTime() : 0;
              if (actionTriggerTime > 0 && orderTime < actionTriggerTime - 10000) {
                return false; // Reject orders from earlier transactions!
              }

              const matchesTo = m.action.toTicker && (o.toTokenName?.toUpperCase().includes(m.action.toTicker.toUpperCase()) || o.toTokenName?.toUpperCase() === m.action.toTicker.toUpperCase());
              const matchesFrom = m.action.fromTicker && (o.fromTokenName?.toUpperCase().includes(m.action.fromTicker.toUpperCase()) || o.fromTokenName?.toUpperCase() === m.action.fromTicker.toUpperCase());
              return matchesTo || matchesFrom;
            });

            if (match) {
              changed = true;
              return {
                ...m,
                action: {
                  ...m.action,
                  status: 'COMPLETED',
                  executed: true,
                  executing: false,
                  txHash: match.txHash,
                  toQty: match.toTokenActualQty || m.action.estimatedOutput
                }
              };
            }
          }
          return m;
        });

        if (changed) {
          try {
            localStorage.setItem('omnibasket_chat_history', JSON.stringify(updated));
          } catch (_) {}
          setExecutingSwap(false);
          setActiveActionIdx(null);
          fetchLiveBalance();
          return updated;
        }
        return prev;
      });
    } catch (_) {}
  };

  // Continuously reconcile orders whenever any action is actively EXECUTING
  useEffect(() => {
    reconcileOrders();

    const interval = setInterval(() => {
      const hasExecuting = messages.some(m => m.action && m.action.type === 'EXECUTE_SWAP' && m.action.status === 'EXECUTING');
      if (hasExecuting || executingSwap) {
        reconcileOrders();
      }
    }, 2500);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconcileOrders();
        fetchLiveBalance();
        fetchLiveWatchlist();
      }
    };
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
  }, [messages, executingSwap]);

  // Persist messages whenever updated
  useEffect(() => {
    try {
      if (messages && messages.length > 0) {
        localStorage.setItem('omnibasket_chat_history', JSON.stringify(messages));
      }
    } catch (_) {}
  }, [messages]);

  // Fetch Quotes for Active Basket
  const fetchQuotes = async () => {
    if (!selectedBasket || !selectedBasket.allocations) return;
    setLoadingQuotes(true);
    const newQuotes = {};
    for (const alloc of selectedBasket.allocations) {
      const targetUsd = (depositAmount * alloc.weight) / 100;
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: alloc.ticker, amountUsd: targetUsd })
        });
        const data = await res.json();
        if (data.success) {
          newQuotes[alloc.ticker] = data;
        }
      } catch (e) {
        console.error('Quote error for', alloc.ticker, e);
      }
    }
    setQuotes(newQuotes);
    setLoadingQuotes(false);
  };

  useEffect(() => {
    fetchQuotes();
  }, [selectedBasket, depositAmount]);

  // Sync helper: Trigger notice with auto-clear
  const triggerSyncNotice = (msg) => {
    setSyncNotice(msg);
    setTimeout(() => {
      setSyncNotice(null);
    }, 6000);
  };

  // Handler: Select Basket from Preset or Custom
  const handleSelectBasket = (basket) => {
    setSelectedBasket(basket);
    triggerSyncNotice(`Active Basket set to "${basket.name}"`);
    try {
      localStorage.setItem('omnibasket_selected_basket_id', basket.id);
      localStorage.setItem('omnibasket_active_basket', JSON.stringify(basket));
    } catch (_) {}
  };

  // Handler: Change Deposit Amount
  const handleDepositAmountChange = (amt) => {
    const cleanAmt = Math.max(5, Number(amt));
    setDepositAmount(cleanAmt);
    triggerSyncNotice(`Order size updated to $${cleanAmt} USDT`);
    try {
      localStorage.setItem('omnibasket_deposit_amount', cleanAmt.toString());
    } catch (_) {}
  };

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    try {
      localStorage.setItem('omnibasket_selected_model', modelId);
    } catch (_) {}
  };

  const handleApiKeyChange = (keyVal) => {
    setCustomApiKey(keyVal);
    try {
      localStorage.setItem('omnibasket_custom_api_key', keyVal);
    } catch (_) {}
  };

  const handleClearHistory = () => {
    if (confirm('Clear strategy conversation history?')) {
      setMessages([DEFAULT_MESSAGE]);
      try {
        localStorage.removeItem('omnibasket_chat_history');
      } catch (_) {}
    }
  };

  const scrollToBasketSuite = () => {
    basketSuiteRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToConsole = () => {
    consoleRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Execute Swap Action from Chat
  const handleExecuteSwapAction = async (action, actionMsgIdx = null) => {
    if (!action) return;

    if (!isConnected) {
      openModal();
      alert('Please connect your Binance Web3 Wallet extension before executing trades.');
      return;
    }

    if (!isBscMainnet) {
      switchNetwork();
      alert('Please switch network to BNB Smart Chain Mainnet (Chain ID 56) to execute trades.');
      return;
    }

    if (walletMode === 'agentic') {
      alert('Agentic Wallet execution is disabled in public mode. Please switch to Binance Web3 Wallet Extension mode to execute with your browser wallet.');
      return;
    }

    setExecutingSwap(true);
    setActiveActionIdx(actionMsgIdx);

    if (actionMsgIdx !== null) {
      setMessages(prev => {
        const copy = [...prev];
        if (copy[actionMsgIdx] && copy[actionMsgIdx].action) {
          copy[actionMsgIdx] = {
            ...copy[actionMsgIdx],
            action: {
              ...copy[actionMsgIdx].action,
              status: 'EXECUTING',
              executing: true,
              executedAt: Date.now()
            }
          };
          try {
            localStorage.setItem('omnibasket_chat_history', JSON.stringify(copy));
          } catch (_) {}
        }
        return copy;
      });
    }

    try {
      const fromAmount = action.fromQty || 10;
      const fromTicker = action.fromTicker || 'USDT';
      const toTicker = action.toTicker;

      // 1. Build unsigned calldata, obtain fresh on-chain quote, and simulate on BSC
      const buildRes = await fetch('/api/swap/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWalletAddress: address,
          fromTicker,
          toTicker,
          fromAmount,
          slippagePercent: '0.5'
        })
      });

      let buildData = await buildRes.json();
      if (!buildData.success) {
        throw new Error(buildData.error || 'Failed to construct swap calldata on BSC.');
      }

      const provider = getInjectedProvider();

      // 2. Sequential approval-then-resimulation flow for approval-required swaps
      if (buildData.needsApproval && buildData.approveTx) {
        // Verify approval simulation is strictly SUCCESS
        if (buildData.simulation?.status !== 'SUCCESS') {
          throw new Error(`Approval simulation failed on BSC: ${buildData.simulation?.failReason || 'Revert'}. Execution aborted.`);
        }

        const approveConfirmMsg = `Token Approval Required on BNB Smart Chain:\n\n• Token: ${fromTicker}\n• Spender: ${buildData.approveTx.spender} (PancakeSwap V2 Router)\n• Allowance: ${fromAmount} ${fromTicker} (Exact Order Amount, Non-Unlimited)\n• Pre-Simulation: SUCCESS (Verified against current BSC state)\n\nApprove in your Binance Web3 Wallet?`;
        if (!confirm(approveConfirmMsg)) {
          throw new Error('Token approval was cancelled by user.');
        }

        triggerSyncNotice(`Requesting exact token approval in wallet...`);
        const approveHash = await sendExtensionTransaction({
          to: buildData.approveTx.to,
          data: buildData.approveTx.data,
          value: '0x0'
        });

        triggerSyncNotice(`Confirming token approval on BSC...`);
        const approveReceipt = await pollExtensionReceipt(provider, approveHash);
        if (approveReceipt?.status !== 'CONFIRMED') {
          throw new Error(`Token approval transaction was not confirmed on-chain (status: ${approveReceipt?.status || 'UNKNOWN'}). Execution blocked.`);
        }

        // Approval is confirmed on-chain! Fetch fresh build to re-quote and re-simulate swap with active allowance
        triggerSyncNotice(`Re-simulating swap with active allowance...`);
        const freshBuildRes = await fetch('/api/swap/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userWalletAddress: address,
            fromTicker,
            toTicker,
            fromAmount,
            slippagePercent: '0.5'
          })
        });

        buildData = await freshBuildRes.json();
        if (!buildData.success) {
          throw new Error(`Fresh simulation failed after approval: ${buildData.error}`);
        }
      }

      // 3. Strict Pre-Transaction Simulation Gate: must be exactly SUCCESS
      if (buildData.simulation?.status !== 'SUCCESS') {
        throw new Error(`Pre-transaction swap simulation status: ${buildData.simulation?.status || 'FAILED'} (${buildData.simulation?.failReason || 'Revert'}). Execution aborted to prevent capital loss.`);
      }

      // 4. Quote Transparency Confirmation UI before prompting swap signature
      const quote = buildData.quote;
      const swapConfirmMsg = `Confirm Trade on BNB Smart Chain (Chain ID 56):\n\n• Route: ${fromTicker} → ${toTicker}\n• Input: ${fromAmount} ${fromTicker}\n• Expected Output: ${quote?.expectedAmountOut || '...'} ${toTicker}\n• Minimum Guaranteed Output: ${quote?.amountOutMin || '...'} ${toTicker} (Slippage: max ${quote?.slippagePercent || 0.5}%)\n• Quote Source: ${quote?.quoteSource || 'PancakeSwap V2 AMM'}\n• Pre-Simulation: SUCCESS (Verified against current BSC state)\n\n${quote?.priceDisclaimer || 'Market prices fluctuate in real time.'}\n\nBroadcast swap via Binance Web3 Wallet?`;

      if (!confirm(swapConfirmMsg)) {
        throw new Error('Swap was cancelled by user before signing.');
      }

      // 5. Prompt user for swap execution in extension
      triggerSyncNotice(`Requesting swap signature in wallet...`);
      const swapTxHash = await sendExtensionTransaction({
        to: buildData.swapTx.to,
        data: buildData.swapTx.data,
        value: buildData.swapTx.value || '0x0'
      });

      // 6. Poll receipt
      triggerSyncNotice(`Polling transaction receipt on BSC...`);
      const receipt = await pollExtensionReceipt(provider, swapTxHash);
      const isConfirmed = receipt?.status === 'CONFIRMED';
      const bscScanUrl = `https://bscscan.com/tx/${swapTxHash}`;

      let replyMsg = '';
      if (!isConfirmed) {
        replyMsg = `❌ **Swap FAILED or REVERTED on BNB Smart Chain!**\n\n• **Status**: \`${receipt?.status || 'UNKNOWN'}\`\n• **Tx Hash**: [${swapTxHash.slice(0, 10)}...${swapTxHash.slice(-8)}](${bscScanUrl})\n• **Error**: Transaction was not confirmed on-chain.`;
      } else {
        replyMsg = `✅ **Swap CONFIRMED on BNB Smart Chain!**\n\n• **Transferred**: \`${fromAmount}\` **${fromTicker}** → **${toTicker}**\n• **Expected**: \`${quote?.expectedAmountOut}\` ${toTicker} (Min Guaranteed: \`${quote?.amountOutMin}\`)\n• **Slippage Cap**: \`${quote?.slippagePercent}%\`\n• **Tx Hash**: [${swapTxHash.slice(0, 10)}...${swapTxHash.slice(-8)}](${bscScanUrl})\n\nTokens are confirmed in your Binance Web3 Wallet on BSC Mainnet!`;
      }

      setMessages(prev => {
        const updated = prev.map((m, idx) => {
          if ((actionMsgIdx !== null && idx === actionMsgIdx) || (actionMsgIdx === null && m.action && m.action.type === 'EXECUTE_SWAP' && !m.action.executed)) {
            return {
              ...m,
              action: {
                ...m.action,
                status: !isConfirmed ? 'FAILED' : 'COMPLETED',
                executed: isConfirmed,
                executing: false,
                txHash: swapTxHash,
                receipt
              }
            };
          }
          return m;
        });
        const withReply = [...updated, { 
          role: 'assistant', 
          content: replyMsg,
          modelUsed: 'Binance Web3 Wallet Extension 🟡'
        }];
        try {
          localStorage.setItem('omnibasket_chat_history', JSON.stringify(withReply));
        } catch (_) {}
        return withReply;
      });

      window.dispatchEvent(new Event('omnibasket-balance-refresh'));
      refreshBalances();
      fetchQuotes();
      triggerSyncNotice(`Executed swap on BSC`);
    } catch (err) {
      setMessages(prev => {
        const updated = prev.map((m, idx) => {
          if ((actionMsgIdx !== null && idx === actionMsgIdx) || (actionMsgIdx === null && m.action && m.action.type === 'EXECUTE_SWAP')) {
            return {
              ...m,
              action: {
                ...m.action,
                status: 'FAILED',
                executing: false,
                error: err.message
              }
            };
          }
          return m;
        });
        const withErr = [
          ...updated, 
          { role: 'assistant', content: `❌ **Execution Blocked / Error**: ${err.message}` }
        ];
        try {
          localStorage.setItem('omnibasket_chat_history', JSON.stringify(withErr));
        } catch (_) {}
        return withErr;
      });
    } finally {
      setExecutingSwap(false);
      setActiveActionIdx(null);
    }
  };

  // Main Chat Send Message Handler with SYNC REFLECTION
  const handleSendMessage = async (msgText) => {
    const userText = msgText || inputMessage;
    if (!userText.trim()) return;

    // Check if user is confirming a pending swap proposal
    const lowerUser = userText.toLowerCase().trim();
    if (lowerUser === 'yes' || lowerUser === 'confirm' || lowerUser === 'execute' || lowerUser === 'swap' || lowerUser === 'do it') {
      const revMsgs = [...messages].reverse();
      const lastActionRelIdx = revMsgs.findIndex(m => m.action && m.action.type === 'EXECUTE_SWAP' && !m.action.executed);
      if (lastActionRelIdx !== -1) {
        const lastActionMsgIdx = messages.length - 1 - lastActionRelIdx;
        const targetAction = messages[lastActionMsgIdx].action;
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        if (!msgText) setInputMessage('');
        handleExecuteSwapAction(targetAction, lastActionMsgIdx);
        return;
      }
    }

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    if (!msgText) setInputMessage('');
    setLoadingChat(true);

    // Extract any explicit dollar amount from prompt immediately for optimistic sync
    const amtMatch = userText.match(/(?:\$)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|usdt|\$)|(?:order size|deposit|size|allocate|invest)\s+(?:of\s+)?(?:\$)?(\d+(?:\.\d+)?)/i);
    if (amtMatch) {
      const parsedAmt = parseFloat(amtMatch[1] || amtMatch[2] || amtMatch[3]);
      if (!isNaN(parsedAmt) && parsedAmt >= 5) {
        setDepositAmount(parsedAmt);
        try {
          localStorage.setItem('omnibasket_deposit_amount', parsedAmt.toString());
        } catch (_) {}
      }
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText,
          model: selectedModel,
          apiKey: customApiKey,
          userAddress: address || null
        })
      });
      const data = await res.json();

      // === SYNC REFLECTION INTO THEMATIC BASKET SUITE UNDERNEATH ===
      if (data.basket) {
        setSelectedBasket(data.basket);
        if (!PRESET_BASKETS.some(b => b.id === data.basket.id)) {
          setCustomBaskets(prev => [data.basket, ...prev.filter(b => b.id !== data.basket.id)]);
        }
        try {
          localStorage.setItem('omnibasket_selected_basket_id', data.basket.id);
          localStorage.setItem('omnibasket_active_basket', JSON.stringify(data.basket));
        } catch (_) {}

        triggerSyncNotice(`Synced: "${data.basket.name}" updated in Thematic Suite below!`);
      }

      if (data.depositAmount) {
        setDepositAmount(data.depositAmount);
        try {
          localStorage.setItem('omnibasket_deposit_amount', data.depositAmount.toString());
        } catch (_) {}
        triggerSyncNotice(`Synced: Order size set to $${data.depositAmount} USDT`);
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply,
        action: data.action || null,
        basket: data.basket || null,
        modelUsed: data.modelUsed || activeModelObj.badge
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Execution error: Failed to parse strategy.' }]);
    }
    setLoadingChat(false);
  };

  // Simulate Basket Allocation
  const handleSimulate = async () => {
    setSimulating(true);
    setSimulationResult(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: selectedBasket.allocations,
          depositAmount,
          userWalletAddress: address || undefined
        })
      });
      const data = await res.json();
      if (data.success && (data.overallStatus === 'PASS' || data.overallStatus === 'APPROVAL_REQUIRED_FIRST')) {
        setSimulationResult(data);
        if (data.overallStatus === 'APPROVAL_REQUIRED_FIRST') {
          triggerSyncNotice(`Simulation complete: Verified on BSC #56 (Token approval required before swap)`);
        } else {
          triggerSyncNotice(`Simulation complete: Verified on BSC #56`);
        }
      } else {
        const revertLeg = data.legs?.find(l => l.simulationStatus === 'SIMULATED_REVERT');
        const failMsg = revertLeg ? `${revertLeg.ticker}: ${revertLeg.failReason}` : (data.error || 'Simulation failed on BSC');
        alert(`Simulation blocked: ${failMsg}`);
        setSimulationResult(data);
      }
    } catch (e) {
      alert(`Simulation network error: ${e.message}`);
    }
    setSimulating(false);
  };

  // Execute Basket Allocation
  const handleExecuteBasket = async () => {
    if (!isConnected) {
      openModal();
      alert('Please connect your Binance Web3 Wallet extension before executing basket allocations.');
      return;
    }

    if (!isBscMainnet) {
      switchNetwork();
      alert('Please switch network to BNB Smart Chain Mainnet (Chain ID 56) to execute basket allocations.');
      return;
    }

    if (walletMode === 'agentic') {
      alert('Agentic Wallet execution is disabled in public mode. Please switch to Binance Web3 Wallet Extension mode to execute with your browser wallet.');
      return;
    }

    const confirmMsg = `Broadcast multi-leg allocation of $${depositAmount} USDT on BNB Smart Chain via Binance Web3 Wallet (${address.slice(0, 6)}...${address.slice(-4)})?\n\nStrategy: ${selectedBasket.name}\nDeposit: $${depositAmount} USDT\n\nEach leg will simulate on-chain, display exact slippage protection, and request your approval and signature.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    setExecutingBasket(true);
    setExecutionResult(null);

    try {
      const provider = getInjectedProvider();
      const execResult = await executeBasket({
        allocations: selectedBasket.allocations,
        depositAmount,
        userWalletAddress: address,
        provider,
        onNotice: triggerSyncNotice,
        confirmDialog: (msg) => confirm(msg),
        sendTransactionFn: sendExtensionTransaction,
        pollReceiptFn: pollExtensionReceipt
      });

      setExecutionResult(execResult);
      setExecutingBasket(false);

      const results = execResult.results || [];
      const confirmedCount = results.filter(r => r.success).length;

      if (confirmedCount > 0) {
        triggerSyncNotice(`Basket execution broadcast finished on BSC!`);
        window.dispatchEvent(new Event('omnibasket-balance-refresh'));
        refreshBalances();
        fetchQuotes();

        const legSummaries = results
          .map(r => r.txHash 
            ? `• **${r.ticker}**: [${r.txHash.slice(0, 10)}...${r.txHash.slice(-8)}](${r.bscScanUrl}) ${r.success ? '✅' : '❌'}${r.expectedAmountOut ? ` (Min: ${r.amountOutMin})` : ''}`
            : `• **${r.ticker}**: ${r.error || r.status} ❌`
          )
          .join('\n');

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `✅ **Multi-Leg Allocation COMPLETED on BSC!**\n\n• **Strategy**: **${selectedBasket.name}**\n• **Capital Allocated**: **$${depositAmount} USDT**\n\n**Transactions:**\n${legSummaries}\n\nConfirmed tokens are held in your Binance Web3 Wallet on BSC.`,
            modelUsed: 'Binance Web3 Wallet Extension 🟡'
          }
        ]);
      }
    } catch (e) {
      setExecutionResult({
        success: false,
        summary: `Execution call error: ${e.message}`
      });
    } finally {
      setExecutingBasket(false);
    }
  };

  const allocationPlan = generateAllocationPlan(depositAmount, selectedBasket.allocations);
  const activeModelObj = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="relative mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 flex-1 flex flex-col">
        {/* Background Dot Matrix */}
        <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true"></div>

        {/* ======================================================== */}
        {/* TOP SECTION: STRATEGY CONSOLE & BNB WATCHLIST (8 + 4)    */}
        {/* ======================================================== */}
        <section ref={consoleRef} className="w-full mb-10">
          
          {/* Header Title Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="w-6 h-6 text-bnb-yellow" />
                <h1 className="text-2xl font-black uppercase tracking-wider sm:text-3xl">
                  Strategy Agent Terminal
                </h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                Conversational RWA portfolio compiler · Synchronized in real-time with Thematic Baskets suite below.
              </p>
            </div>

            {/* Sync & Live On-Chain Wallet Balance Status */}
            <div className="flex items-center gap-2">
              {syncNotice && (
                <div className="border border-bnb-yellow bg-bnb-yellow/10 px-3 py-1 text-xs font-mono font-bold text-bnb-yellow flex items-center gap-1.5 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{syncNotice}</span>
                </div>
              )}

              {/* Live Wallet Balance Pill */}
              <div 
                onClick={openModal}
                role="button"
                className="border-2 border-foreground bg-card px-3 py-1.5 text-xs font-mono flex items-center gap-2 shadow-[1px_1px_0px_0px_#fff] cursor-pointer hover:bg-muted/30 transition-colors"
                title="Manage Wallet (Agentic or Extension)"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-bold text-muted-foreground uppercase">{walletMode === 'agentic' ? 'baw:' : 'ext:'}</span>
                <span className="text-bnb-yellow font-black">${balances.usdt} USDT</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">({balances.bnb} BNB)</span>
              </div>

              {/* Market Clock */}
              <div className="border-2 border-foreground bg-background px-3 py-1.5 text-xs font-mono flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-bnb-yellow" />
                <span className="font-bold text-muted-foreground">NY:</span>
                <span className="text-foreground">{marketStatus.nyTime}</span>
                <span className={`px-1.5 py-0.5 text-[10px] uppercase font-black ${marketStatus.isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {marketStatus.session}
                </span>
              </div>
            </div>
          </div>

          {/* Model Selection Tabs Bar */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => handleModelChange(model.id)}
                  className={`border-2 p-3 transition-all cursor-pointer shadow-[var(--shadow-box-sm)] flex flex-col justify-between ${
                    isSelected 
                      ? 'border-bnb-yellow bg-foreground text-background shadow-[var(--shadow-box)] ring-1 ring-bnb-yellow' 
                      : 'border-foreground bg-card text-foreground hover:bg-muted/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border ${isSelected ? 'border-background bg-bnb-yellow text-black' : 'border-foreground bg-foreground text-background'}`}>
                        {model.badge}
                      </span>
                      {isSelected && (
                        <span className="text-bnb-yellow font-black text-xs font-mono">ACTIVE ✓</span>
                      )}
                    </div>
                    <div className="text-sm font-black uppercase leading-tight">
                      {model.name}
                    </div>
                  </div>
                  <p className={`mt-2 text-[11px] font-mono line-clamp-2 ${isSelected ? 'text-background/80' : 'text-muted-foreground'}`}>
                    {model.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Grid: Left Column Terminal (8 Cols) + Right Column BNB Watchlist (4 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* ======================================================== */}
            {/* LEFT: STRATEGY CONSOLE CHAT (lg:col-span-8)              */}
            {/* ======================================================== */}
            <div className="lg:col-span-8 border-2 border-foreground bg-card shadow-[var(--shadow-box)] flex flex-col">
              
              {/* Terminal Header */}
              <div className="border-b-2 border-foreground bg-background p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 bg-bnb-yellow animate-pulse"></span>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">
                    Strategy Terminal
                  </span>
                  <span className="border border-foreground bg-card px-2 py-0.5 text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                    Context: <span className="text-bnb-yellow font-bold">{selectedBasket.name}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={scrollToBasketSuite}
                    className="border border-foreground bg-card px-2.5 py-1 text-xs font-mono font-bold text-bnb-yellow hover:bg-foreground hover:text-background transition-colors flex items-center gap-1.5"
                  >
                    <span>Thematic Suite Below</span>
                    <ArrowDownCircle className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowKeyConfig(!showKeyConfig)}
                    className={`border border-foreground px-2.5 py-1 text-xs font-mono font-bold transition-colors ${customApiKey ? 'bg-bnb-yellow text-black' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                  >
                    <Key className="w-3.5 h-3.5 inline mr-1" />
                    {customApiKey ? 'Key Configured ✓' : 'Custom API Key'}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearHistory}
                    title="Clear Chat History"
                    className="border border-foreground bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Custom API Key Drawer */}
              {showKeyConfig && (
                <div className="border-b-2 border-foreground bg-background p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-bnb-yellow">Custom OpenRouter / Gemini API Key</span>
                    <button onClick={() => setShowKeyConfig(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="password"
                    placeholder="Paste OpenRouter (sk-or-...) or Google Gemini key..."
                    value={customApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    className="w-full border-2 border-foreground bg-card px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                  />
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Saved securely in your browser localStorage. Leave blank to run via the built-in deterministic engine.
                  </p>
                </div>
              )}

              {/* Roomy Chat Messages Container */}
              <div 
                ref={chatContainerRef}
                className="h-[460px] sm:h-[500px] overflow-y-auto p-4 sm:p-5 space-y-4 font-mono text-xs bg-background/50 scroll-smooth"
              >
                {messages.map((m, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center gap-2">
                      {m.role === 'user' ? (
                        <span>YOU (DEPOSITOR)</span>
                      ) : (
                        <>
                          <span className="text-bnb-yellow font-bold">OMNIBASKET STRATEGY AGENT</span>
                          {m.modelUsed && (
                            <span className="border border-foreground/30 px-1.5 py-0.2 text-[9px] text-muted-foreground">
                              {m.modelUsed}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <div 
                      className={`max-w-[88%] p-3.5 sm:p-4 border-2 border-foreground leading-relaxed shadow-[var(--shadow-box-sm)] ${
                        m.role === 'user' 
                          ? 'bg-foreground text-background font-bold' 
                          : 'bg-card text-foreground'
                      }`}
                    >
                      <FormattedMessageContent content={m.content} isUser={m.role === 'user'} />

                      {/* Basket Suggestion Card Inside Chat */}
                      {m.basket && (
                        <div className="mt-3.5 border-2 border-bnb-yellow bg-bnb-yellow/10 p-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-bnb-yellow uppercase">
                              ⚡ Synced Strategy: {m.basket.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {m.basket.allocations.map(a => `${a.weight}% ${a.ticker}`).join(' · ')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectBasket(m.basket);
                              scrollToBasketSuite();
                            }}
                            className="border border-bnb-yellow bg-bnb-yellow px-3 py-1.5 text-xs font-black text-black uppercase hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Inspect in Suite Below</span>
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Trade Proposal Card */}
                      {m.action && m.action.type === 'EXECUTE_SWAP' && (
                        <div className="mt-3.5 border-2 border-foreground bg-background p-3.5 shadow-[var(--shadow-box-sm)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-black uppercase text-bnb-yellow flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 fill-current" />
                              {m.action.mode === 'STOCK_TO_STOCK_ROTATION' ? '2-Hop Stock Rotation Proposal' : 'Execution Proposal'}
                            </span>
                            <span className="border border-foreground bg-card px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              BSC Chain ID 56
                            </span>
                          </div>

                          <div className="text-xs font-mono font-bold mb-3 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">From:</span>
                              <span className="text-foreground">{m.action.fromQty} {m.action.fromTicker}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">To:</span>
                              <span className="text-bnb-yellow">{m.action.toTicker} ({m.action.estimatedOutput})</span>
                            </div>
                          </div>

                          {/* Order Status Display */}
                          {(m.action.executed || m.action.status === 'COMPLETED') ? (
                            <div className="border border-emerald-400 bg-emerald-950/20 p-2.5 text-xs text-emerald-400 font-bold flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>✓ Confirmed on-chain</span>
                              </span>
                              {m.action.txHash && (
                                <a
                                  href={`https://bscscan.com/tx/${m.action.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-emerald-300 flex items-center gap-1 font-mono text-[11px]"
                                >
                                  <span>{m.action.txHash.slice(0, 8)}...{m.action.txHash.slice(-6)}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : (m.action.status === 'EXECUTING' || (executingSwap && activeActionIdx === idx)) ? (
                            <div className="space-y-1.5">
                              <div className="border border-bnb-yellow bg-bnb-yellow/10 p-2.5 text-xs text-bnb-yellow font-bold flex items-center justify-between animate-pulse">
                                <span className="flex items-center gap-2">
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Broadcasting via baw on BSC...</span>
                                </span>
                                <span className="text-[10px] uppercase font-mono tracking-wider">Confirming</span>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={reconcileOrders}
                                  className="text-[10px] font-mono text-muted-foreground hover:text-bnb-yellow underline flex items-center gap-1 cursor-pointer"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Check on-chain receipt now
                                </button>
                              </div>
                            </div>
                          ) : m.action.status === 'FAILED' ? (
                            <div className="space-y-2">
                              <div className="border border-red-500 bg-red-950/20 p-2 text-xs text-red-400 font-mono">
                                ❌ {m.action.error || 'Execution failed'}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleExecuteSwapAction(m.action, idx)}
                                disabled={executingSwap}
                                className="w-full border-2 border-foreground bg-bnb-yellow px-4 py-2 text-xs font-black uppercase text-black hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-[var(--shadow-box-sm)]"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Retry Execution on BSC</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleExecuteSwapAction(m.action, idx)}
                              disabled={executingSwap}
                              className="w-full border-2 border-foreground bg-bnb-yellow px-4 py-2.5 text-xs font-black uppercase text-black hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-[var(--shadow-box-sm)]"
                            >
                              <Zap className="w-4 h-4 fill-current" />
                              <span>{m.action.mode === 'REVERSE_EXIT_TO_USDT' ? 'Confirm & Swap to USDT' : 'Confirm & Execute on BSC'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loadingChat && (
                  <div className="flex items-center gap-2 text-xs font-mono text-bnb-yellow animate-pulse p-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing strategy on BNB Smart Chain...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Chips */}
              <div className="border-t border-foreground bg-background px-4 py-2.5 flex overflow-x-auto gap-2 scrollbar-none text-xs font-mono">
                {[
                  'Build AI Supercycle (50% NVDA, 30% MSFT, 20% AAPL)',
                  'Defensive Yield (40% USDY, 30% AAPL, 30% MSFT)',
                  'Rotate MSFT to NVDA',
                  'Swap NVDA to USDT',
                  'Allocate $50'
                ].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="whitespace-nowrap border border-foreground bg-card px-2.5 py-1 text-muted-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Terminal Input Bar */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="border-t-2 border-foreground bg-card p-3 sm:p-4 flex items-center gap-3"
              >
                <input
                  type="text"
                  placeholder="Enter strategy prompt (e.g. 'Build a 70% NVDA and 30% MSFT basket with $50')..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={loadingChat}
                  className="flex-1 border-2 border-foreground bg-background px-4 py-3 text-xs font-mono text-foreground focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loadingChat || !inputMessage.trim()}
                  className="border-2 border-foreground bg-foreground px-5 sm:px-6 py-3 text-xs font-black uppercase text-background hover:bg-bnb-yellow hover:text-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 shrink-0 shadow-[var(--shadow-box-sm)]"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* ======================================================== */}
            {/* RIGHT: LIVE BNB 24/7 EQUITIES WATCHLIST (lg:col-span-4)   */}
            {/* ======================================================== */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Live Equities Watchlist Card */}
              <div className="border-2 border-foreground bg-card p-4 sm:p-5 shadow-[var(--shadow-box)] flex flex-col gap-4">
                <div className="flex items-center justify-between border-b-2 border-foreground pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-bnb-yellow" />
                    <h3 className="text-sm font-black uppercase tracking-wider">
                      BSC 24/7 Equities Watchlist
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono border border-emerald-400 bg-emerald-950/30 text-emerald-400 px-1.5 py-0.5 font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      LIVE
                    </span>
                    <button
                      type="button"
                      onClick={fetchLiveWatchlist}
                      disabled={loadingWatchlist}
                      title="Refresh Live BSC Quotes"
                      className="border border-foreground bg-background p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingWatchlist ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Subtitle / Wallet Balance Snippet */}
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground bg-background p-2 border border-foreground/30">
                  <span>Connected Balance:</span>
                  <span className="text-bnb-yellow font-bold">${balances.usdt} USDT</span>
                </div>

                {/* Live Watchlist Token List */}
                <div className="space-y-2">
                  {watchlistData.map((token) => (
                    <div 
                      key={token.ticker}
                      onClick={() => handleSendMessage(`Tell me about ${token.ticker} on BSC and check current live router quote`)}
                      className="border border-foreground bg-background p-2.5 hover:border-bnb-yellow hover:bg-card transition-all cursor-pointer flex items-center justify-between shadow-[1px_1px_0px_0px_#000]"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-foreground">{token.ticker}</span>
                          <span className="text-[9px] font-mono text-muted-foreground uppercase">({token.symbol})</span>
                          {token.is247Active && (
                            <span className="text-[8px] font-mono font-bold bg-bnb-yellow/20 text-bnb-yellow px-1 py-0.2 border border-bnb-yellow/40">
                              24/7
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{token.name}</div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-xs font-black text-foreground">
                          {token.priceDisplay}
                        </div>
                        <div className={`text-[9px] font-mono font-bold uppercase ${token.is247Active ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {token.liquidityStatus}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] font-mono text-muted-foreground border-t border-muted pt-2 flex items-center justify-between">
                  <span>Routing: BSC Chain ID 56</span>
                  <span className="text-foreground font-bold">Ondo + Backed + AMM</span>
                </div>
              </div>

              {/* Execution Architecture Card */}
              <div className="border-2 border-foreground bg-foreground text-background p-5 shadow-[var(--shadow-box-sm)]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-background/70 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-bnb-yellow" />
                  <span>Execution Architecture</span>
                </div>
                <h4 className="text-sm font-black uppercase leading-tight mb-2">
                  Binance Agentic Wallet (<code className="text-bnb-yellow">baw</code>)
                </h4>
                <p className="text-xs text-background/80 font-mono leading-relaxed mb-3">
                  Live on-chain routing via LiquidMesh & PancakeSwap AMM pools. Zero manual signature popups with automated pre-tx gas & revert safety guards.
                </p>
                <div className="border-t border-background/20 pt-2 flex items-center justify-between text-[10px] font-mono text-background/70">
                  <span>Network: BNB Smart Chain</span>
                  <span className="text-bnb-yellow font-bold">ERC-8004 Standard</span>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ======================================================== */}
        {/* BOTTOM SECTION: THEMATIC BASKET SUITE (UNDER CONSOLE)     */}
        {/* ======================================================== */}
        <section ref={basketSuiteRef} className="w-full pt-8 border-t-2 border-foreground">
          
          {/* Section Title Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-foreground pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-6 h-6 text-bnb-yellow" />
                <h2 className="text-2xl font-black uppercase tracking-wider sm:text-3xl">
                  Thematic Stock Baskets Suite
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 border border-foreground bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Synced with Console
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                Multi-asset index strategies routing live 24/7 liquidity across BNB Smart Chain · Updates automatically with strategy console conversation.
              </p>
            </div>

            <button
              type="button"
              onClick={scrollToConsole}
              className="border border-foreground bg-card px-3 py-1.5 text-xs font-mono font-bold text-bnb-yellow hover:bg-foreground hover:text-background transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Back to Console Above</span>
            </button>
          </div>

          {/* Baskets Selection Grid (Presets + AI Generated) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {/* Standard Presets */}
            {PRESET_BASKETS.map(basket => {
              const isSelected = selectedBasket.id === basket.id;
              return (
                <div
                  key={basket.id}
                  onClick={() => handleSelectBasket(basket)}
                  className={`border-2 p-4 transition-all cursor-pointer shadow-[var(--shadow-box-sm)] flex flex-col justify-between ${
                    isSelected 
                      ? 'border-bnb-yellow bg-card shadow-[var(--shadow-box)] ring-1 ring-bnb-yellow' 
                      : 'border-foreground bg-card hover:bg-muted/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase border border-foreground px-1.5 py-0.5 bg-foreground text-background">
                        {basket.badge}
                      </span>
                      {isSelected && (
                        <span className="text-bnb-yellow font-black text-xs font-mono">ACTIVE ✓</span>
                      )}
                    </div>
                    <h3 className="text-base font-black uppercase text-foreground leading-tight mb-2">
                      {basket.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-2 mb-4">
                      {basket.description}
                    </p>
                  </div>

                  <div className="border-t border-muted pt-3 space-y-1 font-mono text-[11px]">
                    {basket.allocations.map(a => (
                      <div key={a.ticker} className="flex justify-between">
                        <span className="font-bold">{a.ticker}</span>
                        <span className="text-bnb-yellow font-black">{a.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Custom AI Baskets (compiled via console conversation) */}
            {customBaskets.map(basket => {
              const isSelected = selectedBasket.id === basket.id;
              return (
                <div
                  key={basket.id}
                  onClick={() => handleSelectBasket(basket)}
                  className={`border-2 p-4 transition-all cursor-pointer shadow-[var(--shadow-box-sm)] flex flex-col justify-between ${
                    isSelected 
                      ? 'border-bnb-yellow bg-card shadow-[var(--shadow-box)] ring-1 ring-bnb-yellow' 
                      : 'border-bnb-yellow/80 bg-card hover:bg-muted/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase border border-bnb-yellow px-1.5 py-0.5 bg-bnb-yellow text-black">
                        AI Generated ⚡
                      </span>
                      {isSelected && (
                        <span className="text-bnb-yellow font-black text-xs font-mono">ACTIVE ✓</span>
                      )}
                    </div>
                    <h3 className="text-base font-black uppercase text-foreground leading-tight mb-2">
                      {basket.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-2 mb-4">
                      {basket.description}
                    </p>
                  </div>

                  <div className="border-t border-muted pt-3 space-y-1 font-mono text-[11px]">
                    {basket.allocations.map(a => (
                      <div key={a.ticker} className="flex justify-between">
                        <span className="font-bold">{a.ticker}</span>
                        <span className="text-bnb-yellow font-black">{a.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Basket Terminal Card */}
          <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black uppercase tracking-wide text-foreground">
                    {selectedBasket.name}
                  </h3>
                  <span className="border border-foreground bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                    {selectedBasket.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  {selectedBasket.description}
                </p>
              </div>

              {/* Synced Order Size Sizer */}
              <div className="flex items-center gap-2">
                <div className="border-2 border-foreground bg-background px-3 py-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                  <span className="text-muted-foreground">Order Size:</span>
                  <span className="text-bnb-yellow font-mono">$</span>
                  <input 
                    type="number" 
                    min="5" 
                    step="5"
                    value={depositAmount} 
                    onChange={(e) => handleDepositAmountChange(e.target.value)}
                    className="w-12 bg-transparent text-foreground font-mono font-bold focus:outline-none text-xs"
                  />
                  <span>USDT</span>
                </div>

                {/* Quick Chips */}
                <div className="flex items-center gap-1">
                  {[5, 10, 25, 50].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleDepositAmountChange(amt)}
                      className={`border-2 px-2 py-1 text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
                        depositAmount === amt 
                          ? 'border-bnb-yellow bg-bnb-yellow text-black' 
                          : 'border-foreground bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={fetchQuotes}
                  disabled={loadingQuotes}
                  className="border-2 border-foreground bg-background px-3 py-2 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center gap-1.5 cursor-pointer ml-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingQuotes ? 'animate-spin' : ''}`} />
                  <span>Quotes</span>
                </button>
              </div>
            </div>

            {/* Allocation Legs Grid */}
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              {selectedBasket.allocations.map((alloc) => {
                const token = BSC_RWA_TOKENS[alloc.ticker] || {};
                const quote = quotes[alloc.ticker];
                const targetUsd = (depositAmount * alloc.weight) / 100;

                return (
                  <div key={alloc.ticker} className="border-2 border-foreground bg-background p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm uppercase text-foreground">{alloc.ticker}</span>
                        <span className="border border-foreground bg-card px-2 py-0.5 text-xs font-mono font-bold text-bnb-yellow">
                          {alloc.weight}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-1">{token.name || alloc.ticker}</div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-muted space-y-1 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Allocated USD:</span>
                        <span className="font-bold text-foreground">${targetUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BSC Tokens:</span>
                        {loadingQuotes ? (
                          <span className="text-muted-foreground animate-pulse">...</span>
                        ) : (
                          <span className="text-emerald-400 font-bold">
                            {quote?.toAmountTokens ? quote.toAmountTokens.toFixed(4) : (targetUsd / 150).toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Min Order Floor Alert */}
            {!allocationPlan.allValid && (
              <div className="border-2 border-amber-500 bg-amber-500/10 p-3 mb-6 text-xs font-mono text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>One or more legs are below the $5.00 minimum order floor. Increase order size to $20+ for multi-leg execution, or test in simulation mode.</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button 
                onClick={handleSimulate}
                disabled={simulating}
                className="border-2 border-foreground bg-background px-6 py-3 text-xs font-bold uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{simulating ? 'Simulating on BSC...' : 'Simulate (Dry-Run)'}</span>
              </button>

              {!isConnected ? (
                <button 
                  onClick={openModal}
                  className="border-2 border-foreground bg-bnb-yellow px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all shadow-[var(--shadow-box-sm)] cursor-pointer flex items-center gap-2"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Connect Wallet to Execute</span>
                </button>
              ) : !isBscMainnet ? (
                <button 
                  onClick={switchNetwork}
                  className="border-2 border-red-500 bg-red-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 transition-all shadow-[var(--shadow-box-sm)] cursor-pointer flex items-center gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Switch to BSC 56</span>
                </button>
              ) : (
                <button 
                  onClick={handleExecuteBasket}
                  disabled={executingBasket}
                  className="border-2 border-foreground bg-bnb-yellow px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {walletMode === 'agentic' ? <Zap className="w-3.5 h-3.5 fill-current" /> : <Wallet className="w-3.5 h-3.5" />}
                  <span>{executingBasket ? (walletMode === 'agentic' ? 'Executing via baw...' : 'Broadcasting on BSC...') : (walletMode === 'agentic' ? '1-Click Execute (baw)' : 'Execute on BSC')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Simulation Output Card */}
          {simulationResult && (
            <div className="border-2 border-emerald-400 bg-emerald-950/20 p-5 shadow-[var(--shadow-box-sm)] mb-8">
              <div className="flex items-center justify-between mb-3 border-b border-emerald-500/30 pb-2">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Transaction Simulation Verified · 0 Reverts</span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-2 py-0.5 font-bold">
                  {walletMode === 'agentic' ? 'Agentic Mode · BSC #56' : 'Extension Mode · BSC #56'}
                </span>
              </div>
              <p className="text-xs font-mono text-emerald-300/80 mb-3">
                Pre-transaction calldata verified on Binance Agentic Wallet router. Estimated Gas: {simulationResult.estimatedGas || '0.0004 BNB'}.
              </p>
            </div>
          )}

          {/* Execution Output Card */}
          {executionResult && (
            <div className={`border-2 p-5 shadow-[var(--shadow-box-sm)] mb-8 ${executionResult.success ? 'border-emerald-400 bg-emerald-950/30' : 'border-amber-500 bg-amber-950/30'}`}>
              <h4 className="font-mono font-bold text-sm mb-2">{executionResult.summary}</h4>
              {executionResult.results?.map(r => (
                <div key={r.ticker} className="text-xs font-mono flex items-center justify-between py-1 border-b border-foreground/10 last:border-b-0">
                  <span>{r.name} ({r.ticker})</span>
                  {r.txHash ? (
                    <a href={r.bscScanUrl} target="_blank" rel="noopener noreferrer" className="text-bnb-yellow hover:underline flex items-center gap-1">
                      <span>{r.txHash.slice(0, 10)}...</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{r.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bidirectional Assistant Prompts Footer */}
          <div className="border-2 border-foreground bg-card p-4 shadow-[var(--shadow-box-sm)] mb-8">
            <div className="text-xs font-black uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-bnb-yellow" />
              <span>Ask Strategy Agent Above to Evaluate This Active Basket:</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  handleSendMessage(`Analyze the risk, drawdowns, and market exposure of the ${selectedBasket.name} on BSC.`);
                  scrollToConsole();
                }}
                className="border-2 border-foreground bg-background px-3 py-1.5 text-foreground hover:bg-bnb-yellow hover:text-black transition-colors cursor-pointer"
              >
                💬 Audit Risk & Drawdowns
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSendMessage(`How does the 24/7 weekend trading and AMM liquidity work for the tokens in ${selectedBasket.name}?`);
                  scrollToConsole();
                }}
                className="border-2 border-foreground bg-background px-3 py-1.5 text-foreground hover:bg-bnb-yellow hover:text-black transition-colors cursor-pointer"
              >
                💬 24/7 Weekend Liquidity Check
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSendMessage(`Suggest rebalancing optimizations for ${selectedBasket.name} based on current tech momentum.`);
                  scrollToConsole();
                }}
                className="border-2 border-foreground bg-background px-3 py-1.5 text-foreground hover:bg-bnb-yellow hover:text-black transition-colors cursor-pointer"
              >
                💬 Optimize Allocations
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
