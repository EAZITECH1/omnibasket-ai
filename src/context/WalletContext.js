'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  getInjectedProvider, 
  getProviderInfo, 
  switchToBscMainnet, 
  parseChainId, 
  initEip6963Discovery,
  BSC_MAINNET_CONFIG 
} from '../lib/wallet/provider.js';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  // State: 'agentic' | 'extension'
  const [walletMode, setWalletModeState] = useState('agentic');
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(56);
  const [balances, setBalances] = useState({
    usdt: '...',
    bnb: '...',
    totalUsd: '...',
    tokens: []
  });
  const [agenticInfo, setAgenticInfo] = useState({
    status: 'UNKNOWN',
    address: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
    quota: null,
    session: null,
    isDemoFallback: true
  });
  const [providerInfo, setProviderInfo] = useState({
    name: 'Detecting...',
    isBinance: false,
    isInstalled: false,
    installUrl: 'https://www.binance.com/en/web3wallet'
  });
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const activeProviderRef = useRef(null);

  // 1. Initialize EIP-6963 & provider detection on mount
  useEffect(() => {
    const unsub = initEip6963Discovery((provider) => {
      activeProviderRef.current = provider;
      setProviderInfo(getProviderInfo(provider));
    });

    const initialProvider = getInjectedProvider();
    if (initialProvider) {
      activeProviderRef.current = initialProvider;
      setProviderInfo(getProviderInfo(initialProvider));
    } else {
      setProviderInfo(getProviderInfo(null));
    }

    // Restore saved mode
    try {
      const savedMode = localStorage.getItem('omnibasket_wallet_mode');
      if (savedMode === 'agentic' || savedMode === 'extension') {
        setWalletModeState(savedMode);
      }
    } catch (_) {}

    return () => unsub();
  }, []);

  // 2. Fetch Agentic Wallet Status
  const fetchAgenticStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/status');
      const data = await res.json();
      if (data.success) {
        setAgenticInfo({
          status: data.status,
          address: data.address,
          quota: data.quota,
          session: data.session,
          isDemoFallback: !!data.isDemoFallback
        });
        if (walletMode === 'agentic') {
          setAddress(data.address);
          setChainId(56);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch agentic status:', err);
    }
  }, [walletMode]);

  // 3. Fetch Balances
  const refreshBalances = useCallback(async () => {
    try {
      const targetUrl = (walletMode === 'extension' && address)
        ? `/api/wallet/balance?address=${encodeURIComponent(address)}`
        : '/api/wallet/balance';

      const res = await fetch(targetUrl, { cache: 'no-store' });
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
      console.warn('Failed to fetch wallet balances:', err);
    }
  }, [walletMode, address]);

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
    } else {
      // In extension mode, check if already connected
      const provider = getInjectedProvider();
      if (provider) {
        activeProviderRef.current = provider;
        setProviderInfo(getProviderInfo(provider));
      }
      try {
        const wasConnected = localStorage.getItem('omnibasket_extension_connected') === 'true';
        if (wasConnected && provider) {
          connectExtension(false);
        } else {
          setAddress(null);
        }
      } catch (_) {
        setAddress(null);
      }
    }
  };

  // 5. Connect Extension Wallet
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
      // Request accounts
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected by user.');
      }
      const activeAccount = accounts[0];
      setAddress(activeAccount);

      // Read current chainId
      const currentChainHex = await provider.request({ method: 'eth_chainId' });
      const currentChain = parseChainId(currentChainHex);
      setChainId(currentChain);

      // Verify and prompt switch to BSC Mainnet (56) if on wrong chain
      if (currentChain !== 56) {
        try {
          await switchToBscMainnet(provider);
          setChainId(56);
        } catch (switchErr) {
          setError('Please switch your wallet network to BNB Smart Chain (Chain ID: 56).');
        }
      }

      // Setup listeners on provider
      const handleAccountsChanged = (accs) => {
        if (!accs || accs.length === 0) {
          disconnect();
        } else {
          setAddress(accs[0]);
        }
      };

      const handleChainChanged = (chainHex) => {
        const newChain = parseChainId(chainHex);
        setChainId(newChain);
      };

      const handleDisconnect = () => {
        disconnect();
      };

      if (typeof provider.on === 'function') {
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', handleChainChanged);
        provider.on('disconnect', handleDisconnect);
      }

      try {
        localStorage.setItem('omnibasket_extension_connected', 'true');
      } catch (_) {}

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
    setIsConnecting(true);
    setError(null);
    try {
      await fetchAgenticStatus();
      setChainId(56);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // 7. General Connect function based on active mode
  const connect = async () => {
    if (walletMode === 'agentic') {
      await connectAgentic();
    } else {
      await connectExtension(true);
    }
  };

  // 8. Disconnect
  const disconnect = () => {
    if (walletMode === 'extension') {
      setAddress(null);
      try {
        localStorage.removeItem('omnibasket_extension_connected');
      } catch (_) {}
    }
    setError(null);
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

  // 10. Sync balances and status on mode or address changes
  useEffect(() => {
    if (walletMode === 'agentic') {
      fetchAgenticStatus();
    }
    refreshBalances();

    const interval = setInterval(() => {
      if (walletMode === 'agentic') {
        fetchAgenticStatus();
      }
      refreshBalances();
    }, 8000);

    const onGlobalRefresh = () => {
      if (walletMode === 'agentic') fetchAgenticStatus();
      refreshBalances();
    };

    window.addEventListener('omnibasket-balance-refresh', onGlobalRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('omnibasket-balance-refresh', onGlobalRefresh);
    };
  }, [walletMode, address, fetchAgenticStatus, refreshBalances]);

  const isConnected = !!address;
  const isBscMainnet = chainId === 56;
  const networkName = isBscMainnet ? 'BSC Mainnet' : (chainId ? `Chain #${chainId}` : 'Unknown');

  return (
    <WalletContext.Provider
      value={{
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
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false)
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
