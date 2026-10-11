/**
 * Binance Web3 Wallet & Injected Provider Utilities
 * Pinned to BNB Smart Chain Mainnet (Chain ID 56)
 */

export const BSC_MAINNET_CONFIG = {
  chainIdDec: 56,
  chainIdHex: '0x38',
  chainName: 'BNB Smart Chain Mainnet',
  rpcUrl: 'https://bsc-dataseed.binance.org/',
  blockExplorerUrl: 'https://bscscan.com',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18
  }
};

/**
 * Safely parse chain ID from hex or decimal string/number
 */
export function parseChainId(chainId) {
  if (chainId === null || chainId === undefined) return null;
  let parsed = null;
  if (typeof chainId === 'number') {
    parsed = chainId;
  } else if (typeof chainId === 'string') {
    if (chainId.startsWith('0x') || chainId.startsWith('0X')) {
      parsed = parseInt(chainId, 16);
    } else {
      parsed = parseInt(chainId, 10);
    }
  }
  return (typeof parsed === 'number' && !isNaN(parsed)) ? parsed : null;
}

/**
 * Shorten an EVM address for display
 */
export function formatAddress(address) {
  if (!address || typeof address !== 'string' || address.length < 10) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Safely detect Binance Web3 Wallet or Injected Provider
 */
export function getInjectedProvider() {
  if (typeof window === 'undefined') return null;

  // 1. Direct Binance Web3 Wallet extension
  if (window.binance) {
    return window.binance;
  }

  // 2. Binance Chain legacy extension
  if (window.BinanceChain) {
    return window.BinanceChain;
  }

  // 3. EIP-6963 announced provider cached globally
  if (window.__binanceAnnouncedProvider) {
    return window.__binanceAnnouncedProvider;
  }

  // 4. Multi-injected providers array (e.g. MetaMask + Binance wallet coexistence)
  if (window.ethereum && Array.isArray(window.ethereum.providers)) {
    const binanceP = window.ethereum.providers.find(
      p => p.isBinance || p.isBinanceWallet || p.isBinanceWeb3
    );
    if (binanceP) return binanceP;
  }

  // 5. Single injected provider with Binance flag
  if (window.ethereum && (window.ethereum.isBinance || window.ethereum.isBinanceWallet || window.ethereum.isBinanceWeb3)) {
    return window.ethereum;
  }

  // 6. Fallback to generic window.ethereum (clearly marked as non-Binance in getProviderInfo)
  if (window.ethereum) {
    return window.ethereum;
  }

  return null;
}

/**
 * Get display metadata for the detected provider
 */
export function getProviderInfo(provider) {
  if (!provider) {
    return {
      name: 'Not Installed',
      isBinance: false,
      isInstalled: false,
      installUrl: 'https://www.binance.com/en/web3wallet'
    };
  }

  if (
    provider === (typeof window !== 'undefined' ? window.binance : null) ||
    provider.isBinance ||
    provider.isBinanceWallet ||
    provider.isBinanceWeb3 ||
    (typeof window !== 'undefined' && provider === window.__binanceAnnouncedProvider)
  ) {
    return {
      name: 'Binance Web3 Wallet',
      isBinance: true,
      isInstalled: true,
      installUrl: 'https://www.binance.com/en/web3wallet'
    };
  }

  if (provider === (typeof window !== 'undefined' ? window.BinanceChain : null)) {
    return {
      name: 'Binance Chain Wallet',
      isBinance: true,
      isInstalled: true,
      installUrl: 'https://www.binance.com/en/web3wallet'
    };
  }

  if (provider.isMetaMask) {
    return {
      name: 'MetaMask (Injected EVM)',
      isBinance: false,
      isInstalled: true,
      installUrl: 'https://www.binance.com/en/web3wallet'
    };
  }

  return {
    name: 'Injected EVM Wallet',
    isBinance: false,
    isInstalled: true,
    installUrl: 'https://www.binance.com/en/web3wallet'
  };
}

/**
 * Check if the active provider has an already-approved account via eth_accounts (no popup)
 */
export async function checkActiveAccount(provider) {
  if (!provider || typeof provider.request !== 'function') return null;
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (Array.isArray(accounts) && accounts.length > 0 && accounts[0]) {
      return accounts[0];
    }
  } catch (_) {}
  return null;
}

/**
 * Check current chain ID via eth_chainId
 */
export async function checkChainId(provider) {
  if (!provider || typeof provider.request !== 'function') return null;
  try {
    const chainHex = await provider.request({ method: 'eth_chainId' });
    return parseChainId(chainHex);
  } catch (_) {}
  return null;
}

/**
 * Switch provider to BSC Mainnet (Chain ID 56)
 */
export async function switchToBscMainnet(provider) {
  if (!provider || typeof provider.request !== 'function') {
    throw new Error('No valid injected wallet provider detected');
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_MAINNET_CONFIG.chainIdHex }]
    });
    return true;
  } catch (switchError) {
    // Error code 4902 indicates chain is not added to the wallet
    if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BSC_MAINNET_CONFIG.chainIdHex,
          chainName: BSC_MAINNET_CONFIG.chainName,
          nativeCurrency: BSC_MAINNET_CONFIG.nativeCurrency,
          rpcUrls: [BSC_MAINNET_CONFIG.rpcUrl],
          blockExplorerUrls: [BSC_MAINNET_CONFIG.blockExplorerUrl]
        }]
      });
      return true;
    }
    throw switchError;
  }
}

/**
 * Initialize EIP-6963 provider announcement discovery
 */
export function initEip6963Discovery(onAnnounce) {
  if (typeof window === 'undefined') return () => {};

  const handleAnnouncement = (event) => {
    if (event.detail && event.detail.info && event.detail.provider) {
      const { info, provider } = event.detail;
      const rdns = (info.rdns || '').toLowerCase();
      const name = (info.name || '').toLowerCase();

      if (rdns.includes('binance') || name.includes('binance')) {
        window.__binanceAnnouncedProvider = provider;
        window.__isBinanceAnnounced = true;
        if (onAnnounce) onAnnounce(provider, info);
      }
    }
  };

  window.addEventListener('eip6963:announceProvider', handleAnnouncement);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  return () => {
    window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
  };
}

/**
 * Poll transaction receipt status using the active provider
 */
export async function pollExtensionReceipt(provider, txHash, maxAttempts = 30, intervalMs = 2000) {
  if (!provider || !txHash) return { status: 'UNKNOWN', txHash };

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash]
      });

      if (receipt) {
        const isSuccess = receipt.status === '0x1' || receipt.status === 1 || receipt.status === true;
        return {
          status: isSuccess ? 'CONFIRMED' : 'REVERTED',
          blockNumber: receipt.blockNumber,
          txHash,
          bscScanUrl: `https://bscscan.com/tx/${txHash}`
        };
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return { 
    status: 'PENDING', 
    txHash, 
    bscScanUrl: `https://bscscan.com/tx/${txHash}` 
  };
}
