'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, ExternalLink } from 'lucide-react';

export default function Navbar({ connectedAddress = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283' }) {
  const pathname = usePathname();
  const [balanceUsdt, setBalanceUsdt] = useState('...');
  const [balanceBnb, setBalanceBnb] = useState('0.00');

  const fetchLiveBalance = () => {
    fetch('/api/wallet/balance')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const usdt = data.tokens?.find(t => t.symbol === 'USDT');
          if (usdt) setBalanceUsdt(usdt.balance.toFixed(2));
          const bnb = data.tokens?.find(t => t.symbol === 'BNB');
          if (bnb) setBalanceBnb(bnb.balance.toFixed(4));
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchLiveBalance();
    const interval = setInterval(fetchLiveBalance, 6000);
    window.addEventListener('omnibasket-balance-refresh', fetchLiveBalance);
    return () => {
      clearInterval(interval);
      window.removeEventListener('omnibasket-balance-refresh', fetchLiveBalance);
    };
  }, []);

  const navLinks = [
    { href: '/strategy-agent', label: 'STRATEGY AGENT' },
    { href: '/thematic-baskets', label: 'THEMATIC BASKETS' },
    { href: '/agent-studio', label: 'AGENT STUDIO (X402)' },
    { href: '/rebalance', label: '24/7 REBALANCE' },
    { href: '/devex', label: 'DEVEX REPORT' }
  ];

  return (
    <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background/95 backdrop-blur-sm">
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

        {/* Right Status Badges */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Network Selector Tabs */}
          <div role="tablist" className="hidden border-2 border-foreground text-[10px] font-bold uppercase tracking-widest md:flex">
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background">
              <span className="inline-block h-1.5 w-1.5 bg-bnb-yellow"></span>
              BSC Mainnet
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 border-l-2 border-foreground text-muted-foreground bg-card">
              Ondo / bStocks
            </span>
          </div>

          {/* Connected Agentic Wallet Badge */}
          <a
            href={`https://bscscan.com/address/${connectedAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View wallet on BscScan"
            className="border-2 border-foreground px-2.5 py-1.5 text-[11px] font-bold font-mono uppercase tracking-widest bg-card hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 shadow-[2px_2px_0px_0px_#e6e6e6]"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}</span>
            <span className="hidden sm:inline text-bnb-yellow font-black">(${balanceUsdt})</span>
          </a>
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
