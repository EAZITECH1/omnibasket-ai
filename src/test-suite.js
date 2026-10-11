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
 * 8. Meaningful slippage protection (0.5% max) and nonzero amountOutMinWei
 * 9. Exact-amount token approvals (rejection of unlimited uint256.max approvals)
 * 10. Route discovery & unroutable asset rejection (USDY, GOOG, MAG7X, AI)
 * 11. OpenRouter / Built-in deterministic AI engine functions cleanly
 */

import { checkConfiguration } from './services/configCheck.js';
import { isAgenticWalletEnabled, ensureBawSession } from './services/bawSession.js';
import { 
  buildApproveCalldata, 
  buildSwapCalldata, 
  checkTokenAllowance,
  simulateBscTransaction,
  getBscSwapQuote,
  BSC_PANCAKE_ROUTER 
} from './services/bscRouter.js';
import { BSC_RWA_TOKENS, PRESET_BASKETS } from './services/tokens.js';
import { 
  parseChainId, 
  getProviderInfo, 
  checkActiveAccount, 
  checkChainId 
} from './lib/wallet/provider.js';

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
  // TEST GROUP 2: Provider Detection, Chain ID & Account Validation
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

  // Provider chain & account check tests
  const bscProviderMock = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x38';
      if (method === 'eth_accounts') return ['0xB635a5eAe16695910C75be147f7676b546441d72'];
      return null;
    }
  };
  const bscChain = await checkChainId(bscProviderMock);
  const bscAcc = await checkActiveAccount(bscProviderMock);
  assert(bscChain === 56, 'checkChainId correctly queries 56 from BSC provider mock');
  assert(bscAcc === '0xB635a5eAe16695910C75be147f7676b546441d72', 'checkActiveAccount correctly returns active signer address');

  const ethProviderMock = {
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_accounts') return [];
      return null;
    }
  };
  const ethChain = await checkChainId(ethProviderMock);
  const ethAcc = await checkActiveAccount(ethProviderMock);
  assert(ethChain === 1, 'checkChainId correctly flags non-BSC chain (Chain ID 1)');
  assert(ethAcc === null, 'checkActiveAccount returns null when wallet accounts list is empty');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Exact ERC-20 Approvals (Zero Unlimited Allowances)
  // --------------------------------------------------------------------------
  console.log('\nTest Group 3: Exact ERC-20 Approvals & Unlimited Approval Prevention');
  const dummyUser = '0xB635a5eAe16695910C75be147f7676b546441d72';
  const usdtAddr = BSC_RWA_TOKENS.USDT.contractAddress;
  const nvdaAddr = BSC_RWA_TOKENS.NVDA.contractAddress;

  // 1. Missing amountWei throws error
  let approveThrewWithoutAmount = false;
  try {
    buildApproveCalldata({
      tokenAddress: usdtAddr,
      spenderAddress: BSC_PANCAKE_ROUTER
    });
  } catch (err) {
    approveThrewWithoutAmount = true;
    assert(err.message.includes('Explicit nonzero amountWei is required'), 'buildApproveCalldata rejects missing amountWei with explicit error');
  }
  assert(approveThrewWithoutAmount, 'Calling buildApproveCalldata without amountWei throws exception');

  // 2. Zero amountWei throws error
  let approveThrewWithZero = false;
  try {
    buildApproveCalldata({
      tokenAddress: usdtAddr,
      spenderAddress: BSC_PANCAKE_ROUTER,
      amountWei: 0n
    });
  } catch (err) {
    approveThrewWithZero = true;
    assert(err.message.includes('Explicit nonzero amountWei is required'), 'buildApproveCalldata rejects zero amountWei (0n)');
  }
  assert(approveThrewWithZero, 'Calling buildApproveCalldata with 0n throws exception');

  // 3. Valid exact amount approval
  const exactAmountWei = 10000000000000000000n; // 10 USDT
  const approveTx = buildApproveCalldata({
    tokenAddress: usdtAddr,
    spenderAddress: BSC_PANCAKE_ROUTER,
    amountWei: exactAmountWei
  });
  assert(approveTx.to.toLowerCase() === usdtAddr.toLowerCase(), 'Approve calldata targets USDT contract address');
  assert(approveTx.data.startsWith('0x095ea7b3'), 'Approve calldata starts with ERC20 approve() method selector (0x095ea7b3)');
  assert(approveTx.value === '0x0', 'Approve calldata has 0x0 ETH/BNB value');
  // Check that the encoded amount is exactly 10 USDT, NOT uint256.max (ffffffff...)
  const encodedAmount = approveTx.data.slice(74); // Spender is 32 bytes, amount is next 32 bytes
  assert(!encodedAmount.startsWith('ffffffffffff'), 'Approve calldata does NOT encode uint256.max');
  assert(encodedAmount.endsWith('8ac7230489e80000'), 'Approve calldata precisely encodes 10 USDT in hexadecimal');

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Meaningful Slippage Protection & Swap Calldata Generation
  // --------------------------------------------------------------------------
  console.log('\nTest Group 4: Slippage Protection & PancakeSwap V2 Calldata Generation');

  // 1. Missing amountOutMinWei throws error
  let swapThrewWithoutMinOut = false;
  try {
    buildSwapCalldata({
      fromAddress: dummyUser,
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      routerAddress: BSC_PANCAKE_ROUTER
    });
  } catch (err) {
    swapThrewWithoutMinOut = true;
    assert(err.message.includes('Explicit nonzero amountOutMinWei is required'), 'buildSwapCalldata rejects missing amountOutMinWei with explicit error');
  }
  assert(swapThrewWithoutMinOut, 'Calling buildSwapCalldata without amountOutMinWei throws exception');

  // 2. Zero amountOutMinWei throws error
  let swapThrewWithZeroMinOut = false;
  try {
    buildSwapCalldata({
      fromAddress: dummyUser,
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      amountOutMinWei: 0n,
      routerAddress: BSC_PANCAKE_ROUTER
    });
  } catch (err) {
    swapThrewWithZeroMinOut = true;
    assert(err.message.includes('Explicit nonzero amountOutMinWei is required'), 'buildSwapCalldata rejects 0n amountOutMinWei');
  }
  assert(swapThrewWithZeroMinOut, 'Calling buildSwapCalldata with amountOutMinWei = 0n throws exception');

  // 3. Valid swap calldata with nonzero amountOutMinWei
  const dummyAmountOutMin = 42000000000000000n; // 0.042 tokens
  const swapTx = buildSwapCalldata({
    fromAddress: dummyUser,
    fromTokenAddress: usdtAddr,
    toTokenAddress: nvdaAddr,
    amountInWei: exactAmountWei,
    amountOutMinWei: dummyAmountOutMin,
    routerAddress: BSC_PANCAKE_ROUTER
  });
  assert(swapTx.to.toLowerCase() === BSC_PANCAKE_ROUTER.toLowerCase(), 'Swap calldata targets PancakeSwap Router');
  assert(swapTx.data.startsWith('0x5c11d795') || swapTx.data.startsWith('0x38ed1739'), 'Swap calldata starts with PancakeSwap swap selector');
  assert(swapTx.value === '0x0', 'Token swap calldata has 0x0 BNB value');

  // --------------------------------------------------------------------------
  // TEST GROUP 5: BSC Route Discovery & Slippage Bound Enforcement
  // --------------------------------------------------------------------------
  console.log('\nTest Group 5: On-Chain AMM Route Discovery & 0.5% Slippage Bounding');
  try {
    // 1. Live BSC Quote for tradable token (NVDA)
    const quote = await getBscSwapQuote({
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      maxSlippageBps: 50 // 0.5%
    });
    assert(quote.expectedAmountOutWei > 0n, `getBscSwapQuote returned positive expected output: ${quote.expectedAmountOutWei.toString()} wei`);
    assert(quote.amountOutMinWei > 0n, `getBscSwapQuote returned positive minimum output: ${quote.amountOutMinWei.toString()} wei`);
    assert(quote.amountOutMinWei < quote.expectedAmountOutWei, 'amountOutMinWei is strictly less than expectedAmountOutWei (accounts for slippage)');
    assert(quote.slippageBps <= 50, `Slippage is strictly bounded to max 50 bps (0.5%): current = ${quote.slippageBps} bps`);
    assert(Array.isArray(quote.path) && quote.path.length >= 2, 'Quote returns valid PancakeSwap V2 routing path array');

    // 2. Slippage cap enforcement: requesting 200 bps (2.0%) is capped at 50 bps (0.5%)
    const cappedQuote = await getBscSwapQuote({
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      maxSlippageBps: 200 // Attempting 2.0%
    });
    assert(cappedQuote.slippageBps === 50, `Excessive slippage (200 bps) was strictly capped to 50 bps (0.5%): result = ${cappedQuote.slippageBps} bps`);

    // 3. Rejection of unroutable assets (e.g. USDY has no BSC AMM pool)
    const unroutableQuote = await getBscSwapQuote({
      fromTokenAddress: usdtAddr,
      toTokenAddress: BSC_RWA_TOKENS.USDY.contractAddress,
      amountInWei: exactAmountWei,
      maxSlippageBps: 50
    });
    assert(unroutableQuote.success === false, 'getBscSwapQuote returns success: false for unroutable token (USDY)');
    assert(unroutableQuote.error.includes('No active liquidity pool route found') || unroutableQuote.error.includes('PancakeSwap V2'), 'getBscSwapQuote explains liquidity pool is missing');


    // 4. Token registry tradability status verification
    assert(BSC_RWA_TOKENS.NVDA.tradableOnBscDEX === true, 'NVDA is marked tradableOnBscDEX: true');
    assert(BSC_RWA_TOKENS.AAPL.tradableOnBscDEX === true, 'AAPL is marked tradableOnBscDEX: true');
    assert(BSC_RWA_TOKENS.MSFT.tradableOnBscDEX === true, 'MSFT is marked tradableOnBscDEX: true');
    assert(BSC_RWA_TOKENS.TSLA.tradableOnBscDEX === true, 'TSLA is marked tradableOnBscDEX: true');
    assert(BSC_RWA_TOKENS.USDY.tradableOnBscDEX === false, 'USDY is marked tradableOnBscDEX: false');
    assert(BSC_RWA_TOKENS.GOOG.tradableOnBscDEX === false, 'GOOG is marked tradableOnBscDEX: false');
    assert(BSC_RWA_TOKENS.MAG7X.tradableOnBscDEX === false, 'MAG7X is marked tradableOnBscDEX: false');

    // 5. Preset baskets verification: all presets have 100% tradable assets
    for (const [id, preset] of Object.entries(PRESET_BASKETS)) {
      const allTradable = preset.allocations.every(a => BSC_RWA_TOKENS[a.ticker]?.tradableOnBscDEX === true);
      assert(allTradable, `Preset '${preset.name}' contains 100% verified tradable assets on BSC`);
    }
  } catch (err) {
    console.error('Route discovery test error:', err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Pre-Transaction Simulation on BSC State
  // --------------------------------------------------------------------------
  console.log('\nTest Group 6: Pre-Transaction EVM Simulation on Live BSC State');
  try {
    // 1. Simulate exact approval on live BSC state
    const simApprove = await simulateBscTransaction({
      from: dummyUser,
      to: approveTx.to,
      data: approveTx.data,
      value: approveTx.value
    });
    assert(simApprove.status === 'SUCCESS', `simulateBscTransaction for exact approval succeeded with status: ${simApprove.status}`);
    assert(typeof simApprove.gasUsed === 'string', `Simulation returned estimated gasUsed: ${simApprove.gasUsed}`);

    // 2. Simulate swap transaction on live BSC state
    const simSwap = await simulateBscTransaction({
      from: dummyUser,
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value
    });
    assert(typeof simSwap.status === 'string', `Swap simulation returned valid status: ${simSwap.status}`);
    if (simSwap.status === 'SIMULATED_REVERT') {
      assert(simSwap.reverted === true, 'Simulation correctly detected on-chain EVM revert on BSC state (reverts fail closed)');
      assert(Boolean(simSwap.failReason), `Simulation captured revert reason: ${simSwap.failReason}`);
    } else {
      assert(simSwap.status === 'SUCCESS' || simSwap.status === 'ESTIMATED', 'Simulation completed successfully or estimated');
    }
  } catch (err) {
    console.error('Simulation call error:', err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 7: On-Chain Balance Query via Viem
  // --------------------------------------------------------------------------
  console.log('\nTest Group 7: On-Chain Token Balances via Viem on BSC #56');
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
  // TEST GROUP 8: API Route Boundary & Guardrail Tests
  // --------------------------------------------------------------------------
  console.log('\nTest Group 8: API Route Boundary & Guardrail Tests');
  try {
    const { GET: statusHandler } = await import('./app/api/wallet/status/route.js');
    const { GET: balanceHandler } = await import('./app/api/wallet/balance/route.js');
    const { POST: swapHandler } = await import('./app/api/wallet/swap/route.js');
    const { POST: executeHandler } = await import('./app/api/execute/route.js');
    const { POST: buildHandler } = await import('./app/api/swap/build/route.js');
    const { POST: simulateHandler } = await import('./app/api/simulate/route.js');
    const { POST: quoteHandler } = await import('./app/api/quote/route.js');
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
    const serverSwapRes = await swapHandler(new Request('http://localhost/api/wallet/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'NVDA', fromTokenQty: 10 })
    }));
    assert(serverSwapRes.status === 503, '/api/wallet/swap returns HTTP 503 in public mode');

    const executeRes = await executeHandler(new Request('http://localhost/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: [{ ticker: 'NVDA', weight: 100 }], depositAmount: 25 })
    }));
    assert(executeRes.status === 503, '/api/execute returns HTTP 503 in public mode');

    // 5. /api/quote route tests
    const quoteReqRes = await quoteHandler(new Request('http://localhost/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 10 })
    }));
    const quoteReqData = await quoteReqRes.json();
    assert(quoteReqRes.status === 200, '/api/quote returns HTTP 200 for tradable asset');
    assert(quoteReqData.tradableOnBscDEX === true, '/api/quote flags tradableOnBscDEX: true for NVDA');
    assert(Number(quoteReqData.slippageBps) <= 50, '/api/quote enforces max 50 bps slippage');

    const unroutableQuoteRes = await quoteHandler(new Request('http://localhost/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'USDY', fromAmount: 10 })
    }));
    assert(unroutableQuoteRes.status === 400, '/api/quote returns HTTP 400 for unroutable token (USDY)');

    // 6. /api/swap/build input validation
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

    const unroutableBuildRes = await buildHandler(new Request('http://localhost/api/swap/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWalletAddress: dummyUser, fromTicker: 'USDT', toTicker: 'USDY', fromAmount: 10 })
    }));
    assert(unroutableBuildRes.status === 400, '/api/swap/build rejects unroutable token (USDY) with HTTP 400');

    // 7. /api/swap/build valid calldata generation
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
    assert(validBuildData.quote.amountOutMinWei !== '0', '/api/swap/build returns nonzero amountOutMinWei');
    assert(validBuildData.quote.slippagePct === '0.5%', '/api/swap/build confirms 0.5% slippage bound');
    if (validBuildData.needsApproval) {
      assert(Boolean(validBuildData.approveTx), '/api/swap/build provides exact approveTx when allowance is needed');
      assert(validBuildData.simulation.status === 'SUCCESS', '/api/swap/build verifies approval pre-simulation on BSC');
    }

    // 8. /api/simulate returns structured leg simulations & fails closed on unroutable tokens
    const unroutableSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocations: [{ ticker: 'USDY', weight: 100 }],
        depositAmount: 50,
        userWalletAddress: dummyUser
      })
    }));
    const unroutableSimData = await unroutableSimRes.json();
    assert(unroutableSimData.overallStatus === 'REVERT_BLOCKED', '/api/simulate returns REVERT_BLOCKED when basket includes unroutable asset (USDY)');
    assert(unroutableSimData.legs[0].status === 'SIMULATED_REVERT', '/api/simulate marks untradable leg as SIMULATED_REVERT');

    const tradableSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocations: [{ ticker: 'NVDA', weight: 60 }, { ticker: 'MSFT', weight: 40 }],
        depositAmount: 50,
        userWalletAddress: dummyUser
      })
    }));
    const tradableSimData = await tradableSimRes.json();
    assert(tradableSimRes.status === 200, '/api/simulate returns HTTP 200 OK for tradable basket');
    assert(Array.isArray(tradableSimData.legs) && tradableSimData.legs.length === 2, '/api/simulate returns simulation for each basket leg');

    // 9. /api/chat with built-in omnibasket-neuro engine
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
