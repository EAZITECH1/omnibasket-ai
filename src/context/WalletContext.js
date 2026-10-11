'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  getInjectedProvider, 
  getProviderInfo, 
  switchToBscMainnet, 
  parseChainId, 
  checkActiveAccount, 
  checkChainId, 
  initEip6963Discovery, 
  BSC_MAINNET_CONFIG 
} from '../lib/wallet/provider.js';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  // Mode: defaults to 'extension' for public self-custody; allows explicit user toggle to 'agentic'
  const [walletMode, setWalletModeState] = useState('extension');
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Independent addresses per mode
  const [extensionAddress, setExtensionAddress] = useState(null);
  const [agenticAddress, setAgenticAddress] = useState(null);

  const [chainId, setChainId] = useState(56);
  const [balances, setBalances] = useState({
    usdt: '0.00',
    bnb: '0.0000',
    totalUsd: '0.00',
    tokens: []
  });

  const [agenticSession, setAgenticSession] = useState({
    connected: false,
    status: 'UNCONNECTED',
    available: true,
    pairingAvailable: true,
    tradingAvailable: false,
    tradingStatus: 'UNPAIRED',
    address: null,
    quota: null
  });

  const [providerInfo, setProviderInfo] = useState({
    name: 'Detecting...',
    isBinance: false,
    isInstalled: false,
    installUrl: 'https://www.binance.com/en/web3wallet'
  });
  
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('pairing'); // 'guardrails' | 'pairing'

  const activeProviderRef = useRef(null);

  // Active address dynamically derived from current mode
  const address = walletMode === 'agentic' ? agenticAddress : extensionAddress;

  // 1. Initialize EIP-6963 & provider detection on mount (never auto-connect from stale cache alone)
  useEffect(() => {
    const unsub = initEip6963Discovery((provider) => {
      activeProviderRef.current = provider;
      setProviderInfo(getProviderInfo(provider));
      checkActiveAccount(provider).then((acc) => {
        if (acc) {
          setExtensionAddress(acc);
          checkChainId(provider).then((cid) => {
            if (cid) setChainId(cid);
          });
        }
      });
    });

    const initialProvider = getInjectedProvider();
    if (initialProvider) {
      activeProviderRef.current = initialProvider;
      setProviderInfo(getProviderInfo(initialProvider));
      checkActiveAccount(initialProvider).then((acc) => {
        if (acc) {
          setExtensionAddress(acc);
          checkChainId(initialProvider).then((cid) => {
            if (cid) setChainId(cid);
          });
        }
      });
    } else {
      setProviderInfo(getProviderInfo(null));
    }

    try {
      const savedMode = localStorage.getItem('omnibasket_wallet_mode');
      if (savedMode === 'extension' || savedMode === 'agentic') {
        setWalletModeState(savedMode);
      }
    } catch (_) {}

    return () => unsub();
  }, []);

  // 2. Fetch Isolated Per-User Agentic Wallet Status
  const fetchAgenticStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agentic-wallet/status');
      const data = await res.json();
      if (data?.success && data?.data) {
        const isConn = !!data.data.connected && !!data.data.address;
        setAgenticSession({
          connected: isConn,
          status: data.data.status || 'UNCONNECTED',
          available: data.data.available !== false,
          pairingAvailable: data.data.pairingAvailable !== false,
          tradingAvailable: !!data.data.tradingAvailable,
          tradingStatus: data.data.tradingStatus || (isConn ? 'TRADING_UNAVAILABLE' : 'UNPAIRED'),
          address: data.data.address || null,
          quota: data.data.quota || null,
          message: data.data.message || null
        });
        if (isConn) {
          setAgenticAddress(data.data.address);
        } else {
          setAgenticAddress(null);
        }
      }
    } catch (err) {
      setAgenticSession({
        connected: false,
        status: 'UNAVAILABLE',
        available: false,
        pairingAvailable: false,
        tradingAvailable: false,
        tradingStatus: 'UNAVAILABLE',
        address: null,
        quota: null,
        message: 'Unable to reach Agentic Wallet service.'
      });
      setAgenticAddress(null);
    }
  }, []);

  // Check agentic status on mount and when switching modes
  useEffect(() => {
    fetchAgenticStatus();
  }, [fetchAgenticStatus]);

  // 3. Fetch Balances for active address on BSC Chain ID 56
  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances({
        usdt: '0.00',
        bnb: '0.0000',
        totalUsd: '0.00',
        tokens: []
      });
      return;
    }

    try {
      const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success && data.tokens) {
        const usdt = data.tokens.find(t => t.symbol === 'USDT');
        const bnb = data.tokens.find(t => t.symbol === 'BNB');

        setBalances({
          usdt: usdt ? usdt.balance.toFixed(2) : '0.00',
          bnb: bnb ? bnb.balance.toFixed(4) : '0.00',
          totalUsd: data.totalValueUsd ? data.totalValueUsd.toFixed(2) : '0.00',
          tokens: data.tokens
        });
      }
    } catch (err) {
      console.warn('Failed to fetch wallet balances on BSC:', err);
    }
  }, [address]);

  // 4. Set Wallet Mode
  const setWalletMode = (mode) => {
    if (mode !== 'agentic' && mode !== 'extension') return;
    setWalletModeState(mode);
    setError(null);
    try {
      localStorage.setItem('omnibasket_wallet_mode', mode);
    } catch (_) {}

    if (mode === 'agentic') {
      fetchAgenticStatus();
    }
  };

  // 5. Connect Extension Wallet (Requires explicit user interaction)
  const connectExtension = async (userInitiated = true) => {
    setIsConnecting(true);
    setError(null);

    const provider = getInjectedProvider();
    if (!provider) {
      setIsConnecting(false);
      setError('No Web3 wallet extension found. Please install Binance Web3 Wallet.');
      if (userInitiated) setIsModalOpen(true);
      return;
    }

    activeProviderRef.current = provider;
    setProviderInfo(getProviderInfo(provider));

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected by user.');
      }
      const activeAccount = accounts[0];
      setExtensionAddress(activeAccount);

      const currentChainHex = await provider.request({ method: 'eth_chainId' });
      const currentChain = parseChainId(currentChainHex);
      setChainId(currentChain);

      if (currentChain !== 56) {
        try {
          await switchToBscMainnet(provider);
          setChainId(56);
        } catch (switchErr) {
          setError('Please switch your wallet network to BNB Smart Chain (Chain ID: 56).');
        }
      }

      const handleAccountsChanged = (accs) => {
        if (!accs || accs.length === 0) {
          setExtensionAddress(null);
        } else {
          setExtensionAddress(accs[0]);
        }
      };

      const handleChainChanged = (chainHex) => {
        const newChain = parseChainId(chainHex);
        setChainId(newChain);
      };

      const handleDisconnect = () => {
        setExtensionAddress(null);
      };

      if (typeof provider.on === 'function') {
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', handleChainChanged);
        provider.on('disconnect', handleDisconnect);
      }
    } catch (err) {
      console.error('Extension connect error:', err);
      if (err.code === 4001) {
        setError('Connection request rejected by user.');
      } else {
        setError(err.message || 'Failed to connect extension wallet.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // 6. Connect Agentic Wallet
  const connectAgentic = async () => {
    setIsModalOpen(true);
    setModalTab('pairing');
  };

  // 7. General Connect function
  const connect = async () => {
    if (walletMode === 'agentic') {
      await connectAgentic();
    } else {
      await connectExtension(true);
    }
  };

  // 8. Disconnect
  const disconnectAgentic = async () => {
    try {
      await fetch('/api/agentic-wallet/auth/signout', { method: 'POST' });
    } catch (_) {}
    setAgenticAddress(null);
    setAgenticSession({
      connected: false,
      status: 'UNCONNECTED',
      address: null,
      quota: null
    });
    setError(null);
  };

  const disconnectExtension = () => {
    setExtensionAddress(null);
    setError(null);
  };

  const disconnect = async () => {
    if (walletMode === 'agentic') {
      await disconnectAgentic();
    } else {
      disconnectExtension();
    }
  };

  // 9. Switch network to BSC 56 explicitly
  const switchNetwork = async () => {
    const provider = activeProviderRef.current || getInjectedProvider();
    if (!provider) {
      setError('No injected wallet available to switch network.');
      return;
    }
    try {
      await switchToBscMainnet(provider);
      setChainId(56);
      setError(null);
    } catch (err) {
      setError(`Failed to switch network: ${err.message}`);
    }
  };

  // 10. Direct Extension Transaction Broadcast (eth_sendTransaction)
  const sendExtensionTransaction = async ({ to, data, value = '0x0' }) => {
    if (!extensionAddress) {
      throw new Error('Please connect your Binance Web3 Wallet first.');
    }

    const provider = activeProviderRef.current || getInjectedProvider();
    if (!provider) {
      throw new Error('No browser wallet extension provider found.');
    }

    const liveChainId = await checkChainId(provider);
    if (liveChainId !== 56) {
      setChainId(liveChainId || chainId);
      throw new Error(`Transaction blocked: active wallet is on chain #${liveChainId || 'unknown'}. Must be BNB Smart Chain Mainnet (Chain ID 56).`);
    }

    const liveAccount = await checkActiveAccount(provider);
    if (!liveAccount) {
      setExtensionAddress(null);
      throw new Error('Transaction blocked: wallet account is disconnected in extension.');
    }
    if (liveAccount.toLowerCase() !== extensionAddress.toLowerCase()) {
      setExtensionAddress(liveAccount);
      throw new Error(`Transaction blocked: active account changed in extension (connected: ${extensionAddress}, active: ${liveAccount}). Please re-verify.`);
    }

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: liveAccount,
        to,
        data,
        value: value || '0x0'
      }]
    });

    return txHash;
  };

  // 11. Sync balances on address change
  useEffect(() => {
    if (address) {
      refreshBalances();
      const interval = setInterval(refreshBalances, 8000);
      const onGlobalRefresh = () => refreshBalances();
      window.addEventListener('omnibasket-balance-refresh', onGlobalRefresh);
      return () => {
        clearInterval(interval);
        window.removeEventListener('omnibasket-balance-refresh', onGlobalRefresh);
      };
    }
  }, [address, refreshBalances]);

  const isConnected = !!address;
  const isBscMainnet = chainId === 56;
  const networkName = isBscMainnet ? 'BSC Mainnet (56)' : (chainId ? `Chain #${chainId}` : 'Unknown');

  return (
    <WalletContext.Provider
      value={{
        walletMode,
        setWalletMode,
        isConnected,
        isConnecting,
        address,
        extensionAddress,
        agenticAddress,
        chainId,
        isBscMainnet,
        networkName,
        balances,
        agenticSession,
        providerInfo,
        error,
        setError,
        connect,
        connectExtension,
        connectAgentic,
        disconnect,
        disconnectAgentic,
        disconnectExtension,
        switchNetwork,
        refreshBalances,
        fetchAgenticStatus,
        sendExtensionTransaction,
        isModalOpen,
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false),
        modalTab,
        setModalTab
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
