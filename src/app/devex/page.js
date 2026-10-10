'use client';

import React from 'react';
import Navbar from '../../components/Navbar';
import { 
  Shield, 
  ExternalLink, 
  Terminal, 
  CheckCircle2, 
  Cpu, 
  Layers, 
  Sparkles,
  GitBranch
} from 'lucide-react';

const VERIFIED_TXS = [
  {
    type: 'Stock Exit to USDT',
    pair: '0.01867 MSFTon → 9.9702 USDT',
    txHash: '0x5caccc145ae9612faf43b049264db5ca23feaeca24ff9075eedb5dc9d693e15d',
    status: 'FINISHED',
    chain: 'BNB Smart Chain (56)',
    dex: 'PancakeSwap / LiquidMesh'
  },
  {
    type: 'Multi-Leg Stock Buy',
    pair: '10.00 USDT → 0.01867 MSFTon',
    txHash: '0xe87239865f27ae1734921c35152a25db20bdb9d5d7691076a3cb1dbb71bdb125',
    status: 'FINISHED',
    chain: 'BNB Smart Chain (56)',
    dex: 'LiquidMesh AMM'
  },
  {
    type: 'DEX Currency Swap',
    pair: '0.00737 WBNB → 5.5030 USDT',
    txHash: '0xcd4566a4d1f204b13f524d70a6c7e7329dd48d47c2fb5512d6c2bc8671341461',
    status: 'FINISHED',
    chain: 'BNB Smart Chain (56)',
    dex: 'PancakeSwap V3'
  },
  {
    type: 'Basket Funding Swap',
    pair: '5.50 USDT → 0.00737 WBNB',
    txHash: '0xef424e91cf76eec4c9797d092e0df400199e46a7ce3d6a7d5fa2fb4a8b7ea806',
    status: 'FINISHED',
    chain: 'BNB Smart Chain (56)',
    dex: 'PancakeSwap V3'
  }
];

export default function DevExPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true"></div>

        {/* Header */}
        <div className="mb-8 border-b-2 border-foreground pb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-bnb-yellow" />
              <h1 className="text-2xl font-black uppercase tracking-wider sm:text-3xl">
                Developer Experience & Hackathon Dossier
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              BNB Hack: Tokenized Stocks Edition verification dossier, architecture benchmarks, and live on-chain proofs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="border-2 border-foreground bg-foreground text-background px-3 py-1.5 text-xs font-mono font-bold">
              BNB Smart Chain #56
            </span>
          </div>
        </div>

        {/* Verified Transactions Table */}
        <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box)] mb-8">
          <div className="flex items-center justify-between border-b-2 border-foreground pb-3 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-lg font-black uppercase">
                Verified On-Chain Transactions (BSC Mainnet)
              </h2>
            </div>
            <span className="text-[10px] font-mono border border-emerald-400 bg-emerald-950/40 text-emerald-300 px-2 py-0.5 font-bold">
              All Confirmed on BscScan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b-2 border-foreground text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Operation</th>
                  <th className="py-2">Execution Pair</th>
                  <th className="py-2">Routing Pool</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Transaction Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {VERIFIED_TXS.map((tx) => (
                  <tr key={tx.txHash} className="hover:bg-muted/30">
                    <td className="py-3 font-bold text-foreground">{tx.type}</td>
                    <td className="py-3">{tx.pair}</td>
                    <td className="py-3 text-muted-foreground">{tx.dex}</td>
                    <td className="py-3">
                      <span className="border border-emerald-400 bg-emerald-400/10 text-emerald-400 px-1.5 py-0.5 text-[10px] font-bold">
                        {tx.status} ✓
                      </span>
                    </td>
                    <td className="py-3">
                      <a
                        href={`https://bscscan.com/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-bnb-yellow hover:underline"
                      >
                        <span>{tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Architecture Grid */}
        <div className="grid gap-6 sm:grid-cols-2 mb-8">
          
          <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box-sm)] flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-muted-foreground mb-2">
                Core Integration 1
              </div>
              <h3 className="text-base font-black uppercase text-foreground mb-3">
                Binance Agentic Wallet (<code className="text-bnb-yellow font-mono">baw</code>)
              </h3>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed mb-4">
                Non-custodial agentic wallet framework powering autonomous transactions. Enables our AI agent to manage quotes, market-order swaps, and balances without requiring user signature approvals for every leg.
              </p>
            </div>
            <div className="border-t border-muted pt-3 text-[10px] font-mono text-muted-foreground">
              CLI: <code className="text-foreground">@binance/agentic-wallet</code> · Session Active
            </div>
          </div>

          <div className="border-2 border-foreground bg-card p-6 shadow-[var(--shadow-box-sm)] flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-muted-foreground mb-2">
                Core Integration 2
              </div>
              <h3 className="text-base font-black uppercase text-foreground mb-3">
                x402 Micropayment Protocol & ERC-8004
              </h3>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed mb-4">
                Standardizes Agent-to-Agent micropayments using HTTP 402 Payment Required and off-chain EIP-3009 transfer authorizations, unlocking 24/7 institutional alpha feeds.
              </p>
            </div>
            <div className="border-t border-muted pt-3 text-[10px] font-mono text-muted-foreground">
              Protocol: <code className="text-foreground">x402 v2</code> · Settlement: eip155:56 (BSC)
            </div>
          </div>

        </div>

        {/* Token Registry Reference */}
        <div className="border-2 border-foreground bg-foreground text-background p-6 shadow-[var(--shadow-box)]">
          <h3 className="text-base font-black uppercase text-background mb-4">
            BSC Mainnet Tokenized Stock Registry
          </h3>
          <div className="grid gap-3 sm:grid-cols-3 font-mono text-xs">
            <div className="border border-background/20 p-3">
              <div className="font-bold text-bnb-yellow">NVDAon (NVIDIA)</div>
              <div className="text-[10px] text-background/70 break-all">0xa9ee28c80f960b889dfbd1902055218cba016f75</div>
            </div>
            <div className="border border-background/20 p-3">
              <div className="font-bold text-bnb-yellow">MSFTon (Microsoft)</div>
              <div className="text-[10px] text-background/70 break-all">0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3</div>
            </div>
            <div className="border border-background/20 p-3">
              <div className="font-bold text-bnb-yellow">USDY (Ondo Treasury)</div>
              <div className="text-[10px] text-background/70 break-all">0x608593d17a2decbbc4399e4185be4922f97ed32e</div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
