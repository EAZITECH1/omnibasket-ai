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
  QrCode, 
  LogOut,
  ArrowRight
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
    setError,
    connect,
    disconnect,
    switchNetwork,
    refreshBalances,
    isModalOpen,
    closeModal
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [pairingData, setPairingData] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState(null);

  if (!isModalOpen) return null;

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartPairing = async () => {
    setPairingLoading(true);
    setPairingError(null);
    try {
      const res = await fetch('/api/wallet/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signin' })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPairingData(data.data);
      } else {
        setPairingError(data.error?.message || 'Failed to generate QR code.');
      }
    } catch (err) {
      setPairingError(err.message);
    } finally {
      setPairingLoading(false);
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
              {walletMode === 'agentic' && (
                <span className="text-[10px] bg-bnb-yellow text-black font-bold px-1.5 py-0.2">ACTIVE</span>
              )}
            </div>
            <p className="text-[10px] opacity-80 line-clamp-1">
              Autonomous keyless MPC via @binance/agentic-wallet
            </p>
          </button>

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
                <Wallet className="w-3.5 h-3.5" />
                Extension Wallet
              </span>
              {walletMode === 'extension' && (
                <span className="text-[10px] bg-bnb-yellow text-black font-bold px-1.5 py-0.2">ACTIVE</span>
              )}
            </div>
            <p className="text-[10px] opacity-80 line-clamp-1">
              Binance Web3 Wallet browser extension
            </p>
          </button>
        </div>

        {/* Network & Safety Status */}
        <div className="border-2 border-foreground bg-background p-3 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isBscMainnet ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="font-bold">
              {isBscMainnet ? 'BNB Smart Chain Mainnet (56)' : `Wrong Network: ${networkName}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] border border-foreground px-2 py-0.5 bg-card uppercase font-bold text-muted-foreground">
              {walletMode === 'agentic' ? '1-Click Autonomous' : 'Manual Signing'}
            </span>
            <button
              onClick={refreshBalances}
              title="Refresh balances"
              className="border border-foreground p-1 hover:bg-foreground hover:text-background transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
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

        {/* Wrong Network Warning & Switch Button */}
        {!isBscMainnet && walletMode === 'extension' && isConnected && (
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
              <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground">
                Connected Address
              </span>
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
                <span className="text-[10px] font-mono text-muted-foreground block">Total Equities</span>
                <span className="text-sm font-black font-mono">${balances.totalUsd}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-2 border-foreground bg-card p-6 mb-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 border-2 border-foreground bg-background flex items-center justify-center">
              {walletMode === 'agentic' ? <Zap className="w-5 h-5 text-bnb-yellow" /> : <Wallet className="w-5 h-5 text-foreground" />}
            </div>
            <div>
              <h3 className="font-mono font-black text-sm uppercase">
                {walletMode === 'agentic' ? 'Connect Binance Agentic Wallet' : 'Connect Injected Web3 Wallet'}
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {walletMode === 'agentic'
                  ? 'Autonomous execution via keyless MPC session on BNB Smart Chain.'
                  : 'Connect your Binance Web3 Wallet extension to approve trades manually.'}
              </p>
            </div>

            <button
              onClick={connect}
              disabled={isConnecting}
              className="border-2 border-foreground bg-bnb-yellow text-black font-mono font-black text-xs px-6 py-3 uppercase tracking-wider hover:bg-white transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
            >
              <span>{isConnecting ? 'Connecting...' : (walletMode === 'agentic' ? 'Connect Agentic Wallet' : 'Connect Extension Wallet')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mode Specific Deep-Dive Card */}
        {walletMode === 'agentic' ? (
          <div className="border-2 border-foreground/40 bg-background p-4 mb-6 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-foreground/20 pb-2">
              <span className="font-bold flex items-center gap-1.5 text-bnb-yellow">
                <ShieldCheck className="w-4 h-4" />
                Agentic MPC Session Status
              </span>
              <span className="text-[10px] border border-foreground/40 px-2 py-0.5">
                {agenticInfo.status || 'UNCONNECTED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground block">Daily Trading Limit:</span>
                <span className="font-bold">${agenticInfo.quota?.dailyLimit || 1000} USDT</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Session Client:</span>
                <span className="font-bold">{agenticInfo.session?.clientIdSnippet || 'Configured in ~/.baw'}</span>
              </div>
            </div>

            {/* Pair with Binance App Flow */}
            <div className="pt-2 border-t border-foreground/20">
              {pairingData ? (
                <div className="border-2 border-bnb-yellow bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-bnb-yellow">Binance App Pairing QR</span>
                    <span className="text-[10px] text-muted-foreground">Pairing Code: {pairingData.pairingCode}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Scan using Binance App or open link on your mobile browser:
                  </p>
                  <a
                    href={pairingData.urlForWeb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 border border-foreground bg-bnb-yellow text-black px-3 py-1.5 text-[11px] font-bold uppercase hover:bg-white"
                  >
                    <span>Open Binance Pairing Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <button
                  onClick={handleStartPairing}
                  disabled={pairingLoading}
                  className="w-full border border-foreground bg-card py-2 text-xs font-bold uppercase hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{pairingLoading ? 'Generating QR Code...' : 'Pair with Binance App (QR / Code)'}</span>
                </button>
              )}
              {pairingError && <p className="text-[10px] text-amber-400 mt-1">{pairingError}</p>}
            </div>
          </div>
        ) : (
          <div className="border-2 border-foreground/40 bg-background p-4 mb-6 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-foreground/20 pb-2">
              <span className="font-bold flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-bnb-yellow" />
                Injected Provider Details
              </span>
              <span className={`text-[10px] border px-2 py-0.5 ${providerInfo.isInstalled ? 'border-emerald-400 text-emerald-400' : 'border-amber-400 text-amber-400'}`}>
                {providerInfo.name}
              </span>
            </div>

            {!providerInfo.isInstalled && (
              <div className="pt-2">
                <p className="text-[11px] text-muted-foreground mb-2">
                  To use Extension mode with full hardware security, install the official Binance Web3 Wallet extension:
                </p>
                <a
                  href={providerInfo.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border-2 border-foreground bg-bnb-yellow text-black px-3 py-1.5 text-xs font-bold uppercase hover:bg-white"
                >
                  <span>Install Binance Web3 Wallet</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t-2 border-foreground pt-4 font-mono text-xs">
          {isConnected && walletMode === 'extension' ? (
            <button
              onClick={disconnect}
              className="border border-red-500 text-red-400 px-3 py-1.5 uppercase font-bold hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              OmniBasket AI · BNB Smart Chain Mainnet
            </span>
          )}

          <button
            onClick={closeModal}
            className="border-2 border-foreground bg-foreground text-background px-4 py-1.5 uppercase font-bold hover:opacity-80 transition-opacity cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
