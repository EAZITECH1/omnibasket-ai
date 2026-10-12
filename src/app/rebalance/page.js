'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from '../../components/Navbar';
import { useWallet } from '../../context/WalletContext';
import { getMarketHoursStatus } from '../../services/marketHours';
import { calculateDrift, generateAllocationPlan } from '../../services/rebalancer';
import { PRESET_BASKETS, BSC_RWA_TOKENS } from '../../services/tokens';
import { executeBasket } from '../../services/basketExecutor.js';
import { getInjectedProvider, pollExtensionReceipt } from '../../lib/wallet/provider.js';
import { 
  ArrowRightLeft, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  TrendingUp, 
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  Sparkles,
  Info
} from 'lucide-react';

export default function RebalancePage() {
  const { isConnected, address, walletMode, openModal, isBscMainnet, switchNetwork, sendExtensionTransaction, refreshBalances } = useWallet();
  const [marketStatus, setMarketStatus] = useState(getMarketHoursStatus());
  const [selectedBasket, setSelectedBasket] = useState(PRESET_BASKETS[0]);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState(null);
  const [liveBalances, setLiveBalances] = useState({ usdtBal: 0, stocks: [], rawTokens: [] });
  const [livePrices, setLivePrices] = useState({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [rebalanceAmount, setRebalanceAmount] = useState(25);
  const [pollingOrderId, setPollingOrderId] = useState(null);

  // Poll market hours status every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketHoursStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live on-chain balances and real-time prices
  const fetchLiveBalancesAndPrices = useCallback(async () => {
    setLoadingBalances(true);
    try {
      // 1. Fetch live prices from RWA watchlist
      const priceRes = await fetch('/api/rwa/watchlist?t=' + Date.now(), { cache: 'no-store' });
      const priceData = await priceRes.json();
      const priceMap = {};
      if (priceData.success && Array.isArray(priceData.watchlist)) {
        for (const item of priceData.watchlist) {
          priceMap[item.ticker] = item.priceUsd;
        }
      }
      setLivePrices(priceMap);

      // 2. Fetch live balances according to connected wallet mode
      let balData = null;
      if (walletMode === 'agentic') {
        const bRes = await fetch('/api/agentic-wallet/balance?t=' + Date.now(), { cache: 'no-store' });
        balData = await bRes.json();
      } else if (address) {
        const bRes = await fetch(`/api/wallet/balance?address=${address}&t=` + Date.now(), { cache: 'no-store' });
        balData = await bRes.json();
      }

      if (balData?.success && Array.isArray(balData.tokens)) {
        const usdtToken = balData.tokens.find(t => 
          t.symbol?.toUpperCase() === 'USDT' || 
          t.address?.toLowerCase() === BSC_RWA_TOKENS.USDT.contractAddress.toLowerCase()
        );
        const usdtBal = parseFloat(usdtToken?.balance || 0);

        // Extract held stock assets
        const stockHoldings = [];
        for (const token of balData.tokens) {
          const sym = (token.symbol || '').replace(/on$/i, '').toUpperCase();
          const isStock = BSC_RWA_TOKENS[sym] && sym !== 'USDT';
          const qty = parseFloat(token.balance || 0);
          if (isStock && qty > 0.000001) {
            const price = priceMap[sym] || parseFloat(token.priceUsd || 0);
            stockHoldings.push({
              ticker: sym,
              symbol: token.symbol,
              name: BSC_RWA_TOKENS[sym]?.name || sym,
              balance: qty,
              priceUsd: price,
              valueUsd: parseFloat((qty * price).toFixed(2))
            });
          }
        }

        setLiveBalances({
          usdtBal,
          stocks: stockHoldings,
          rawTokens: balData.tokens
        });
      } else {
        setLiveBalances({ usdtBal: 0, stocks: [], rawTokens: [] });
      }
    } catch (err) {
      console.error('Failed to fetch live balances:', err);
    } finally {
      setLoadingBalances(false);
    }
  }, [walletMode, address]);

  useEffect(() => {
    fetchLiveBalancesAndPrices();
    const refreshListener = () => fetchLiveBalancesAndPrices();
    window.addEventListener('omnibasket-balance-refresh', refreshListener);
    return () => window.removeEventListener('omnibasket-balance-refresh', refreshListener);
  }, [fetchLiveBalancesAndPrices]);

  // Total stock holdings value (USD)
  const totalStockValue = useMemo(() => {
    return liveBalances.stocks.reduce((acc, h) => acc + h.valueUsd, 0);
  }, [liveBalances.stocks]);

  // Total combined portfolio value (USDT + Stocks)
  const totalPortfolioValue = useMemo(() => {
    return parseFloat((totalStockValue + liveBalances.usdtBal).toFixed(2));
  }, [totalStockValue, liveBalances.usdtBal]);

  // Calculate live drift against the selected target basket
  const driftAnalysis = useMemo(() => {
    const baseline = totalStockValue > 0 ? totalStockValue : totalPortfolioValue;
    return calculateDrift(liveBalances.stocks, selectedBasket.allocations, baseline);
  }, [liveBalances.stocks, selectedBasket.allocations, totalStockValue, totalPortfolioValue]);

  // Max drift percentage
  const maxDrift = useMemo(() => {
    if (!Array.isArray(driftAnalysis) || driftAnalysis.length === 0) return 0;
    return Math.max(...driftAnalysis.map(d => Math.abs(d.driftPercent || 0)));
  }, [driftAnalysis]);

  const hasExceededDrift = maxDrift >= 5.0;

  // Poll for terminal status on active order
  const pollOrderUntilFinished = async (orderId) => {
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/wallet/recent-orders?orderId=${encodeURIComponent(orderId)}&t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        const found = data.orders?.find(o => String(o.orderId) === String(orderId));
        if (found) {
          if (found.status === 'FINISHED' || found.status === 'FAILED') {
            return found;
          }
        }
      } catch (_) {}
    }
    return null;
  };

  // Execute Rebalance Live on BSC
  const handleTriggerRebalance = async () => {
    if (!isConnected && !address) {
      openModal();
      return;
    }

    if (!isBscMainnet) {
      switchNetwork();
      return;
    }

    setRebalancing(true);
    setRebalanceResult(null);

    try {
      const depositVal = parseFloat(rebalanceAmount) || 25;
      const overweight = Array.isArray(driftAnalysis) ? driftAnalysis.find(d => d.driftPercent > 5) : null;
      const underweight = Array.isArray(driftAnalysis) ? driftAnalysis.find(d => d.driftPercent < -5) : null;

      if (walletMode === 'agentic') {
        let payload;

        // If user has stock holdings with drift and less than $5 USDT: Execute direct stock-to-stock rotation rebalance
        if (liveBalances.usdtBal < 5 && overweight && underweight && overweight.currentValueUsd >= 5) {
          const fromTicker = overweight.ticker;
          const toTicker = underweight.ticker;
          const fromPrice = livePrices[fromTicker] || 100;
          const rotateUsd = Math.min(Math.abs(overweight.deltaUsd || 10), overweight.currentValueUsd);
          const fromQty = parseFloat((rotateUsd / fromPrice).toFixed(6));

          payload = {
            mode: 'STOCK_TO_STOCK_ROTATION',
            fromTicker,
            toTicker,
            fromQty,
            chainId: 56
          };
        } else {
          if (depositVal < 5) {
            throw new Error('Minimum rebalance order size is $5.00 USDT on BNB Smart Chain.');
          }

          // If underweight positions exist, target them with the deposit; otherwise use benchmark weights
          let targetAllocs = selectedBasket.allocations;
          const underweights = Array.isArray(driftAnalysis) ? driftAnalysis.filter(d => d.driftPercent < -5) : [];
          if (underweights.length > 0 && liveBalances.stocks.length > 0) {
            const totalDeficit = underweights.reduce((sum, u) => sum + Math.abs(u.deltaUsd || 1), 0);
            targetAllocs = underweights.map(u => ({
              ticker: u.ticker,
              name: BSC_RWA_TOKENS[u.ticker]?.name || u.ticker,
              weight: parseFloat(((Math.abs(u.deltaUsd || 1) / totalDeficit) * 100).toFixed(2))
            }));
          }

          payload = {
            mode: 'BUY_FROM_USDT',
            investmentAmount: depositVal,
            allocations: targetAllocs,
            chainId: 56
          };
        }

        const execRes = await fetch('/api/agentic-wallet/execute-basket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const execData = await execRes.json();
        if (!execData.success) {
          throw new Error(execData.error || execData.message || 'Rebalance order submission rejected');
        }

        const firstAlloc = execData.allocations?.[0];
        let finalTxHash = firstAlloc?.txHash || execData.txHash || null;
        let finalStatus = firstAlloc?.status || execData.statusDisplay || 'SUBMITTED';
        const orderId = firstAlloc?.orderId || execData.orderId || null;

        // If order still confirming, poll recent orders for terminal state
        if (!finalTxHash && orderId) {
          setPollingOrderId(orderId);
          const terminalOrder = await pollOrderUntilFinished(orderId);
          if (terminalOrder) {
            finalTxHash = terminalOrder.txHash;
            finalStatus = terminalOrder.status;
          }
          setPollingOrderId(null);
        }

        setRebalanceResult({
          success: true,
          summary: finalTxHash 
            ? `✅ Rebalancing executed on BNB Smart Chain Mainnet!` 
            : `Order submitted to BSC DEX. Confirming on-chain...`,
          results: execData.allocations?.map(a => ({
            ticker: a.ticker,
            name: a.name || a.ticker,
            txHash: a.txHash || finalTxHash,
            bscScanUrl: (a.txHash || finalTxHash) ? `https://bscscan.com/tx/${a.txHash || finalTxHash}` : null,
            status: a.status || finalStatus
          })) || [{
            ticker: payload.toTicker || selectedBasket.allocations[0]?.ticker,
            name: payload.toTicker || selectedBasket.allocations[0]?.ticker,
            txHash: finalTxHash,
            bscScanUrl: finalTxHash ? `https://bscscan.com/tx/${finalTxHash}` : null,
            status: finalStatus
          }]
        });

        window.dispatchEvent(new Event('omnibasket-balance-refresh'));
        fetchLiveBalancesAndPrices();
      } else {
        // Browser extension mode: user signs via wallet extension
        if (depositVal < 5) {
          throw new Error('Minimum rebalance order size is $5.00 USDT on BNB Smart Chain.');
        }

        const provider = getInjectedProvider();
        if (!provider) {
          throw new Error('No Web3 wallet provider detected. Please install Binance Web3 Wallet extension.');
        }

        let targetAllocs = selectedBasket.allocations;
        const underweights = Array.isArray(driftAnalysis) ? driftAnalysis.filter(d => d.driftPercent < -5) : [];
        if (underweights.length > 0 && liveBalances.stocks.length > 0) {
          const totalDeficit = underweights.reduce((sum, u) => sum + Math.abs(u.deltaUsd || 1), 0);
          targetAllocs = underweights.map(u => ({
            ticker: u.ticker,
            name: BSC_RWA_TOKENS[u.ticker]?.name || u.ticker,
            weight: parseFloat(((Math.abs(u.deltaUsd || 1) / totalDeficit) * 100).toFixed(2))
          }));
        }

        const execResult = await executeBasket({
          allocations: targetAllocs,
          depositAmount: depositVal,
          userWalletAddress: address,
          provider,
          sendTransactionFn: sendExtensionTransaction,
          pollReceiptFn: pollExtensionReceipt
        });

        if (!execResult.success && (!execResult.results || execResult.results.length === 0)) {
          throw new Error(execResult.summary || 'Extension rebalance execution rejected');
        }

        const results = execResult.results || [];
        setRebalanceResult({
          success: execResult.success,
          summary: execResult.summary || `✅ Rebalancing executed on BNB Smart Chain via Browser Extension!`,
          results: results.map(r => ({
            ticker: r.ticker,
            name: r.name || r.ticker,
            txHash: r.txHash,
            bscScanUrl: r.bscScanUrl || (r.txHash ? `https://bscscan.com/tx/${r.txHash}` : null),
            status: r.success ? 'FINISHED' : (r.status || 'FAILED')
          }))
        });

        window.dispatchEvent(new Event('omnibasket-balance-refresh'));
        fetchLiveBalancesAndPrices();
      }
    } catch (e) {
      setRebalanceResult({
        success: false,
        summary: `Rebalance execution error: ${e.message}`,
        results: []
      });
    } finally {
      setRebalancing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true"></div>

        {/* Header */}
        <div className="mb-8 border-b-2 border-foreground pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-bnb-yellow" />
              <h1 className="text-2xl font-black uppercase tracking-wider sm:text-3xl">
                24/7 Smart DCA & Drift Rebalance Sentinel
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Live on-chain portfolio drift monitoring and zero-revert rebalancing on BNB Smart Chain Mainnet (Chain ID 56).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="border-2 border-foreground bg-card px-3 py-1.5 text-xs font-mono font-bold text-bnb-yellow flex items-center gap-1.5 shadow-[var(--shadow-box-sm)]">
              <Clock className="w-3.5 h-3.5" />
              <span>NYSE Clock: {marketStatus.nyTime}</span>
            </span>
          </div>
        </div>

        {/* TradFi vs BSC 24/7 Banner */}
        <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] mb-8">
          <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
              <Clock className="w-4 h-4 text-bnb-yellow" />
              <span>Weekend Sentinel Status: {marketStatus.session}</span>
            </div>
            <span className="text-[10px] font-mono border border-foreground bg-foreground text-background px-2 py-0.5 font-bold">
              BSC AMM 24/7 Continuous
            </span>
          </div>
          <p className="text-xs font-mono text-muted-foreground leading-relaxed">
            {marketStatus.message} While Wall Street brokers are frozen, tokenized equities on BNB Smart Chain maintain continuous price discovery and execution via PancakeSwap & LiquidMesh AMM pools under strict 0.5% slippage protection.
          </p>
        </div>

        {/* Live Wallet Holdings Summary */}
        <div className="border-2 border-foreground bg-background p-6 shadow-[var(--shadow-box)] mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-bnb-yellow" />
              <h3 className="text-sm font-black uppercase">Live Connected On-Chain Portfolio</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchLiveBalancesAndPrices}
                disabled={loadingBalances}
                className="text-[11px] font-mono border border-foreground px-2.5 py-1 hover:bg-foreground hover:text-background transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingBalances ? 'animate-spin' : ''}`} />
                <span>Refresh Live Balances</span>
              </button>
              {address && (
                <span className="font-mono text-xs text-muted-foreground border border-foreground/30 px-2 py-0.5">
                  {address.slice(0, 6)}...{address.slice(-4)} ({walletMode === 'agentic' ? 'Binance MPC Wallet' : 'Web3 Extension'})
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="border border-foreground/30 p-3 bg-card">
              <div className="text-[11px] text-muted-foreground uppercase">Native Base Reserve</div>
              <div className="text-lg font-bold text-bnb-yellow mt-1">${liveBalances.usdtBal.toFixed(2)} USDT</div>
            </div>
            <div className="border border-foreground/30 p-3 bg-card">
              <div className="text-[11px] text-muted-foreground uppercase">Tokenized Equities Value</div>
              <div className="text-lg font-bold text-foreground mt-1">${totalStockValue.toFixed(2)} USD</div>
            </div>
            <div className="border border-foreground/30 p-3 bg-card">
              <div className="text-[11px] text-muted-foreground uppercase">Total Portfolio Net Asset</div>
              <div className="text-lg font-bold text-foreground mt-1">${totalPortfolioValue.toFixed(2)} USD</div>
            </div>
          </div>

          {liveBalances.stocks.length > 0 ? (
            <div className="mt-4 pt-3 border-t border-foreground/10 flex flex-wrap gap-2 text-xs font-mono">
              <span className="text-muted-foreground mr-1 font-bold">Active Positions:</span>
              {liveBalances.stocks.map(s => (
                <span key={s.ticker} className="border border-foreground/40 bg-card px-2 py-0.5">
                  {s.ticker}: {s.balance.toFixed(4)} (${s.valueUsd.toFixed(2)})
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-4 pt-3 border-t border-foreground/10 text-xs font-mono text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-bnb-yellow" />
              <span>No tokenized equity positions held yet. Allocate USDT to establish your benchmark basket.</span>
            </div>
          )}
        </div>

        {/* Portfolio Drift Analysis Table */}
        <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-foreground pb-4 mb-6">
            <div>
              <h3 className="text-lg font-black uppercase text-foreground">
                Target Allocation vs Current Holdings Drift
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Benchmark Basket: <span className="text-bnb-yellow font-bold">{selectedBasket.name}</span> · Drift Sensitivity Threshold: <span className="font-bold">5.0%</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">Select Benchmark:</span>
                <select
                  value={selectedBasket.id}
                  onChange={(e) => {
                    const found = PRESET_BASKETS.find(b => b.id === e.target.value);
                    if (found) setSelectedBasket(found);
                  }}
                  className="border-2 border-foreground bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground focus:outline-none cursor-pointer"
                >
                  {PRESET_BASKETS.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 border-2 border-foreground bg-background px-2.5 py-1">
                <span className="text-xs font-mono text-muted-foreground">Order Size:</span>
                <span className="text-xs font-mono text-bnb-yellow">$</span>
                <input
                  type="number"
                  min="5"
                  max="10000"
                  step="5"
                  value={rebalanceAmount}
                  onChange={(e) => setRebalanceAmount(Math.max(5, parseFloat(e.target.value) || 5))}
                  className="w-16 bg-transparent text-xs font-mono font-bold text-foreground focus:outline-none"
                />
                <span className="text-xs font-mono text-muted-foreground">USDT</span>
              </div>

              <button
                onClick={handleTriggerRebalance}
                disabled={rebalancing}
                className="border-2 border-foreground bg-bnb-yellow text-black font-black uppercase px-5 py-2 text-xs hover:bg-white transition-all shadow-[var(--shadow-box-sm)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {rebalancing ? (pollingOrderId ? 'Confirming on BSC...' : 'Broadcasting Rebalance...') : (walletMode === 'agentic' ? 'Execute Rebalance via baw' : 'Execute Rebalance on BSC')}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b-2 border-foreground text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2.5">Asset</th>
                  <th className="py-2.5">Live Unit Price</th>
                  <th className="py-2.5">Current Balance</th>
                  <th className="py-2.5">Current Value</th>
                  <th className="py-2.5">Target Weight</th>
                  <th className="py-2.5">Current Weight</th>
                  <th className="py-2.5">Drift %</th>
                  <th className="py-2.5">Action Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {(Array.isArray(driftAnalysis) ? driftAnalysis : []).map((item) => {
                  const heldItem = liveBalances.stocks.find(s => s.ticker === item.ticker);
                  const price = livePrices[item.ticker] || (heldItem?.priceUsd) || 0;
                  const qty = heldItem?.balance || 0;

                  return (
                    <tr key={item.ticker} className="hover:bg-muted/30">
                      <td className="py-3 font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{item.ticker}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">({BSC_RWA_TOKENS[item.ticker]?.symbol || item.ticker})</span>
                        </div>
                      </td>
                      <td className="py-3">${price > 0 ? price.toFixed(2) : '...'}</td>
                      <td className="py-3">{qty > 0 ? qty.toFixed(4) : '0.0000'}</td>
                      <td className="py-3">${item.currentValueUsd.toFixed(2)}</td>
                      <td className="py-3 font-bold text-bnb-yellow">{item.targetWeight}%</td>
                      <td className="py-3">{item.currentWeight}%</td>
                      <td className="py-3 font-bold">
                        <span className={item.driftPercent > 5 ? 'text-amber-400' : (item.driftPercent < -5 ? 'text-emerald-400' : 'text-foreground')}>
                          {item.driftPercent > 0 ? `+${item.driftPercent}%` : `${item.driftPercent}%`}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`border px-2 py-0.5 text-[10px] font-bold ${
                          item.status.includes('SELL') 
                            ? 'border-amber-400 text-amber-400 bg-amber-400/10' 
                            : (item.status.includes('BUY') 
                                ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10' 
                                : 'border-foreground/30 text-muted-foreground bg-card')
                        }`}>
                          {item.status} {item.deltaUsd ? `($${Math.abs(item.deltaUsd)})` : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rebalance Execution Result */}
        {rebalanceResult && (
          <div className={`border-2 p-5 shadow-[var(--shadow-box-sm)] mb-8 ${rebalanceResult.success ? 'border-emerald-400 bg-emerald-950/30' : 'border-red-500 bg-red-950/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              {rebalanceResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <h4 className="font-mono font-bold text-sm">{rebalanceResult.summary}</h4>
            </div>

            {rebalanceResult.results?.map(r => (
              <div key={r.ticker} className="text-xs font-mono flex items-center justify-between py-1.5 border-b border-foreground/10 last:border-b-0">
                <span className="font-bold">{r.name} ({r.ticker})</span>
                {r.txHash ? (
                  <a href={r.bscScanUrl} target="_blank" rel="noopener noreferrer" className="text-bnb-yellow hover:underline flex items-center gap-1">
                    <span>{r.txHash.slice(0, 10)}...{r.txHash.slice(-8)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{r.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
