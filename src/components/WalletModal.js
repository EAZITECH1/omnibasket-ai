'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Shield,
  Smartphone,
  CheckCircle2
} from 'lucide-react';

export default function WalletModal() {
  const {
    walletMode,
    setWalletMode,
    isConnected,
    isConnecting,
    address,
    agenticAddress,
    chainId,
    isBscMainnet,
    networkName,
    balances,
    agenticSession,
    providerInfo,
    error,
    connect,
    disconnect,
    disconnectAgentic,
    switchNetwork,
    refreshBalances,
    fetchAgenticStatus,
    isModalOpen,
    closeModal,
    modalTab,
    setModalTab
  } = useWallet();

  const [copied, setCopied] = useState(false);
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);

  // Agentic pairing flow states
  const [activeTab, setActiveTab] = useState(modalTab || 'pairing'); // 'guardrails' | 'pairing'
  const [qrLoading, setQrLoading] = useState(false);
  const [pairingError, setPairingError] = useState(null);
  const [pairingData, setPairingData] = useState(null);
  const [listenerText, setListenerText] = useState('Listening for Binance App scan & confirmation...');
  const [isAppConfirmed, setIsAppConfirmed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingAgent, setConfirmingAgent] = useState(false);

  const pollingRef = useRef(null);

  // Sync modalTab from context when opened
  useEffect(() => {
    if (modalTab) setActiveTab(modalTab);
  }, [modalTab]);

  // Copy address helper
  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Copy pairing code helper
  const handleCopyPairingCode = () => {
    if (pairingData?.pairingCode) {
      navigator.clipboard.writeText(pairingData.pairingCode);
      setCopiedPairingCode(true);
      setTimeout(() => setCopiedPairingCode(false), 2000);
    }
  };

  // 1. Initiate Pairing Session (POST /api/agentic-wallet/auth/signin)
  const initiatePairing = useCallback(async () => {
    setQrLoading(true);
    setPairingError(null);
    setIsAppConfirmed(false);
    setShowConfirmModal(false);
    setListenerText('Listening for Binance App scan & confirmation...');

    try {
      const res = await fetch('/api/agentic-wallet/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (res.ok && data?.success && data?.data) {
        setPairingData(data.data);
      } else {
        const errorMsg = data?.error || 'Binance Agentic Wallet pairing service is currently unavailable. Please verify connectivity or use Extension Wallet.';
        setPairingError(errorMsg);
        setPairingData(null);
      }
    } catch (err) {
      console.warn('Failed to initiate pairing:', err);
      setPairingError('Network error connecting to Binance Agentic Wallet pairing service.');
      setPairingData(null);
    } finally {
      setQrLoading(false);
    }
  }, []);

  // Fetch pairing session when Agentic mode is opened and not yet connected
  useEffect(() => {
    if (isModalOpen && walletMode === 'agentic' && !agenticSession.connected && !pairingData && !qrLoading) {
      initiatePairing();
    }
  }, [isModalOpen, walletMode, agenticSession.connected, pairingData, qrLoading, initiatePairing]);

  // 2. Start Listener Polling (GET /api/agentic-wallet/auth/status?qrCodeId=...)
  useEffect(() => {
    if (!isModalOpen || walletMode !== 'agentic' || agenticSession.connected || !pairingData?.qrCodeId) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agentic-wallet/auth/status?qrCodeId=${encodeURIComponent(pairingData.qrCodeId)}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data?.success && data?.data) {
          const pollData = data.data;

          // Step 1: Scanned & App Confirmed on phone
          if (pollData.appConfirmed || pollData.status === 'APP_CONFIRMED') {
            setIsAppConfirmed(true);
            setListenerText('Binance App confirmed! Please confirm sign-in in your Agent.');
            setShowConfirmModal(true);
          }

          // Step 2: Fully Connected
          if (pollData.status === 'CONNECTED' && pollData.walletAddress) {
            setIsAppConfirmed(true);
            setShowConfirmModal(false);
            setListenerText('Binance App confirmed! Keyless MPC Wallet connected.');
            fetchAgenticStatus();
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }
      } catch (err) {
        // Ignore transient poll error
      }
    }, 2200);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isModalOpen, walletMode, agenticSession.connected, pairingData, fetchAgenticStatus]);

  // 3. Confirm Agent Sign-in (POST /api/agentic-wallet/auth/confirm-agent)
  const handleConfirmAgent = async () => {
    if (!pairingData?.qrCodeId) return;
    setConfirmingAgent(true);

    try {
      const res = await fetch('/api/agentic-wallet/auth/confirm-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId: pairingData.qrCodeId })
      });
      const data = await res.json();

      if (data?.success) {
        setShowConfirmModal(false);
        await fetchAgenticStatus();
      } else {
        alert(data.error || 'Agent authorization failed. Please try again.');
      }
    } catch (err) {
      alert(`Authorization error: ${err.message}`);
    } finally {
      setConfirmingAgent(false);
    }
  };

  if (!isModalOpen) return null;

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
          {/* Extension Mode Tab */}
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
              Binance Web3 Wallet browser signing (Self-Custody)
            </p>
          </button>

          {/* Agentic Mode Tab */}
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
              {walletMode === 'agentic' ? (
                <span className="text-[10px] bg-bnb-yellow text-black font-bold px-1.5 py-0.2">ACTIVE</span>
              ) : agenticSession.connected ? (
                <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-1.5 py-0.2 font-bold">PAIRED</span>
              ) : (
                <span className="text-[10px] bg-foreground/20 text-foreground border border-foreground/30 px-1.5 py-0.2 font-bold">MPC</span>
              )}
            </div>
            <p className="text-[10px] opacity-80 line-clamp-1">
              Binance Agentic MPC Wallet with Guardrails
            </p>
          </button>
        </div>

        {/* Network & Safety Status Bar */}
        <div className="border-2 border-foreground bg-background p-3 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${isBscMainnet && isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="font-bold">
              {isBscMainnet ? 'BNB Smart Chain Mainnet (56)' : `Wrong Network: ${networkName}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] border border-foreground px-2 py-0.5 bg-card uppercase font-bold text-muted-foreground">
              {walletMode === 'extension' ? 'Browser Extension Approval' : 'Keyless MPC with Guardrails'}
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

        {/* ========================================================================= */}
        {/* MODE 1: AGENTIC WALLET TAB (Matches Promptfolio App)                       */}
        {/* ========================================================================= */}
        {walletMode === 'agentic' ? (
          <div>
            {/* If Already Connected */}
            {agenticSession.connected && address ? (
              <div className="border-2 border-foreground bg-card p-4 mb-6 space-y-4 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Active MPC Keyless Wallet
                    </span>
                    <span className="text-[10px] border border-foreground/40 px-1.5 py-0.5 bg-background text-bnb-yellow font-bold">
                      Binance MPC v1.10.0
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-2 py-0.5 font-bold">
                    CONNECTED
                  </span>
                </div>

                <div className="flex items-center justify-between bg-background border border-foreground/40 p-2.5 text-xs">
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
                    <span className="text-[10px] text-muted-foreground block">USDT</span>
                    <span className="text-sm font-black text-bnb-yellow">${balances.usdt}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] text-muted-foreground block">BNB</span>
                    <span className="text-sm font-black">{balances.bnb}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] text-muted-foreground block">Daily Quota Left</span>
                    <span className="text-sm font-black text-emerald-400">
                      ${agenticSession.quota?.quotaLeft?.toLocaleString() || '50,000'}
                    </span>
                  </div>
                </div>

                {/* Guardrails Active Notice */}
                <div className="border border-foreground/20 bg-background p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>App-level Guardrails Active: Maximum 0.5% slippage ceiling, AutoReject high risk, $50,000 daily spend limit on BSC Mainnet #56.</span>
                </div>
              </div>
            ) : (
              /* If Not Connected: Promptfolio Pairing Interface */
              <div>
                {/* Agentic Sub-Tabs: Guardrails vs App Pairing */}
                <div className="flex border-b-2 border-foreground mb-4">
                  <button
                    onClick={() => setActiveTab('guardrails')}
                    className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'guardrails'
                        ? 'border-b-2 border-bnb-yellow text-bnb-yellow -mb-[2px] bg-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Security Guardrails</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('pairing')}
                    className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'pairing'
                        ? 'border-b-2 border-bnb-yellow text-bnb-yellow -mb-[2px] bg-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Binance App Pairing</span>
                  </button>
                </div>

                {/* Sub-Tab 1: Security Guardrails */}
                {activeTab === 'guardrails' && (
                  <div className="space-y-4 mb-6 font-mono text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-foreground/30 bg-background p-3">
                        <span className="text-[10px] text-muted-foreground uppercase block mb-1">Daily Spend Limit</span>
                        <h4 className="text-sm font-black text-bnb-yellow">$50,000.00 USDT</h4>
                        <p className="text-[10px] text-muted-foreground mt-1">Enforced via App Guardrails &amp; Binance MPC</p>
                      </div>
                      <div className="border border-foreground/30 bg-background p-3">
                        <span className="text-[10px] text-muted-foreground uppercase block mb-1">Remaining 24h Quota</span>
                        <h4 className="text-sm font-black text-emerald-400">$50,000.00 USDT</h4>
                        <p className="text-[10px] text-muted-foreground mt-1">Used: $0.00 USDT today</p>
                      </div>
                      <div className="border border-foreground/30 bg-background p-3">
                        <span className="text-[10px] text-muted-foreground uppercase block mb-1">Abnormal Tx Policy</span>
                        <h4 className="text-sm font-black">AutoReject</h4>
                        <p className="text-[10px] text-muted-foreground mt-1">Blocks high-slippage &amp; risk breaches</p>
                      </div>
                      <div className="border border-foreground/30 bg-background p-3">
                        <span className="text-[10px] text-muted-foreground uppercase block mb-1">Slippage Ceiling</span>
                        <h4 className="text-sm font-black text-bnb-yellow">0.5% Maximum</h4>
                        <p className="text-[10px] text-muted-foreground mt-1">Strict fail-closed execution</p>
                      </div>
                    </div>

                    <div className="border border-foreground/30 bg-background p-3.5 text-muted-foreground leading-relaxed">
                      <strong className="text-foreground block mb-1">How Autonomous Execution Works:</strong>
                      When you execute a strategy in OmniBasket AI, the AI Agent executes multi-leg token swaps directly through Binance's keyless MPC infrastructure. The user is protected at all times by strict, non-bypassable guardrails without needing browser extension popups for every single order leg.
                    </div>

                    <button
                      onClick={() => setActiveTab('pairing')}
                      className="w-full border-2 border-foreground bg-bnb-yellow text-black font-bold uppercase py-2.5 hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>Pair Binance App Now</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Sub-Tab 2: Binance App Pairing (QR Code) */}
                {activeTab === 'pairing' && (
                  <div className="space-y-4 mb-6 font-mono">
                    {pairingError ? (
                      <div className="border-2 border-red-500 bg-red-950/20 p-5 space-y-4 font-mono text-center">
                        <div className="mx-auto w-10 h-10 border-2 border-red-500 bg-background flex items-center justify-center text-red-400">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-red-400 uppercase text-xs">Binance Pairing Unavailable</h4>
                          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md mx-auto">
                            {pairingError}
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-3 pt-2">
                          <button
                            onClick={initiatePairing}
                            className="border-2 border-foreground bg-bnb-yellow text-black font-bold uppercase text-xs px-4 py-2 hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry Pairing</span>
                          </button>
                          <button
                            onClick={() => setWalletMode('extension')}
                            className="border border-foreground px-4 py-2 uppercase font-bold text-xs hover:bg-foreground hover:text-background transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Use Extension Wallet</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Scan this QR code with your <strong>Binance App</strong> to pair this agent session with your MPC keyless wallet:
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-background border border-foreground/40 p-4">
                          {/* Scannable QR Frame */}
                          <div className="flex flex-col items-center justify-center p-2 bg-white rounded border border-foreground/20">
                            {qrLoading ? (
                              <div className="h-44 w-44 flex flex-col items-center justify-center text-black text-xs gap-2">
                                <RefreshCw className="w-6 h-6 animate-spin text-bnb-yellow" />
                                <span>Generating QR...</span>
                              </div>
                            ) : pairingData?.qrSvg ? (
                              <div 
                                className="w-44 h-44 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                                dangerouslySetInnerHTML={{ __html: pairingData.qrSvg }}
                              />
                            ) : (
                              <div className="h-44 w-44 flex flex-col items-center justify-center text-black text-xs text-center p-2">
                                <span className="text-[10px] text-muted-foreground">Waiting for pairing session...</span>
                              </div>
                            )}
                          </div>

                          {/* Pairing Details Panel */}
                          <div className="space-y-3 text-xs">
                            {/* Pairing Code Card */}
                            <div className="border border-foreground/30 p-2.5 bg-card">
                              <span className="text-[10px] text-muted-foreground block uppercase">Pairing Session Code</span>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-mono font-black text-lg tracking-widest text-bnb-yellow">
                                  {pairingData?.pairingCode || '------'}
                                </span>
                                <button
                                  onClick={handleCopyPairingCode}
                                  disabled={!pairingData?.pairingCode}
                                  className="border border-foreground/40 px-2 py-1 hover:bg-foreground hover:text-background transition-colors flex items-center gap-1 text-[10px] font-bold disabled:opacity-40"
                                >
                                  {copiedPairingCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedPairingCode ? 'COPIED' : 'COPY'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Live Listener Status */}
                            <div className="border border-emerald-500/40 bg-emerald-950/20 p-2.5 flex items-center gap-2 text-[11px]">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                              <span className="text-emerald-300 truncate">{listenerText}</span>
                            </div>

                            {/* Steps Guide */}
                            <div className="space-y-1.5 text-[11px] text-muted-foreground">
                              <div className="flex items-start gap-1.5">
                                <span className="h-4 w-4 rounded-full bg-bnb-yellow text-black flex items-center justify-center font-bold text-[9px] shrink-0">1</span>
                                <span>Open <strong>Binance App</strong> &gt; Tap QR Scanner</span>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <span className="h-4 w-4 rounded-full bg-bnb-yellow text-black flex items-center justify-center font-bold text-[9px] shrink-0">2</span>
                                <span>Point camera at the QR code to verify session</span>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <span className="h-4 w-4 rounded-full bg-bnb-yellow text-black flex items-center justify-center font-bold text-[9px] shrink-0">3</span>
                                <span>Authorize MPC keyless wallet &amp; guardrails</span>
                              </div>
                            </div>

                            {/* Trigger for Agent Confirmation if App Confirmed */}
                            {isAppConfirmed && (
                              <button
                                onClick={() => setShowConfirmModal(true)}
                                className="w-full border-2 border-foreground bg-bnb-yellow text-black font-black uppercase py-2 text-xs hover:bg-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle2 className="w-4 h-4 text-black" />
                                <span>Confirm Sign-In in Agent</span>
                              </button>
                            )}

                            {/* Actions Row */}
                            <div className="flex items-center gap-2 pt-1">
                              {pairingData?.urlForWeb && (
                                <a
                                  href={pairingData.urlForWeb}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="border border-foreground/40 px-2 py-1 text-[10px] hover:bg-foreground hover:text-background transition-colors flex items-center gap-1 text-muted-foreground"
                                >
                                  <span>Direct Link</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <button
                                onClick={initiatePairing}
                                className="border border-foreground/40 px-2 py-1 text-[10px] hover:bg-foreground hover:text-background transition-colors flex items-center gap-1 text-muted-foreground cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Refresh QR</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* MODE 2: EXTENSION WALLET TAB (Existing Verified Flow)                     */
          /* ========================================================================= */
          <>
            {!isBscMainnet && isConnected && (
              <div className="border-2 border-red-500 bg-red-950/30 p-4 mb-6 font-mono">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-red-400">BSC Mainnet Required</p>
                    <p className="text-[11px] text-muted-foreground">
                      OmniBasket executes tokenized equities strictly on BSC Chain ID 56.
                    </p>
                  </div>
                  <button
                    onClick={switchNetwork}
                    className="border-2 border-foreground bg-bnb-yellow text-black font-bold text-xs px-3 py-1.5 uppercase hover:bg-white transition-colors cursor-pointer"
                  >
                    Switch to BSC 56
                  </button>
                </div>
              </div>
            )}

            {isConnected ? (
              <div className="border-2 border-foreground bg-card p-4 mb-6 space-y-4 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Active Account
                    </span>
                    <span className="text-[10px] border border-foreground/40 px-1.5 py-0.5 bg-background">
                      {providerInfo.name}
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400 px-2 py-0.5 font-bold">
                    CONNECTED
                  </span>
                </div>

                <div className="flex items-center justify-between bg-background border border-foreground/40 p-2.5 text-xs">
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
                    <span className="text-[10px] text-muted-foreground block">USDT</span>
                    <span className="text-sm font-black text-bnb-yellow">${balances.usdt}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] text-muted-foreground block">BNB</span>
                    <span className="text-sm font-black">{balances.bnb}</span>
                  </div>
                  <div className="border border-foreground/30 bg-background p-2.5">
                    <span className="text-[10px] text-muted-foreground block">Total Portfolio</span>
                    <span className="text-sm font-black">${balances.totalUsd}</span>
                  </div>
                </div>

                {/* Self-Custody Security Notice */}
                <div className="border border-foreground/20 bg-background p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Self-custody verified: Orders require explicit signature in your extension provider.</span>
                </div>
              </div>
            ) : (
              <div className="border-2 border-foreground bg-card p-6 mb-6 text-center space-y-4 font-mono">
                <div className="mx-auto w-10 h-10 border-2 border-foreground bg-background flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-bnb-yellow" />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase">
                    Connect Binance Web3 Wallet
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Connect your browser extension to manage tokenized stock baskets with full self-custody on BNB Smart Chain.
                  </p>
                </div>

                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="border-2 border-foreground bg-bnb-yellow text-black font-black text-xs px-6 py-3 uppercase tracking-wider hover:bg-white transition-all shadow-[var(--shadow-box-sm)] disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
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
                      className="text-[11px] text-bnb-yellow underline hover:opacity-80 inline-flex items-center gap-1"
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

        {/* ========================================================================= */}
        {/* BINANCE AGENT CONFIRMATION POPUP (Matches Promptfolio App)                 */}
        {/* ========================================================================= */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-sm border-2 border-foreground bg-card text-foreground p-5 font-mono shadow-[var(--shadow-box)] space-y-4">
              <div className="flex items-center justify-between border-b border-foreground/30 pb-3">
                <div className="flex items-center gap-2 text-bnb-yellow font-bold text-xs uppercase">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm Sign-In in Agent</span>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="p-1 hover:bg-foreground hover:text-background"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Your Binance App verified the pairing code. Confirm in this Agent to complete MPC session activation:
              </p>

              {/* Pairing Code Tiles */}
              <div className="flex items-center justify-center gap-2 py-2">
                {(pairingData?.pairingCode || '------').split('').map((char, idx) => (
                  <div
                    key={idx}
                    className="w-9 h-10 border-2 border-foreground bg-background flex items-center justify-center font-black text-base text-bnb-yellow uppercase shadow-[2px_2px_0px_0px_#f0b90b]"
                  >
                    {char}
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-muted-foreground border border-foreground/20 bg-background p-2.5">
                <span className="font-bold block text-foreground mb-0.5">Safety Boundaries:</span>
                Daily spend is restricted to <strong>$50,000 USDT</strong> with <strong>0.5% max slippage</strong>.
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 border border-foreground px-3 py-2 uppercase font-bold text-xs hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAgent}
                  disabled={confirmingAgent}
                  className="flex-1 border-2 border-foreground bg-bnb-yellow text-black px-3 py-2 uppercase font-black text-xs hover:bg-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {confirmingAgent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{confirmingAgent ? 'Authorizing...' : 'Confirm Sign-In'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
