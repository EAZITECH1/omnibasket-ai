import assert from 'assert';
import { 
  parseChainId, 
  formatAddress, 
  getProviderInfo, 
  BSC_MAINNET_CONFIG 
} from './lib/wallet/provider.js';

console.log('--- Testing Wallet Provider Utilities ---');

// 1. BSC Configuration
assert.strictEqual(BSC_MAINNET_CONFIG.chainIdDec, 56, 'BSC chainIdDec must be 56');
assert.strictEqual(BSC_MAINNET_CONFIG.chainIdHex, '0x38', 'BSC chainIdHex must be 0x38');
assert.strictEqual(BSC_MAINNET_CONFIG.nativeCurrency.symbol, 'BNB', 'Native currency must be BNB');
console.log('✓ BSC Mainnet configuration verified (Chain ID 56 / 0x38)');

// 2. Chain ID Parser
assert.strictEqual(parseChainId(56), 56, 'Decimal number 56');
assert.strictEqual(parseChainId('56'), 56, 'Decimal string "56"');
assert.strictEqual(parseChainId('0x38'), 56, 'Hex string "0x38"');
assert.strictEqual(parseChainId('0X38'), 56, 'Upper hex "0X38"');
assert.strictEqual(parseChainId('0x1'), 1, 'Ethereum hex "0x1"');
assert.strictEqual(parseChainId(null), null, 'Null chainId');
assert.strictEqual(parseChainId(undefined), null, 'Undefined chainId');
console.log('✓ Chain ID parsing correctly handles hex and decimal strings');

// 3. Format Address
assert.strictEqual(
  formatAddress('0x03A48c451B8cbE0bed6172eeaaE84a9B20505283'),
  '0x03A4...5283',
  'Address shortening format'
);
assert.strictEqual(formatAddress(''), '');
assert.strictEqual(formatAddress(null), '');
console.log('✓ Address formatter verified');

// 4. Provider Metadata Detection
const binanceMock = { isBinance: true };
const binanceInfo = getProviderInfo(binanceMock);
assert.strictEqual(binanceInfo.isBinance, true);
assert.strictEqual(binanceInfo.name, 'Binance Web3 Wallet');

const metamaskMock = { isMetaMask: true };
const metamaskInfo = getProviderInfo(metamaskMock);
assert.strictEqual(metamaskInfo.isBinance, false);
assert.strictEqual(metamaskInfo.name, 'MetaMask (Injected)');

const noneInfo = getProviderInfo(null);
assert.strictEqual(noneInfo.isInstalled, false);
assert.strictEqual(noneInfo.name, 'Not Detected');
console.log('✓ Provider metadata detection verified for Binance, MetaMask, and Null states');

console.log('\nAll provider utility tests passed successfully! ✅');
