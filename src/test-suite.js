/**
 * OmniBasket AI - Comprehensive Verification Test Suite
 * 
 * Verifies:
 * 1. Absence of Binance Web3 API secrets does not break the app
 * 2. Shared server-side Agentic Wallet is disabled in public mode (503 fail-closed)
 * 3. No default or shared wallet address is ever treated as connected
 * 4. Extension wallet mode operates with on-chain BSC Chain ID 56 reads & unsigned calldata
 * 5. Pre-transaction simulation runs against BSC state and fails closed on reverts
 * 6. Minimum $5.00 order floor is strictly enforced on BSC
 * 7. Provider detection correctly identifies Binance Web3 Wallet vs generic injected providers
 * 8. OpenRouter / Built-in deterministic AI engine functions cleanly
 */

import { checkConfiguration } from './services/configCheck.js';
import { isAgenticWalletEnabled, ensureBawSession } from './services/bawSession.js';
import { 
  buildApproveCalldata, 
  buildSwapCalldata, 
  checkTokenAllowance,
  simulateBscTransaction,
  BSC_PANCAKE_ROUTER 
} from './services/bscRouter.js';
import { BSC_RWA_TOKENS } from './services/tokens.js';
import { parseChainId, getProviderInfo } from './lib/wallet/provider.js';

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('   OmniBasket AI — Architecture & Security Verification Test   ');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Configuration & Environment Integrity
  // --------------------------------------------------------------------------
  console.log('Test Group 1: Configuration & Security Feature Flags');
  const config = checkConfiguration();
  assert(config.agenticWalletEnabled === false, 'Agentic Wallet is disabled by default in public mode');
  assert(config.mode === 'EXTENSION_ONLY' || config.mode === 'EXTENSION_PRIMARY', 'Mode is configured for Extension wallet operations');
  assert(config.checks.binanceApiKeysConfigured === false || typeof config.checks.binanceApiKeysConfigured === 'boolean', 'Binance API keys are optional and diagnosed cleanly');
  assert(isAgenticWalletEnabled() === false, 'isAgenticWalletEnabled() returns false when ENABLE_AGENTIC_WALLET is unset or false');
  
  let threwOnBaw = false;
  try {
    await ensureBawSession();
  } catch (e) {
    threwOnBaw = true;
    assert(e.message.includes('disabled in public mode'), 'ensureBawSession() throws fail-closed with security message');
  }
  assert(threwOnBaw, 'Calling Agentic Wallet session when disabled throws exception');

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Provider Detection & Chain ID Parsing
  // --------------------------------------------------------------------------
  console.log('\nTest Group 2: Injected Provider & Chain ID Validation');
  assert(parseChainId('0x38') === 56, 'parseChainId parses 0x38 as Chain ID 56 (BSC Mainnet)');
  assert(parseChainId(56) === 56, 'parseChainId parses numeric 56 as Chain ID 56');
  assert(parseChainId('0x1') === 1, 'parseChainId parses 0x1 as Chain ID 1 (Ethereum)');
  assert(parseChainId('invalid') === null, 'parseChainId handles invalid chain input gracefully');

  const binanceMock = { isBinance: true };
  const metamaskMock = { isMetaMask: true };
  const nullMock = null;
  assert(getProviderInfo(binanceMock).isBinance === true, 'getProviderInfo identifies Binance Web3 Wallet');
  assert(getProviderInfo(metamaskMock).isBinance === false, 'getProviderInfo does NOT mislabel MetaMask as Binance');
  assert(getProviderInfo(nullMock).isInstalled === false, 'getProviderInfo handles uninstalled state gracefully');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: BSC Router & Unsigned Calldata Generation
  // --------------------------------------------------------------------------
  console.log('\nTest Group 3: PancakeSwap V2 Unsigned Calldata Builder');
  const dummyUser = '0xB635a5eAe16695910C75be147f7676b546441d72';
  const usdtAddr = BSC_RWA_TOKENS.USDT.contractAddress;
  const nvdaAddr = BSC_RWA_TOKENS.NVDA.contractAddress;

  const approveTx = buildApproveCalldata({
    tokenAddress: usdtAddr,
    spenderAddress: BSC_PANCAKE_ROUTER
  });
  assert(approveTx.to.toLowerCase() === usdtAddr.toLowerCase(), 'Approve calldata targets USDT contract address');
  assert(approveTx.data.startsWith('0x095ea7b3'), 'Approve calldata starts with ERC20 approve() method selector (0x095ea7b3)');
  assert(approveTx.value === '0x0', 'Approve calldata has 0x0 ETH/BNB value');

  const swapTx = buildSwapCalldata({
    fromAddress: dummyUser,
    fromTokenAddress: usdtAddr,
    toTokenAddress: nvdaAddr,
    amountInWei: 10000000000000000000n, // 10 USDT
    routerAddress: BSC_PANCAKE_ROUTER
  });
  assert(swapTx.to.toLowerCase() === BSC_PANCAKE_ROUTER.toLowerCase(), 'Swap calldata targets PancakeSwap Router');
  assert(swapTx.data.startsWith('0x5c11d795') || swapTx.data.startsWith('0x38ed1739'), 'Swap calldata starts with PancakeSwap swap selector (0x5c11d795)');
  assert(swapTx.value === '0x0', 'Token swap calldata has 0x0 BNB value');

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Pre-Transaction Simulation on BSC State
  // --------------------------------------------------------------------------
  console.log('\nTest Group 4: Pre-Transaction EVM Simulation on Live BSC State');
  try {
    const sim = await simulateBscTransaction({
      from: dummyUser,
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value
    });
    assert(typeof sim.status === 'string', `Simulation returned valid status: ${sim.status}`);
    // If account has 0 balance or allowance, it properly reports revert
    if (sim.status === 'SIMULATED_REVERT') {
      assert(sim.reverted === true, 'Simulation correctly detected on-chain EVM revert on BSC state');
      assert(Boolean(sim.failReason), `Simulation captured revert reason: ${sim.failReason}`);
    } else {
      assert(sim.status === 'SUCCESS' || sim.status === 'ESTIMATED', 'Simulation completed successfully or estimated');
    }
  } catch (err) {
    console.error('Simulation call error:', err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: On-Chain Balance Query via Viem
  // --------------------------------------------------------------------------
  console.log('\nTest Group 5: On-Chain Token Balances via Viem on BSC #56');
  try {
    const allowance = await checkTokenAllowance({
      tokenAddress: usdtAddr,
      ownerAddress: dummyUser,
      spenderAddress: BSC_PANCAKE_ROUTER
    });
    assert(typeof allowance === 'bigint', `Allowance returned as BigInt: ${allowance.toString()}`);
  } catch (err) {
    console.error('Allowance check error:', err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: API Route Boundary & Guardrail Tests
  // --------------------------------------------------------------------------
  console.log('\nTest Group 6: API Route Boundary & Guardrail Tests');
  try {
    const { GET: statusHandler } = await import('./app/api/wallet/status/route.js');
    const { GET: balanceHandler } = await import('./app/api/wallet/balance/route.js');
    const { POST: swapHandler } = await import('./app/api/wallet/swap/route.js');
    const { POST: executeHandler } = await import('./app/api/execute/route.js');
    const { POST: buildHandler } = await import('./app/api/swap/build/route.js');
    const { POST: simulateHandler } = await import('./app/api/simulate/route.js');
    const { POST: chatHandler } = await import('./app/api/chat/route.js');

    // 1. /api/wallet/status in public mode
    const statusRes = await statusHandler(new Request('http://localhost/api/wallet/status'));
    const statusData = await statusRes.json();
    assert(statusData.enabled === false, '/api/wallet/status reports enabled: false in public mode');
    assert(statusData.connected === false, '/api/wallet/status reports connected: false in public mode');
    assert(statusData.address === null, '/api/wallet/status never returns a shared server address');

    // 2. /api/wallet/balance without address (rejects with 503)
    const bareBalanceRes = await balanceHandler(new Request('http://localhost/api/wallet/balance'));
    assert(bareBalanceRes.status === 503, '/api/wallet/balance without ?address returns HTTP 503 Service Unavailable');

    // 3. /api/wallet/balance with user's extension address on BSC
    const userBalanceRes = await balanceHandler(new Request(`http://localhost/api/wallet/balance?address=${dummyUser}`));
    const userBalanceData = await userBalanceRes.json();
    assert(userBalanceRes.status === 200, '/api/wallet/balance with ?address returns HTTP 200 OK');
    assert(userBalanceData.success === true, '/api/wallet/balance reports success: true');
    assert(userBalanceData.address.toLowerCase() === dummyUser.toLowerCase(), '/api/wallet/balance reads the user extension address');
    assert(Array.isArray(userBalanceData.tokens), '/api/wallet/balance returns on-chain BSC token array');

    // 4. Server-side Agentic execution routes return 503
    const swapRes = await swapHandler(new Request('http://localhost/api/wallet/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'NVDA', fromTokenQty: 10 })
    }));
    assert(swapRes.status === 503, '/api/wallet/swap returns HTTP 503 in public mode');

    const executeRes = await executeHandler(new Request('http://localhost/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: [{ ticker: 'NVDA', weight: 100 }], depositAmount: 25 })
    }));
    assert(executeRes.status === 503, '/api/execute returns HTTP 503 in public mode');

    // 5. /api/swap/build input validation
    const noAddrRes = await buildHandler(new Request('http://localhost/api/swap/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 10 })
    }));
    assert(noAddrRes.status === 400, '/api/swap/build rejects missing userWalletAddress with HTTP 400');

    const lowAmtRes = await buildHandler(new Request('http://localhost/api/swap/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWalletAddress: dummyUser, fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 3 })
    }));
    assert(lowAmtRes.status === 400, '/api/swap/build enforces $5.00 minimum order floor with HTTP 400');

    // 6. /api/swap/build valid calldata generation
    const validBuildRes = await buildHandler(new Request('http://localhost/api/swap/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWalletAddress: dummyUser, fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 10 })
    }));
    const validBuildData = await validBuildRes.json();
    assert(validBuildRes.status === 200, '/api/swap/build returns HTTP 200 OK');
    assert(validBuildData.chainId === 56, '/api/swap/build outputs BSC Chain ID 56');
    assert(Boolean(validBuildData.swapTx), '/api/swap/build constructs swapTx object');
    assert(Boolean(validBuildData.simulation), '/api/swap/build performs pre-transaction simulation');

    // 7. /api/simulate returns structured leg simulations
    const simReqRes = await simulateHandler(new Request('http://localhost/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocations: [{ ticker: 'NVDA', weight: 60 }, { ticker: 'MSFT', weight: 40 }],
        depositAmount: 50,
        userWalletAddress: dummyUser
      })
    }));
    const simReqData = await simReqRes.json();
    assert(simReqRes.status === 200, '/api/simulate returns HTTP 200 OK');
    assert(Array.isArray(simReqData.legs) && simReqData.legs.length === 2, '/api/simulate returns simulation for each basket leg');

    // 8. /api/chat with built-in omnibasket-neuro engine
    const chatRes = await chatHandler(new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Create an AI basket with 60% Nvidia and 40% Microsoft',
        model: 'omnibasket-neuro'
      })
    }));
    const chatData = await chatRes.json();
    assert(chatRes.status === 200, '/api/chat returns HTTP 200 OK');
    assert(Boolean(chatData.reply), '/api/chat produces strategy response');
    assert(Boolean(chatData.basket), '/api/chat parses basket synchronizations');
  } catch (err) {
    console.error('API Route test error:', err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});
