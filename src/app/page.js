'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { useWallet } from '../context/WalletContext';
import { getMarketHoursStatus } from '../services/marketHours';

export default function Home() {
  const [marketStatus, setMarketStatus] = useState(getMarketHoursStatus());
  const { address, isConnected, isBscMainnet, openModal } = useWallet();

  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketHoursStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Universal Sticky Navbar */}
      <Navbar />

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
                <Link 
                  href="/strategy-agent"
                  className="inline-flex h-14 items-center justify-center border-2 border-foreground bg-foreground px-8 text-sm font-black uppercase tracking-widest text-background shadow-[var(--shadow-box)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                >
                  Open Terminal →
                </Link>
                <Link 
                  href="/rebalance"
                  className="inline-flex h-14 items-center justify-center border-2 border-foreground bg-background px-8 text-sm font-black uppercase tracking-widest text-foreground shadow-[var(--shadow-box-sm)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none cursor-pointer"
                >
                  Weekend Sentinel
                </Link>
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
            <Link href="/thematic-baskets" className="flex flex-col gap-3 bg-background p-6 hover:bg-card transition-colors block">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">01</div>
              <div className="text-sm font-bold uppercase tracking-wide">Live RWA Feeds</div>
              <p className="text-sm text-muted-foreground">Direct integration with Binance Web3 RWA APIs, tracking multipliers, reference prices, and corporate action halts.</p>
            </Link>
            <Link href="/strategy-agent" className="flex flex-col gap-3 bg-background p-6 hover:bg-card transition-colors block">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">02</div>
              <div className="text-sm font-bold uppercase tracking-wide">Natural Language</div>
              <p className="text-sm text-muted-foreground">Prompt-driven portfolio creation. Speak your thesis and OmniBasket AI compiles the asset ratios on BSC.</p>
            </Link>
            <Link href="/rebalance" className="flex flex-col gap-3 bg-background p-6 hover:bg-card transition-colors block">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">03</div>
              <div className="text-sm font-bold uppercase tracking-wide">24/7 Drift Sentinel</div>
              <p className="text-sm text-muted-foreground">Continuous monitoring across weekends. Flags asset allocation drift &gt; 5% and generates rebalance routes.</p>
            </Link>
            <Link href="/devex" className="flex flex-col gap-3 bg-background p-6 hover:bg-card transition-colors block">
              <div className="inline-flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground text-xs font-black text-background">04</div>
              <div className="text-sm font-bold uppercase tracking-wide">Safe Simulation</div>
              <p className="text-sm text-muted-foreground">Dry-run verification via Binance Transaction API before broadcasting. Enforces the $5 min order floor.</p>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer - WrapStation Style */}
      <footer className="border-t-2 border-foreground py-6 bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 text-xs text-muted-foreground">
          <span>
            BNB Hack: Tokenized Stocks Edition · Built with <a className="underline text-foreground" href="https://web3.binance.com" target="_blank" rel="noreferrer">Binance Web3 Wallet</a>
          </span>
          <span className="flex-1 text-center sm:text-left cursor-pointer" onClick={openModal}>
            Connected: <span className="font-mono text-foreground font-bold">{isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}</span> {isBscMainnet ? '(BSC Mainnet 56)' : '(Wrong Network)'}
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
