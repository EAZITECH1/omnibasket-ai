'use client';

import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { 
  X, 
  Wallet, 
  ExternalLink, 
  Copy, 
  Check, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  LogOut,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export default function WalletModal() {
  const {
    walletMode,
    setWalletMode,
    isConnected,
    isConnecting,
    address,
    chainId,
    isBscMainnet,
    networkName,
    balances,
    agenticInfo,
    providerInfo,
    error,
    connect,
    disconnect,
    switchNetwork,
    refreshBalances,
    isModalOpen,
    closeModal
  } = useWallet();

  const [copied, setCopied] = useState(false);

  if (!isModalOpen) return null;

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-xl border-2 border-foreground bg-card text-foreground shadow-[var(--shadow-box)] p-6 my-8 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-hub-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-foreground pb-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-4 bg-bnb-yellow text-black flex items-center justify-center font-black text-[10px]">
              ■
            </div>
            <h2 id="wallet-hub-title" className="text-base font-black uppercase font-mono tracking-wider">
              WALLET CONTROL HUB
            </h2>
          </div>
          <button
            onClick={closeModal}
            className="border-2 border-foreground bg-background p-1 hover:bg-foreground hover:text-background transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setWalletMode('extension')}
            className={`border-2 p-3 font-mono text-left transition-all cursor-pointer ${
              walletMode === 'extension'
                ? 'border-bnb-yellow bg-foreground text-background shadow-[2px_2px_0px_0px_#f0b90b]'
                : 'border-foreground bg-background text-foreground hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black uppercase flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-bnb-yellow" />
                Extension Wallet
              </span>
              {walletMode === 'extension' && (
                <span className="text-[10px] bg-bnb-yellow text-black font-bold px-1.5 py-0.2">ACTIVE</span>
              )}
            </div>
            <p className="text-[10px] opacity-80 line-clamp-1">
              Binance Web3 Wallet browser signing (Recommended)
            </p>
          </button>

          <button
            onClick={() => setWalletMode('agentic')}
            className={`border-2 p-3 font-mono text-left transition-all cursor-pointer ${
              walletMode === 'agentic'
                ? 'border-bnb-yellow bg-foreground text-background shadow-[2px_2px_0px_0px_#f0b90b]'
                : 'border-foreground bg-background text-foreground hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 fill-current text-bnb-yellow" />
                Agentic Wallet
              </span>
              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500 px-1.5 py-0.2 font-bold">
                DISABLED
              </span>
            </div>
            <p className="text-[10px] opacity-80 line-clamp-1">
              Shared server wallet disabled for public security
            </p>
          </button>
        </div>

        {/* Network & Safety Status */}
        <div className="border-2 border-foreground bg-background p-3 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isBscMainnet && isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="font-bold">
              {isBscMainnet ? 'BNB Smart Chain Mainnet (56)' : `Wrong Network: ${networkName}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] border border-foreground px-2 py-0.5 bg-card uppercase font-bold text-muted-foreground">
              {walletMode === 'extension' ? 'Manual Browser Approval' : 'Public Mode: Disabled'}
            </span>
            {isConnected && (
              <button
                onClick={refreshBalances}
                title="Refresh balances"
                className="border border-foreground p-1 hover:bg-foreground hover:text-background transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="border-2 border-amber-500 bg-amber-500/10 p-3 mb-6 text-xs font-mono text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Wallet Notice</p>
              <p className="text-[11px] opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Mode: Agentic Wallet Selected (Explaining Public Disability) */}
        {walletMode === 'agentic' ? (
          <div className="border-2 border-amber-500/80 bg-amber-950/20 p-5 mb-6 space-y-3 font-mono">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
              <ShieldAlert className="w-4 h-4" />
              <span>Agentic Wallet unavailable in public mode</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The previous shared Railway wallet has been permanently removed for security. 
              In a public multi-user environment, users cannot share a single server-side keyless wallet.
            </p>
            <div className="border border-foreground/30 bg-background p-3 text-[11px] text-foreground">
              <span className="font-bold block text-bnb-yellow mb-1">Recommended Action:</span>
              Switch to <strong>Extension Wallet</strong> mode to connect your personal Binance Web3 Wallet. 
              Your transactions will be signed locally on your device with 100% self-custody.
            </div>
            <button
              onClick={() => setWalletMode('extension')}
              className="border-2 border-foreground bg-bnb-yellow text-black font-mono font-bold text-xs px-4 py-2 uppercase hover:bg-white transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              <span>Switch to Extension Wallet Mode</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Mode: Extension Wallet */
          <>
            {/* Wrong Network Warning & Switch Button */}
            {!isBscMainnet && isConnected && (
              <div className="border-2 border-red-500 bg-red-950/30 p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold font-mono text-red-400">BSC Mainnet Required</p>
                    <p className="text-[11px] text-muted-foreground">
                      OmniBasket executes tokenized equities strictly on BSC Chain ID 56.
                    </p>
                  </div>
                  <button
                    onClick={switchNetwork}
                    className="border-2 border-foreground bg-bnb-yellow text-black font-mono font-bold text-xs px-3 py-1.5 uppercase hover:bg-white transition-colors"
                  >
                    Switch to BSC 56
                  </button>
                </div>
              </div>
            )}

            {/* Address & Connection View */}
            {isConnected ? (
              <div className="border-2 border-foreground bg-card p-4 mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground">
                      Active Account
                    </span>
                    <span className="text-[10px] font-mono border border-foreground/40 px-1.5 py-0.5 bg-background">
                      {providerInfo.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-2 py-0.5 font-bold">
                    CONNECTED
                  </span>
                </div>

                <div className="flex items-center justify-between bg-background border border-foreground/40 p-2.5 font-mono text-xs">
                  <span className="truncate mr-2 font-bold tracking-tight">{address}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={handleCopy}
                      className="p-1 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
                      title="Copy address"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a
                      href={`https://bscscan.com/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
                      title="View on BscScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Balances Grid */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] font-mono text-muted-foreground block">USDT</span>
                    <span className="text-sm font-black font-mono text-bnb-yellow">${balances.usdt}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] font-mono text-muted-foreground block">BNB</span>
                    <span className="text-sm font-black font-mono">{balances.bnb}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] font-mono text-muted-foreground block">Total Portfolio</span>
                    <span className="text-sm font-black font-mono">${balances.totalUsd}</span>
                  </div>
                </div>

                {/* Self-Custody Security Notice */}
                <div className="border border-foreground/20 bg-background p-2.5 text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Self-custody verified: Orders require explicit signature in your extension provider.</span>
                </div>
              </div>
            ) : (
              <div className="border-2 border-foreground bg-card p-6 mb-6 text-center space-y-4">
                <div className="mx-auto w-10 h-10 border-2 border-foreground bg-background flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-bnb-yellow" />
                </div>
                <div>
                  <h3 className="font-mono font-black text-sm uppercase">
                    Connect Binance Web3 Wallet
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1 max-w-sm mx-auto">
                    Connect your browser extension to manage tokenized stock baskets with full self-custody on BNB Smart Chain.
                  </p>
                </div>

                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="border-2 border-foreground bg-bnb-yellow text-black font-mono font-black text-xs px-6 py-3 uppercase tracking-wider hover:bg-white transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
                >
                  <span>{isConnecting ? 'Connecting...' : 'Connect Binance Web3 Wallet'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {!providerInfo.isInstalled && (
                  <div className="pt-2">
                    <a
                      href="https://www.binance.com/en/web3wallet"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-bnb-yellow underline hover:opacity-80 inline-flex items-center gap-1"
                    >
                      <span>Install Binance Web3 Wallet Extension</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t-2 border-foreground pt-4 font-mono text-xs">
          {isConnected && (
            <button
              onClick={disconnect}
              className="border border-red-500 text-red-400 px-3 py-1.5 uppercase font-bold hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}

          <div className="ml-auto">
            <button
              onClick={closeModal}
              className="border-2 border-foreground bg-foreground text-background px-4 py-1.5 uppercase font-bold hover:opacity-80 transition-opacity cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
