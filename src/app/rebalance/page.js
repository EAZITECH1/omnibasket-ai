'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import { getMarketHoursStatus } from '../../services/marketHours';
import { calculateDrift } from '../../services/rebalancer';
import { PRESET_BASKETS } from '../../services/tokens';
import { 
  ArrowRightLeft, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  TrendingUp, 
  RefreshCw,
  ExternalLink 
} from 'lucide-react';

export default function RebalancePage() {
  const [marketStatus, setMarketStatus] = useState(getMarketHoursStatus());
  const [selectedBasket, setSelectedBasket] = useState(PRESET_BASKETS[0]);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState(null);

  // Sample portfolio to demonstrate real drift calculation
  const sampleHoldings = [
    { ticker: 'NVDA', valueUsd: 140 },
    { ticker: 'MSFT', valueUsd: 40 },
    { ticker: 'AAPL', valueUsd: 0 }
  ];
  const totalHoldingsValue = sampleHoldings.reduce((acc, h) => acc + h.valueUsd, 0);
  const driftAnalysis = calculateDrift(sampleHoldings, selectedBasket.allocations, totalHoldingsValue);

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketHoursStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleTriggerRebalance = async () => {
    setRebalancing(true);
    setRebalanceResult(null);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: selectedBasket.allocations,
          depositAmount: 20
        })
      });
      const data = await res.json();
      setRebalanceResult(data);
    } catch (e) {
      setRebalanceResult({
        success: false,
        summary: `Rebalance execution error: ${e.message}`
      });
    }
    setRebalancing(false);
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
              Continuous portfolio drift calculation and automated rebalancing through weekend TradFi freezes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="border-2 border-foreground bg-card px-3 py-1.5 text-xs font-mono font-bold text-bnb-yellow">
              NYSE Clock: {marketStatus.nyTime}
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
            {marketStatus.message} While Wall Street brokers are frozen, tokenized equities on BNB Smart Chain maintain continuous price discovery and execution via PancakeSwap & LiquidMesh AMM pools.
          </p>
        </div>

        {/* Portfolio Drift Analysis Table */}
        <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-4 mb-6">
            <div>
              <h3 className="text-lg font-black uppercase text-foreground">
                Target Allocation vs Current Holdings Drift
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                Active Benchmark: {selectedBasket.name} (Rebalance Trigger Threshold: 5.0%)
              </p>
            </div>

            <button
              onClick={handleTriggerRebalance}
              disabled={rebalancing}
              className="border-2 border-foreground bg-bnb-yellow text-black font-black uppercase px-5 py-2.5 text-xs hover:bg-white transition-all shadow-[var(--shadow-box-sm)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{rebalancing ? 'Broadcasting Rebalance...' : 'Execute Rebalance via baw'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b-2 border-foreground text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Asset</th>
                  <th className="py-2">Target %</th>
                  <th className="py-2">Current Value</th>
                  <th className="py-2">Current %</th>
                  <th className="py-2">Drift %</th>
                  <th className="py-2">Action Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {(Array.isArray(driftAnalysis) ? driftAnalysis : []).map((item) => (
                  <tr key={item.ticker} className="hover:bg-muted/30">
                    <td className="py-3 font-bold text-foreground">{item.ticker}</td>
                    <td className="py-3">{item.targetWeight}%</td>
                    <td className="py-3">${item.currentValueUsd}</td>
                    <td className="py-3">{item.currentWeight}%</td>
                    <td className="py-3 font-bold">
                      <span className={item.driftPercent > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {item.driftPercent > 0 ? `+${item.driftPercent}%` : `${item.driftPercent}%`}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`border px-1.5 py-0.5 text-[10px] font-bold ${
                        item.status.includes('SELL') 
                          ? 'border-amber-400 text-amber-400 bg-amber-400/10' 
                          : 'border-emerald-400 text-emerald-400 bg-emerald-400/10'
                      }`}>
                        {item.status} (${Math.abs(item.deltaUsd)})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rebalance Execution Result */}
        {rebalanceResult && (
          <div className={`border-2 p-5 shadow-[var(--shadow-box-sm)] ${rebalanceResult.success ? 'border-emerald-400 bg-emerald-950/30' : 'border-amber-500 bg-amber-950/30'}`}>
            <h4 className="font-mono font-bold text-sm mb-2">{rebalanceResult.summary}</h4>
            {rebalanceResult.results?.map(r => (
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
      </main>
    </div>
  );
}
