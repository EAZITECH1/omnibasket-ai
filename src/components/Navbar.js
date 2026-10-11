'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useWallet } from '../context/WalletContext.js';
import { formatAddress } from '../lib/wallet/provider.js';

export default function Navbar() {
  const pathname = usePathname();
  const {
    walletMode,
    setWalletMode,
    isConnected,
    isConnecting,
    address,
    isBscMainnet,
    networkName,
    balances,
    agenticSession,
    connect,
    switchNetwork,
    openModal
  } = useWallet();

  const navLinks = [
    { href: '/strategy-agent', label: 'STRATEGY AGENT' },
    { href: '/thematic-baskets', label: 'THEMATIC BASKETS' },
    { href: '/agent-studio', label: 'AGENT STUDIO (X402)' },
    { href: '/rebalance', label: '24/7 REBALANCE' },
    { href: '/devex', label: 'DEVEX REPORT' }
  ];

  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/95 backdrop-blur-sm">
      <div className="flex w-full items-center justify-between px-3 py-3 sm:px-5 lg:px-6">
        
        {/* Brand Logo */}
        <Link 
          href="/" 
          className="flex items-center gap-2.5 font-mono text-sm font-black uppercase tracking-widest text-foreground hover:opacity-80 transition-opacity shrink-0"
        >
          <span className="flex h-5 w-5 items-center justify-center bg-bnb-yellow text-black font-black text-xs shadow-[1px_1px_0px_0px_#fff]">
            ■
          </span>
          <span className="hidden sm:inline">OMNIBASKET.AI</span>
          <span className="sm:hidden">OMNI</span>
        </Link>

        {/* Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 text-[11px] font-mono">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`border-2 px-3 py-1.5 font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'border-foreground bg-foreground text-background shadow-[1px_1px_0px_0px_#f0b90b]'
                    : 'border-transparent text-muted-foreground hover:border-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Status Badges & Dual Wallet Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">

          {/* Mode Toggle Switcher Pill */}
          <div className="flex border-2 border-foreground p-0.5 bg-card text-[10px] font-mono font-bold uppercase tracking-wider">
            <button
              onClick={() => setWalletMode('agentic')}
              className={`px-2 py-1 flex items-center gap-1 transition-all cursor-pointer ${
                walletMode === 'agentic'
                  ? 'bg-foreground text-background shadow-[1px_1px_0px_0px_#f0b90b]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Autonomous keyless agentic wallet mode"
            >
              <Zap className="w-3 h-3 text-bnb-yellow fill-current" />
              <span className="hidden md:inline">Agentic</span>
            </button>
            <button
              onClick={() => setWalletMode('extension')}
              className={`px-2 py-1 flex items-center gap-1 transition-all cursor-pointer ${
                walletMode === 'extension'
                  ? 'bg-foreground text-background shadow-[1px_1px_0px_0px_#f0b90b]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Manual browser extension mode"
            >
              <Wallet className="w-3 h-3" />
              <span className="hidden md:inline">Extension</span>
            </button>
          </div>

          {/* Network Indicator Badge */}
          {isBscMainnet ? (
            <div 
              onClick={openModal}
              role="button"
              className="hidden sm:flex items-center gap-1.5 border-2 border-foreground px-2.5 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              title="Network: BNB Smart Chain Mainnet (Chain ID 56)"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>BSC 56</span>
            </div>
          ) : (
            <button
              onClick={switchNetwork}
              className="flex items-center gap-1.5 border-2 border-red-500 px-2.5 py-1.5 text-[10px] font-bold font-mono uppercase tracking-widest bg-red-950/40 text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
              title="Click to switch to BSC Mainnet"
            >
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span>Switch to BSC 56</span>
            </button>
          )}

          {/* Connected Wallet Button */}
          {isConnected ? (
            <button
              onClick={openModal}
              title="Open Wallet Control Hub"
              className="border-2 border-foreground px-2.5 py-1.5 text-[11px] font-bold font-mono uppercase tracking-widest bg-card hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 shadow-[2px_2px_0px_0px_#e6e6e6] cursor-pointer"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
              <span>{formatAddress(address)}</span>
              {walletMode === 'agentic' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 font-mono font-bold">
                  PAIRED (NO TRADING)
                </span>
              )}
              <span className="hidden sm:inline text-bnb-yellow font-black">
                (${balances.usdt})
              </span>
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className={`border-2 border-foreground px-3 py-1.5 text-[11px] font-black font-mono uppercase tracking-widest transition-all shadow-[2px_2px_0px_0px_#000] disabled:opacity-50 cursor-pointer flex items-center gap-1.5 ${
                walletMode === 'agentic' && agenticSession?.available === false
                  ? 'bg-red-950/40 text-red-400 border-red-500 hover:bg-red-500 hover:text-white'
                  : 'bg-bnb-yellow text-black hover:bg-white'
              }`}
            >
              {walletMode === 'agentic' ? (
                agenticSession?.available === false ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span>AGENTIC UNAVAILABLE</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>PAIR AGENTIC WALLET</span>
                  </>
                )
              ) : (
                <>
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{isConnecting ? 'CONNECTING...' : 'CONNECT BINANCE WALLET'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Nav Subbar */}
      <div className="lg:hidden border-t border-foreground/30 px-2 py-1.5 flex overflow-x-auto gap-1 text-[10px] font-mono scrollbar-none bg-card">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap px-2 py-1 uppercase font-bold border ${
                isActive
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
