/**
 * Configuration & Startup Diagnostics for OmniBasket AI
 * Verifies active services without exposing secrets or credentials
 */

export function checkSystemConfig() {
  const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const hasBinanceWeb3 = Boolean(process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_SECRET_KEY);

  const status = {
    agenticWalletEnabled: isAgenticEnabled,
    mode: isAgenticEnabled ? 'EXTENSION_PRIMARY' : 'EXTENSION_ONLY',
    walletArchitecture: isAgenticEnabled 
      ? 'Dual Mode (Agentic + Extension)' 
      : 'Extension Wallet Mode (Browser Signing Only)',
    openRouter: hasOpenRouter ? 'Configured (Active)' : 'Not Configured (Using Built-in Neuro Engine)',
    binanceWeb3Api: hasBinanceWeb3 ? 'Configured (Optional Aggregator)' : 'Not Configured (Using On-Chain BSC DEX)',
    agenticWallet: isAgenticEnabled ? 'Enabled' : 'Disabled (Shared Wallet Removed)',
    network: 'BNB Smart Chain Mainnet (Chain ID 56)',
    checks: {
      agenticWalletEnabled: isAgenticEnabled,
      openRouterConfigured: hasOpenRouter,
      binanceApiKeysConfigured: hasBinanceWeb3
    }
  };

  return status;
}

export const checkConfiguration = checkSystemConfig;

export function logStartupBanner() {
  const cfg = checkSystemConfig();
  console.log('----------------------------------------------------');
  console.log('OmniBasket AI — BNB Smart Chain Execution Engine');
  console.log(`• Mode:               ${cfg.mode}`);
  console.log(`• Wallet Security:    ${cfg.walletArchitecture}`);
  console.log(`• AI Model Engine:    ${cfg.openRouter}`);
  console.log(`• RWA Price Routing:  ${cfg.binanceWeb3Api}`);
  console.log(`• Agentic Shared CLI: ${cfg.agenticWallet}`);
  console.log(`• Target Network:     ${cfg.network}`);
  console.log('----------------------------------------------------');
}
