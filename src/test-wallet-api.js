import assert from 'assert';
import { getBawSessionInfo, getAgenticWalletStatus } from './services/bawSession.js';
import { readBscBalances } from './services/bscBalanceReader.js';

async function runApiTests() {
  console.log('--- Testing Wallet Backend Services & APIs ---');

  // 1. Session info inspection
  const sessionInfo = getBawSessionInfo();
  assert.strictEqual(typeof sessionInfo.exists, 'boolean', 'Session exists flag must be boolean');
  assert.strictEqual(typeof sessionInfo.hasClientId, 'boolean', 'Client ID flag must be boolean');
  console.log('✓ baw session inspection returned valid metadata:', {
    exists: sessionInfo.exists,
    hasClientId: sessionInfo.hasClientId,
    snippet: sessionInfo.clientIdSnippet
  });

  // 2. Agentic status check
  const statusRes = await getAgenticWalletStatus();
  assert.strictEqual(typeof statusRes.success, 'boolean', 'Status success must be boolean');
  console.log('✓ baw status check returned:', statusRes.data ? statusRes.data.status : statusRes.error?.message);

  // 3. Live BSC On-Chain Balance Reader (Chain ID 56)
  const testAddress = '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';
  const balanceRes = await readBscBalances(testAddress);
  assert.strictEqual(balanceRes.success, true, 'Balance read should succeed');
  assert.strictEqual(balanceRes.chainId, 56, 'Chain ID must strictly be 56');
  assert.strictEqual(balanceRes.address, testAddress, 'Address must match');
  assert.ok(Array.isArray(balanceRes.tokens), 'Tokens must be an array');
  assert.ok(balanceRes.tokens.length >= 7, 'Must read BNB and tokenized equities');

  const bnbToken = balanceRes.tokens.find(t => t.symbol === 'BNB');
  assert.ok(bnbToken, 'BNB token balance must be present');
  const usdtToken = balanceRes.tokens.find(t => t.symbol === 'USDT');
  assert.ok(usdtToken, 'USDT token balance must be present');

  console.log(`✓ BSC Mainnet on-chain balance verified: ${balanceRes.tokens.length} assets queried for ${testAddress}`);
  console.log(`  • BNB: ${bnbToken.balance}`);
  console.log(`  • USDT: ${usdtToken.balance}`);
  console.log(`  • Total Equities USD: $${balanceRes.totalValueUsd}`);

  // 4. Invalid address rejection
  await assert.rejects(
    async () => readBscBalances('invalid-address'),
    /Invalid BSC address provided/,
    'Should reject invalid address'
  );
  console.log('✓ Invalid address gracefully rejected');

  console.log('\nAll wallet backend tests passed successfully! ✅');
}

runApiTests().catch((err) => {
  console.error('Wallet API test failure:', err);
  process.exit(1);
});
