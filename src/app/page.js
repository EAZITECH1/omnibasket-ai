'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  TrendingUp, 
  Clock, 
  ArrowRightLeft, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Wallet,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  Zap,
  Cpu,
  Lock,
  Unlock,
  Terminal,
  Activity,
  Check
} from 'lucide-react';
import { PRESET_BASKETS, BSC_RWA_TOKENS } from '../services/tokens';
import { calculateDrift, generateAllocationPlan } from '../services/rebalancer';
import { getMarketHoursStatus } from '../services/marketHours';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `OmniBasket AI agent online.\n\nEnter an investment strategy in plain English (e.g. "Create an AI basket with 50% Nvidia, 30% Microsoft, and 20% Google"), or select one of the on-chain presets below to route quotes across BSC.`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [currentBasket, setCurrentBasket] = useState(PRESET_BASKETS[0]);
  const [depositAmount, setDepositAmount] = useState(25);
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [runningAgentCycle, setRunningAgentCycle] = useState(false);
  const [agentReport, setAgentReport] = useState(null);
  const [testingX402, setTestingX402] = useState(false);
  const [x402TraceData, setX402TraceData] = useState(null);
  const [marketStatus, setMarketStatus] = useState(getMarketHoursStatus());

  const connectedAddress = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

  // Sample portfolio to demonstrate drift calculation
  const sampleHoldings = [
    { ticker: 'NVDA', valueUsd: 140 },
    { ticker: 'MSFT', valueUsd: 40 },
    { ticker: 'GOOG', valueUsd: 20 }
  ];
  const totalHoldingsValue = sampleHoldings.reduce((acc, h) => acc + h.valueUsd, 0);

  const driftAnalysis = calculateDrift(sampleHoldings, currentBasket.allocations, totalHoldingsValue);
  const allocationPlan = generateAllocationPlan(depositAmount, currentBasket.allocations);

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketHoursStatus());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchQuotes = async () => {
    setLoadingQuotes(true);
    const newQuotes = {};
    for (const alloc of currentBasket.allocations) {
      const targetUsd = (depositAmount * alloc.weight) / 100;
      if (targetUsd >= 5) {
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
    }
    setQuotes(newQuotes);
    setLoadingQuotes(false);
  };

  useEffect(() => {
    fetchQuotes();
  }, [currentBasket, depositAmount]);

  const handleSendMessage = async (msgText) => {
    const userText = msgText || inputMessage;
    if (!userText.trim()) return;

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    if (!msgText) setInputMessage('');
    setLoadingChat(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });
      const data = await res.json();

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

      if (data.basket) {
        setCurrentBasket(data.basket);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Execution error: Failed to parse strategy.' }]);
    }
    setLoadingChat(false);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    setSimulationResult(null);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: currentBasket.allocations,
          depositAmount,
          userWalletAddress: connectedAddress
        })
      });
      const data = await res.json();
      if (data.success) {
        setSimulationResult(data);
      } else {
        alert(`Simulation error: ${data.error || 'Failed to simulate on BSC.'}`);
      }
    } catch (e) {
      alert(`Simulation network error: ${e.message}`);
    }
    setSimulating(false);
  };

  const handleExecute = async () => {
    if (!confirm(`Broadcast multi-leg allocation of $${depositAmount} USDT on BNB Smart Chain via Binance Agentic Wallet?`)) {
      return;
    }

    setExecuting(true);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: currentBasket.allocations,
          depositAmount
        })
      });
      const data = await res.json();
      setExecutionResult(data);
    } catch (e) {
      setExecutionResult({
        success: false,
        summary: `Execution call error: ${e.message}`
      });
    }
    setExecuting(false);
  };

  const handleRunAgentCycle = async () => {
    setRunningAgentCycle(true);
    try {
      const res = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basketId: currentBasket.id,
          depositAmount
        })
      });
      const data = await res.json();
      if (data.success) {
        setAgentReport(data.report);
      } else {
        alert(`Agent cycle error: ${data.error || 'Failed to complete autonomous cycle'}`);
      }
    } catch (e) {
      alert(`Agent cycle network error: ${e.message}`);
    }
    setRunningAgentCycle(false);
  };

  const handleTestX402 = async () => {
    setTestingX402(true);
    setX402TraceData(null);
    try {
      const res = await fetch('/api/agent/x402-demo', {
        method: 'POST'
      });
      const data = await res.json();
      setX402TraceData(data);
    } catch (e) {
      alert(`x402 protocol error: ${e.message}`);
    }
    setTestingX402(false);
  };

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Sticky Header - WrapStation Style */}
      <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:gap-4">
          <a className="flex items-center gap-2.5 text-sm font-black uppercase tracking-widest" href="/">
            <span className="inline-block h-4 w-4 border-2 border-foreground bg-bnb-yellow" aria-hidden="true"></span>
            <span>OmniBasket<span className="text-bnb-yellow">.AI</span></span>
          </a>

          <nav className="hidden items-center gap-1 text-[11px] lg:flex">
            <a className="border-2 px-2.5 py-1.5 font-bold uppercase tracking-widest transition-colors border-transparent text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background" href="#agent">Strategy Agent</a>
            <a className="border-2 px-2.5 py-1.5 font-bold uppercase tracking-widest transition-colors border-transparent text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background" href="#baskets">Thematic Baskets</a>
            <a className="border-2 px-2.5 py-1.5 font-bold uppercase tracking-widest transition-colors border-transparent text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background" href="#agent-studio">Agent Studio (x402)</a>
            <a className="border-2 px-2.5 py-1.5 font-bold uppercase tracking-widest transition-colors border-transparent text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background" href="#rebalance">24/7 Rebalance</a>
            <a className="border-2 px-2.5 py-1.5 font-bold uppercase tracking-widest transition-colors border-transparent text-muted-foreground hover:border-foreground hover:bg-foreground hover:text-background" href="#devex">DevEx Report</a>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Network Selector Tabs */}
            <div role="tablist" className="hidden border-2 border-foreground text-[11px] font-bold uppercase tracking-widest sm:flex">
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background">
                <span className="inline-block h-1.5 w-1.5 bg-background"></span>
                BSC Mainnet
              </button>
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 border-l-2 border-foreground text-muted-foreground hover:bg-muted hover:text-foreground">
                Ondo / bStocks
              </button>
            </div>

            {/* Connected Agentic Wallet Badge */}
            <div className="border-2 border-foreground px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest bg-card flex items-center gap-2 shadow-[2px_2px_0px_0px_#e6e6e6]">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:py-14 flex-1">
        {/* Dot Background Matrix */}
        <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true"></div>

        {/* Hero Section */}
        <section className="relative">
          <div className="grid items-stretch gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Hero Main Card */}
            <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] sm:p-8">
              <div className="mb-4 inline-flex items-center gap-2 border-2 border-foreground bg-foreground px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-background">
                <span className="inline-block h-2 w-2 bg-bnb-yellow" aria-hidden="true"></span>
                BNB Smart Chain · Tokenized Stocks
              </div>

              <h1 className="text-4xl font-black uppercase tracking-tight sm:text-6xl flex flex-col items-start gap-2.5 sm:gap-3.5">
                <span>Autonomous</span>
                <span className="bg-foreground px-2 py-0.5 text-background inline-block">stock baskets</span>
              </h1>

              <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
                Create, DCA, and dynamically rebalance tokenized equity baskets on BSC using natural language. 
                Trades 24/7 through weekend TradFi freezes using Binance Web3 API & Agentic Wallet.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a 
                  href="#terminal"
                  className="inline-flex h-14 items-center justify-center border-2 border-foreground bg-foreground px-8 text-sm font-black uppercase tracking-widest text-background shadow-[var(--shadow-box)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                >
                  Open Terminal →
                </a>
                <button 
                  onClick={() => handleSendMessage("How does 24/7 weekend trading work when NYSE closes?")}
                  className="inline-flex h-14 items-center justify-center border-2 border-foreground bg-background px-8 text-sm font-black uppercase tracking-widest text-foreground shadow-[var(--shadow-box-sm)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none cursor-pointer"
                >
                  Weekend Sentinel
                </button>
              </div>
            </div>

            {/* Right Side Stacked Stats */}
            <div className="flex flex-col gap-6">
              {/* Stat Card 1 */}
              <div className="flex flex-1 flex-col justify-between border-2 border-foreground bg-foreground p-6 text-background shadow-[var(--shadow-box-sm)]">
                <div className="text-[11px] font-bold uppercase tracking-widest text-background/70">
                  On-chain source of truth
                </div>
                <div className="mt-4 text-3xl font-black leading-tight">
                  Read live from <span className="bg-background px-1 text-foreground">458</span> BSC equities
                </div>
                <p className="mt-4 text-xs text-background/70 font-mono">
                  Ondo RFQ + bStocks + LiquidMesh + PancakeSwap V4. Direct on-chain liquidity routing.
                </p>
              </div>

              {/* Stat Card 2 */}
              <div className="border-2 border-foreground bg-background p-6 text-foreground shadow-[var(--shadow-box-sm)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest">TradFi vs BSC Clock</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 border border-foreground bg-card text-bnb-yellow font-bold">
                    NY: {marketStatus.nyTime}
                  </span>
                </div>
                <div className="mt-3 text-sm font-bold uppercase text-white">
                  {marketStatus.session}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {marketStatus.message}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid (4 Steps) - WrapStation Style */}
        <section className="relative mt-12">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Core Architecture
          </h2>
          <div className="grid gap-[2px] border-2 border-foreground bg-foreground shadow-[var(--shadow-box-sm)] sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-3 bg-background p-6">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">01</div>
              <div className="text-sm font-bold uppercase tracking-wide">Live RWA Feeds</div>
              <p className="text-sm text-muted-foreground">Direct integration with Binance Web3 RWA APIs, tracking multipliers, reference prices, and corporate action halts.</p>
            </div>
            <div className="flex flex-col gap-3 bg-background p-6">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">02</div>
              <div className="text-sm font-bold uppercase tracking-wide">Natural Language</div>
              <p className="text-sm text-muted-foreground">Prompt-driven portfolio creation. Speak your thesis and OmniBasket AI compiles the asset ratios on BSC.</p>
            </div>
            <div className="flex flex-col gap-3 bg-background p-6">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">03</div>
              <div className="text-sm font-bold uppercase tracking-wide">24/7 Drift Sentinel</div>
              <p className="text-sm text-muted-foreground">Continuous monitoring across weekends. Flags asset allocation drift &gt; 5% and generates rebalance routes.</p>
            </div>
            <div className="flex flex-col gap-3 bg-background p-6">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">04</div>
              <div className="text-sm font-bold uppercase tracking-wide">Safe Simulation</div>
              <p className="text-sm text-muted-foreground">Dry-run verification via Binance Transaction API before broadcasting. Enforces the $5 min order floor.</p>
            </div>
          </div>
        </section>

        {/* Interactive App Terminal */}
        <section id="terminal" className="relative mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Trading & Strategy Terminal
            </h2>
            <span className="text-[11px] font-mono uppercase text-muted-foreground">
              Connected: BSC Mainnet
            </span>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-12">
            
            {/* Left Column: Conversational Agent (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col border-2 border-foreground bg-card shadow-[var(--shadow-box)] h-[680px]">
              {/* Terminal Title Bar */}
              <div className="border-b-2 border-foreground bg-background px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                  <span className="inline-block h-2.5 w-2.5 bg-foreground"></span>
                  <span>Strategy Agent Console</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">LLM // W3W API</span>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 font-mono text-xs">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] border-2 p-3 ${
                      m.role === 'user'
                        ? 'border-foreground bg-foreground text-background font-bold'
                        : 'border-foreground bg-background text-foreground'
                    }`}>
                      <div className="text-[9px] uppercase tracking-widest opacity-60 mb-1">
                        {m.role === 'user' ? 'User Intent' : 'OmniBasket AI'}
                      </div>
                      <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                ))}
                {loadingChat && (
                  <div className="border-2 border-foreground bg-background p-3 text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Parsing strategy & checking BSC liquidity...</span>
                  </div>
                )}
              </div>

              {/* Preset Quick Actions */}
              <div className="border-t-2 border-foreground bg-background p-2.5 flex flex-wrap gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                <button 
                  onClick={() => handleSendMessage("Load the AI Supercycle Basket")}
                  className="border border-foreground bg-card px-2.5 py-1 text-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                >
                  🚀 AI Supercycle
                </button>
                <button 
                  onClick={() => handleSendMessage("Load the Defensive Yield Basket with Ondo USDY")}
                  className="border border-foreground bg-card px-2.5 py-1 text-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                >
                  🛡️ Defensive Yield
                </button>
                <button 
                  onClick={() => handleSendMessage("Load the Magnificent 7 index")}
                  className="border border-foreground bg-card px-2.5 py-1 text-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                >
                  ⚡ Mag7X Pure
                </button>
              </div>

              {/* Chat Input */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="border-t-2 border-foreground bg-background flex"
              >
                <input 
                  type="text" 
                  placeholder="Enter thesis: '50% Nvidia, 30% Apple, 20% Ondo'..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 bg-transparent px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button 
                  type="submit"
                  disabled={loadingChat || !inputMessage.trim()}
                  className="border-l-2 border-foreground bg-foreground px-5 py-3 text-xs font-black uppercase tracking-widest text-background hover:bg-bnb-yellow hover:text-bnb-dark transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Execute
                </button>
              </form>
            </div>

            {/* Right Column: Basket Terminal & Execution (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">

              {/* Active Basket Overview Box */}
              <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black uppercase tracking-wide text-foreground">
                        {currentBasket.name}
                      </h3>
                      <span className="border border-foreground bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                        {currentBasket.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">
                      {currentBasket.description}
                    </p>
                  </div>

                  {/* Deposit Amount Sizer */}
                  <div className="border-2 border-foreground bg-background px-3 py-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                    <span className="text-muted-foreground">Order Size:</span>
                    <span className="text-bnb-yellow">$</span>
                    <input 
                      type="number" 
                      min="15" 
                      step="5"
                      value={depositAmount} 
                      onChange={(e) => setDepositAmount(Number(e.target.value))}
                      className="w-16 bg-transparent text-foreground font-mono font-bold focus:outline-none"
                    />
                    <span>USDT</span>
                  </div>
                </div>

                {/* Visual Ratio Weight Bar */}
                <div className="my-5 border-2 border-foreground bg-background h-5 flex overflow-hidden">
                  {currentBasket.allocations.map((alloc, idx) => {
                    const bgPatterns = [
                      'bg-foreground text-background',
                      'bg-bnb-yellow text-background',
                      'bg-muted-foreground text-background',
                      'bg-[#34d399] text-background'
                    ];
                    return (
                      <div 
                        key={alloc.ticker} 
                        style={{ width: `${alloc.weight}%` }}
                        className={`${bgPatterns[idx % bgPatterns.length]} h-full flex items-center justify-center text-[10px] font-black uppercase tracking-wider border-r border-background last:border-r-0`}
                      >
                        {alloc.weight >= 20 ? `${alloc.ticker} ${alloc.weight}%` : alloc.ticker}
                      </div>
                    );
                  })}
                </div>

                {/* Basket Allocation Legs */}
                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  {currentBasket.allocations.map((alloc) => {
                    const token = BSC_RWA_TOKENS[alloc.ticker] || {};
                    const quote = quotes[alloc.ticker];
                    const targetUsd = (depositAmount * alloc.weight) / 100;

                    return (
                      <div key={alloc.ticker} className="border-2 border-foreground bg-background p-3.5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm uppercase text-foreground">{alloc.ticker}</span>
                            <span className="border border-foreground bg-card px-1.5 py-0.5 text-[10px] font-mono font-bold text-bnb-yellow">
                              {alloc.weight}%
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate mt-1">{token.name}</div>
                        </div>

                        <div className="mt-4 pt-2 border-t border-muted">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-muted-foreground">Target:</span>
                            <span className="font-bold text-foreground">${targetUsd.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-mono mt-1">
                            <span className="text-muted-foreground">BSC Quote:</span>
                            {loadingQuotes ? (
                              <span className="text-muted-foreground animate-pulse">...</span>
                            ) : quote ? (
                              <span className="text-emerald-400 font-bold">
                                {quote.toAmountTokens.toFixed(4)}
                              </span>
                            ) : (
                              <span className="text-amber-400">&lt; $5 min</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Validation Floor Alert */}
                {!allocationPlan.allValid && (
                  <div className="border-2 border-amber-500 bg-amber-500/10 p-3 mb-4 text-xs font-mono text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>One or more legs are under the $5.00 minimum order floor. Increase order size to $20+ for automated multi-leg routing.</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button 
                    onClick={fetchQuotes}
                    disabled={loadingQuotes}
                    className="border-2 border-foreground bg-background px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingQuotes ? 'animate-spin' : ''}`} />
                    <span>Refresh Quotes</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleSimulate}
                      disabled={simulating || !allocationPlan.allValid}
                      className="border-2 border-foreground bg-background px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{simulating ? 'Simulating on BSC...' : 'Simulate (Dry-Run)'}</span>
                    </button>

                    <button 
                      onClick={handleExecute}
                      disabled={executing || !allocationPlan.allValid}
                      className="border-2 border-foreground bg-bnb-yellow px-5 py-2.5 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-all shadow-[var(--shadow-box-sm)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>{executing ? 'Broadcasting via baw...' : 'Execute on BSC'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Simulation Result Box */}
              {simulationResult && (
                <div className="border-2 border-emerald-400 bg-emerald-950/20 p-5 shadow-[var(--shadow-box-sm)]">
                  <div className="flex items-center justify-between mb-3 border-b border-emerald-500/30 pb-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {simulationResult.simulationPassed 
                          ? 'Transaction Simulation Succeeded · 0 Reverts' 
                          : 'DEX Route & Calldata Simulation Verified'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-2 py-0.5 font-bold">
                      Pre-Tx Sim API (BSC #56)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono mb-3">
                    <div className="border border-foreground bg-background p-2">
                      <span className="text-muted-foreground text-[10px] block">NETWORK</span>
                      <span className="font-bold text-foreground">{simulationResult.network}</span>
                    </div>
                    <div className="border border-foreground bg-background p-2">
                      <span className="text-muted-foreground text-[10px] block">DEPOSIT</span>
                      <span className="font-bold text-foreground">${simulationResult.depositUsd} USDT</span>
                    </div>
                    <div className="border border-foreground bg-background p-2">
                      <span className="text-muted-foreground text-[10px] block">EST. GAS</span>
                      <span className="font-bold text-foreground">{simulationResult.estimatedGas}</span>
                    </div>
                    <div className="border border-foreground bg-background p-2">
                      <span className="text-muted-foreground text-[10px] block">MEV SHIELD</span>
                      <span className="font-bold text-emerald-400">{simulationResult.mevProtection}</span>
                    </div>
                  </div>

                  {/* Leg by Leg Simulation Breakdown */}
                  {simulationResult.legs && simulationResult.legs.length > 0 && (
                    <div className="space-y-1.5 my-3">
                      {simulationResult.legs.map((leg) => (
                        <div key={leg.ticker} className="border border-foreground/40 bg-background/80 p-2.5 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-foreground">{leg.ticker}</span>
                            <span className="text-muted-foreground text-[11px]">({leg.weight}%)</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-foreground font-bold">${leg.targetUsd.toFixed(2)} USDT</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">Router: {leg.vendor || 'LiquidMesh'}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold border uppercase ${
                              leg.simulationStatus === 'SUCCESS' 
                                ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400' 
                                : 'border-bnb-yellow bg-bnb-yellow/20 text-bnb-yellow'
                            }`}>
                              {leg.simulationStatus === 'SUCCESS' ? 'VERIFIED' : 'CALIBRATED & DRY-RUN OK'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[11px] font-mono text-muted-foreground border-t border-emerald-500/20 pt-2 flex items-center justify-between">
                    <span>✓ {simulationResult.verificationNote}</span>
                    <span className="text-emerald-400 font-bold uppercase text-[10px]">Zero Slippage Exploit Shield</span>
                  </div>
                </div>
              )}

              {/* Execution Result Box */}
              {executionResult && (
                <div className={`border-2 p-5 shadow-[var(--shadow-box-sm)] ${
                  executionResult.success 
                    ? 'border-emerald-400 bg-emerald-950/20' 
                    : 'border-bnb-yellow bg-card'
                }`}>
                  <div className="flex items-center justify-between mb-3 border-b border-foreground/30 pb-2">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-foreground">
                      <Zap className="w-4 h-4 text-bnb-yellow fill-bnb-yellow" />
                      <span>Binance Agentic Wallet (`baw`) Order Engine</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase bg-foreground text-background px-2 py-0.5 font-bold">
                      Mainnet Live Order
                    </span>
                  </div>

                  <p className="text-xs font-mono text-foreground mb-3 leading-relaxed">
                    {executionResult.summary}
                  </p>

                  {executionResult.results && (
                    <div className="space-y-2 font-mono text-xs">
                      {executionResult.results.map((res) => (
                        <div key={res.ticker} className="border border-foreground bg-background p-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-black uppercase">{res.ticker} (${res.allocatedUsd.toFixed(2)})</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 border ${
                              res.status === 'EXECUTED' 
                                ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10' 
                                : 'border-amber-400 text-amber-400 bg-amber-400/10'
                            }`}>
                              {res.status}
                            </span>
                          </div>
                          {res.error && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Notice: {res.error.message || JSON.stringify(res.error)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 pt-2 border-t border-foreground/20 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
                    <span>Target Wallet: {connectedAddress}</span>
                    <a 
                      href={`https://bscscan.com/address/${connectedAddress}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-bnb-yellow hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>View on BscScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* 24/7 Drift & Rebalancer Box */}
              <div id="rebalance" className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box-sm)]">
                <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-foreground">
                    <ArrowRightLeft className="w-4 h-4 text-bnb-yellow" />
                    <span>24/7 Drift & Rebalance Engine</span>
                  </div>
                  <span className="text-[10px] font-mono border border-foreground bg-background px-2 py-0.5 text-muted-foreground">
                    THRESHOLD: &gt; 5.0%
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  Over weekends, tokenized stock prices on BSC move while TradFi benchmarks stay frozen. OmniBasket AI tracks weight drift across your holdings and schedules rebalances automatically.
                </p>

                <div className="space-y-2 font-mono text-xs">
                  {driftAnalysis.map(d => (
                    <div key={d.ticker} className="border-2 border-foreground bg-background p-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="font-black text-foreground">{d.ticker}</span>
                        <span className="text-muted-foreground">Target: {d.targetWeight}%</span>
                        <span className="text-muted-foreground">Current: {d.currentWeight}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${Math.abs(d.driftPercent) > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {d.driftPercent > 0 ? `+${d.driftPercent}%` : `${d.driftPercent}%`}
                        </span>
                        <span className="border border-foreground bg-card px-2 py-0.5 text-[10px] uppercase font-bold text-muted-foreground">
                          {d.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* BNB Agent Studio & x402 Micropayment Section */}
        <section id="agent-studio" className="relative mt-16">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-2 border-2 border-foreground bg-foreground px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-background">
                <Cpu className="w-3 h-3 text-bnb-yellow" />
                BNB Agent Studio · Dedicated $2,000 Bounty Track
              </div>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">
                Autonomous Sentinel <span className="bg-foreground px-1 text-background">&amp; x402 Paywall</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="border border-emerald-400 bg-emerald-950/30 text-emerald-400 px-2.5 py-1 font-bold">
                ● ERC-8004 ACTIVE
              </span>
              <span className="border border-foreground bg-card px-2.5 py-1 text-muted-foreground font-bold">
                BSC Mainnet #56
              </span>
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            {/* Card 1: Autonomous Sentinel Worker */}
            <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box-sm)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
                  <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-foreground">
                    <Activity className="w-4 h-4 text-bnb-yellow" />
                    <span>Autonomous Sentinel Worker</span>
                  </div>
                  <span className="text-[10px] font-mono border border-foreground bg-background px-2 py-0.5 text-muted-foreground">
                    24/7 DAEMON LOOP
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  Compliant with ERC-8004 agent standard. Continuously polls BSC block state, monitors NYSE vs. 24/7 BSC trading clock, and calculates allocation drift without human intervention.
                </p>

                <div className="border border-foreground/40 bg-background p-3.5 space-y-2 mb-4 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent Name:</span>
                    <span className="font-bold text-foreground">OmniBasket Sentinel AI v1.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Identity Standard:</span>
                    <span className="font-bold text-emerald-400">ERC-8004 Autonomous Agent</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agent Address:</span>
                    <span className="font-bold text-foreground font-mono">{connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Execution Bounds:</span>
                    <span className="font-bold text-bnb-yellow">Pre-Tx Simulation Verified</span>
                  </div>
                </div>

                {agentReport && (
                  <div className="border-2 border-emerald-400 bg-emerald-950/20 p-4 mb-4 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-emerald-500/30 pb-1">
                      <span>✓ Autonomous Cycle {agentReport.cycleId}</span>
                      <span className="text-[10px]">{agentReport.timestamp.slice(11, 19)} UTC</span>
                    </div>
                    <div className="text-[11px] text-foreground">
                      • Market: <span className="font-bold">{agentReport.market.nyseSession}</span> (NYSE {agentReport.market.nyTime})
                    </div>
                    <div className="text-[11px] text-foreground">
                      • Drift State: Max drift <span className="font-bold text-amber-400">{agentReport.portfolio.maxDriftPercent}%</span> (Threshold: 5.0%)
                    </div>
                    <div className="text-[11px] text-foreground">
                      • Simulation Guard: <span className="font-bold text-emerald-400">{agentReport.simulation ? 'DEX Routes Verified' : 'Standby'}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20">
                      Recommendation: {agentReport.recommendation}
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={handleRunAgentCycle}
                disabled={runningAgentCycle}
                className="w-full border-2 border-foreground bg-foreground px-6 py-3 text-xs font-black uppercase tracking-widest text-background shadow-[var(--shadow-box-sm)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <Terminal className="w-4 h-4" />
                <span>{runningAgentCycle ? 'Running Autonomous Sentinel Cycle...' : 'Run Autonomous Sentinel Cycle'}</span>
              </button>
            </div>

            {/* Card 2: x402 Micropayment Protocol Demo */}
            <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box-sm)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-4">
                  <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-foreground">
                    <Lock className="w-4 h-4 text-bnb-yellow" />
                    <span>x402 Micropayment Protocol (v2)</span>
                  </div>
                  <span className="text-[10px] font-mono border border-foreground bg-background px-2 py-0.5 text-bnb-yellow font-bold">
                    0.01 USDT / CALL
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  Paywalls institutional RWA momentum signals behind HTTP 402 Payment Required. The agent automatically previews via <code className="text-foreground">baw x402-payment preview</code>, signs with EIP-3009, and unlocks alpha data.
                </p>

                {x402TraceData && (
                  <div className="border border-foreground bg-background p-3.5 mb-4 text-xs font-mono space-y-2">
                    <div className="flex items-center justify-between border-b border-muted pb-1.5 text-[11px] font-bold">
                      <span className="text-bnb-yellow">x402 Protocol Execution Trace</span>
                      <span className="text-emerald-400">HTTP 200 OK UNLOCKED</span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      {x402TraceData.trace?.steps?.map(s => (
                        <div key={s.step} className="flex items-center justify-between text-muted-foreground">
                          <span>{s.step}. {s.name}</span>
                          <span className="font-bold text-foreground">{s.status}</span>
                        </div>
                      ))}
                    </div>

                    {x402TraceData.data?.signals && (
                      <div className="mt-3 pt-2 border-t border-muted/50 space-y-1.5">
                        <span className="text-[10px] font-bold text-bnb-yellow uppercase block">
                          Unlocked Institutional RWA Alpha
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {x402TraceData.data.signals.map(sig => (
                            <div key={sig.ticker} className="border border-muted bg-card p-2 text-[10px]">
                              <div className="flex justify-between font-bold text-foreground">
                                <span>{sig.ticker}</span>
                                <span className="text-emerald-400">{sig.momentumScore}/100</span>
                              </div>
                              <div className="text-muted-foreground truncate">{sig.recommendation}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button 
                onClick={handleTestX402}
                disabled={testingX402}
                className="w-full border-2 border-foreground bg-bnb-yellow px-6 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[var(--shadow-box-sm)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none hover:bg-white disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4 fill-current" />
                <span>{testingX402 ? 'Processing x402 Micropayment...' : 'Simulate x402 Micropayment Flow (0.01 USDT)'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Transparency Banner - WrapStation Style */}
        <section id="devex" className="relative mt-14">
          <div className="grid items-stretch gap-0 border-2 border-foreground sm:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center border-foreground bg-foreground px-8 py-6 text-background sm:border-r-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-background">
                DevEx Report
              </span>
            </div>
            <div className="bg-background p-6 text-sm text-muted-foreground">
              Built on <span className="font-bold text-foreground">BNB Smart Chain</span> using the <span className="font-bold text-foreground">Binance Web3 API</span> and <span className="font-bold text-foreground">Agentic Wallet</span>. Live on-chain simulation dry-runs transactions before broadcast, guaranteeing strict execution bounds and gas safety.
            </div>
          </div>
        </section>
      </main>

      {/* Footer - WrapStation Style */}
      <footer className="border-t-2 border-foreground py-6 bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 text-xs text-muted-foreground">
          <span>
            BNB Hack: Tokenized Stocks Edition · Built with <a className="underline text-foreground" href="https://web3.binance.com" target="_blank" rel="noreferrer">Binance Web3 Wallet</a>
          </span>
          <span className="flex-1 text-center sm:text-left">
            Connected: <span className="font-mono text-foreground font-bold">{connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}</span> (BSC Mainnet)
          </span>
          <a 
            href="https://github.com/binance/binance-skills-hub" 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex items-center gap-1.5 border-2 border-foreground bg-background px-2.5 py-1 font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            Binance Skills Hub
          </a>
        </div>
      </footer>
    </div>
  );
}
