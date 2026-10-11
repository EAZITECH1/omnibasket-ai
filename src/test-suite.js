/**
 * OmniBasket AI - Comprehensive Verification & Regression Test Suite
 * 
 * Architecture:
 * 1. DETERMINISTIC OFFLINE UNIT TEST SUITE:
 *    - Runs 100% offline without live RPC or network dependencies.
 *    - Uses injectable mock clients for EVM reads and simulations.
 *    - Tests configuration flags, provider detection, calldata encoding, route guards,
 *      API boundary error codes, balance verification, and production execution orchestration.
 * 
 * 2. LIVE BSC MAINNET SMOKE TEST SUITE (Network-Dependent):
 *    - Probes BSC Mainnet RPC connectivity honestly.
 *    - If reachable, verifies live on-chain quoting, route discovery, and EVM dry-runs.
 *    - If unreachable, reports infra/network unavailability without masking or mislabeling.
 */

import { checkConfiguration } from './services/configCheck.js';
import { isAgenticWalletEnabled, ensureBawSession } from './services/bawSession.js';
import { 
  buildApproveCalldata, 
  buildSwapCalldata, 
  checkTokenAllowance,
  checkTokenBalance,
  simulateBscTransaction, 
  getBscSwapQuote, 
  BSC_PANCAKE_ROUTER,
  setCustomPublicBscClient,
  getPublicBscClient
} from './services/bscRouter.js';
import { BSC_RWA_TOKENS, PRESET_BASKETS } from './services/tokens.js';
import { 
  parseChainId, 
  getProviderInfo, 
  checkActiveAccount, 
  checkChainId,
  pollExtensionReceipt
} from './lib/wallet/provider.js';
import { executeBasket } from './services/basketExecutor.js';

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

function skip(description, reason) {
  console.log(`  ⚠️  SKIP: ${description} (${reason})`);
  skipped++;
}

// ============================================================================
// PART 1: DETERMINISTIC OFFLINE UNIT TEST SUITE
// ============================================================================
async function runOfflineUnitTests() {
  console.log('===============================================================');
  console.log('   OmniBasket AI — Deterministic Offline Unit Test Suite       ');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Configuration & Security Feature Flags
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
  const encodedAmount = approveTx.data.slice(74);
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
  // TEST GROUP 5: Token Registry & Tradable Basket Allocation Integrity
  // --------------------------------------------------------------------------
  console.log('\nTest Group 5: Token Registry & Tradable Basket Allocation Integrity');
  assert(BSC_RWA_TOKENS.NVDA.tradableOnBscDEX === true, 'NVDA is marked tradableOnBscDEX: true');
  assert(BSC_RWA_TOKENS.AAPL.tradableOnBscDEX === true, 'AAPL is marked tradableOnBscDEX: true');
  assert(BSC_RWA_TOKENS.MSFT.tradableOnBscDEX === true, 'MSFT is marked tradableOnBscDEX: true');
  assert(BSC_RWA_TOKENS.TSLA.tradableOnBscDEX === true, 'TSLA is marked tradableOnBscDEX: true');
  assert(BSC_RWA_TOKENS.USDY.tradableOnBscDEX === false, 'USDY is marked tradableOnBscDEX: false');
  assert(BSC_RWA_TOKENS.GOOG.tradableOnBscDEX === false, 'GOOG is marked tradableOnBscDEX: false');
  assert(BSC_RWA_TOKENS.MAG7X.tradableOnBscDEX === false, 'MAG7X is marked tradableOnBscDEX: false');

  for (const [id, preset] of Object.entries(PRESET_BASKETS)) {
    const allTradable = preset.allocations.every(a => BSC_RWA_TOKENS[a.ticker]?.tradableOnBscDEX === true);
    assert(allTradable, `Preset '${preset.name}' contains 100% verified tradable assets on BSC`);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: API Route Boundary & Guardrail Tests
  // --------------------------------------------------------------------------
  console.log('\nTest Group 6: API Route Boundary & Input Validation Tests');
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

  // 3. Server-side Agentic execution routes return 503
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

  // 4. /api/quote rejects unroutable token
  const unroutableQuoteRes = await quoteHandler(new Request('http://localhost/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'USDY', fromAmount: 10 })
  }));
  assert(unroutableQuoteRes.status === 400, '/api/quote returns HTTP 400 for unroutable token (USDY)');

  // 5. /api/swap/build input validation
  const noAddrBuildRes = await buildHandler(new Request('http://localhost/api/swap/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 10 })
  }));
  assert(noAddrBuildRes.status === 400, '/api/swap/build rejects missing userWalletAddress with HTTP 400');

  const lowAmtBuildRes = await buildHandler(new Request('http://localhost/api/swap/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userWalletAddress: dummyUser, fromTicker: 'USDT', toTicker: 'NVDA', fromAmount: 3 })
  }));
  assert(lowAmtBuildRes.status === 400, '/api/swap/build enforces $5.00 minimum order floor with HTTP 400');

  const unroutableBuildRes = await buildHandler(new Request('http://localhost/api/swap/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userWalletAddress: dummyUser, fromTicker: 'USDT', toTicker: 'USDY', fromAmount: 10 })
  }));
  assert(unroutableBuildRes.status === 400, '/api/swap/build rejects unroutable token (USDY) with HTTP 400');

  // 6. /api/simulate address validation: missing or invalid address returns 400
  const noAddrSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10
    })
  }));
  assert(noAddrSimRes.status === 400, '/api/simulate returns HTTP 400 when userWalletAddress is missing');

  const invalidAddrSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: '0xinvalid_address'
    })
  }));
  assert(invalidAddrSimRes.status === 400, '/api/simulate returns HTTP 400 when userWalletAddress is invalid');

  // 7. /api/simulate unroutable token fails closed
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

  // 7b. /api/simulate input validation for depositAmount and weights
  const negDepositSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: -10,
      userWalletAddress: dummyUser
    })
  }));
  assert(negDepositSimRes.status === 400, '/api/simulate rejects negative depositAmount with HTTP 400');

  const zeroDepositSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 0,
      userWalletAddress: dummyUser
    })
  }));
  assert(zeroDepositSimRes.status === 400, '/api/simulate rejects zero depositAmount with HTTP 400');

  const invalidDepositSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 'not_a_number',
      userWalletAddress: dummyUser
    })
  }));
  assert(invalidDepositSimRes.status === 400, '/api/simulate rejects non-numeric depositAmount with HTTP 400');

  const negWeightSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: -50 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    })
  }));
  assert(negWeightSimRes.status === 400, '/api/simulate rejects negative allocation weight with HTTP 400');

  const excessSingleWeightSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 150 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    })
  }));
  assert(excessSingleWeightSimRes.status === 400, '/api/simulate rejects allocation weight > 100% with HTTP 400');

  const excessTotalWeightSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 60 }, { ticker: 'MSFT', weight: 60 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    })
  }));
  assert(excessTotalWeightSimRes.status === 400, '/api/simulate rejects total allocation weights > 100% with HTTP 400');

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

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Mock Client Injection & Deterministic Contract Read Tests
  // --------------------------------------------------------------------------
  console.log('\nTest Group 7: Mock Client Injection & Deterministic Contract Read Tests');
  
  // 1. Mock Client Balance and Allowance
  const mockViemClient = {
    readContract: async ({ functionName, address, args }) => {
      if (functionName === 'balanceOf') return 50000000000000000000n; // 50 USDT
      if (functionName === 'allowance') return 0n; // 0 allowance
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockViemClient);

  const mockBalance = await checkTokenBalance({
    tokenAddress: usdtAddr,
    ownerAddress: dummyUser
  });
  assert(mockBalance === 50000000000000000000n, 'checkTokenBalance queries balance via injected client');

  const mockAllowance = await checkTokenAllowance({
    tokenAddress: usdtAddr,
    ownerAddress: dummyUser,
    spenderAddress: BSC_PANCAKE_ROUTER
  });
  assert(mockAllowance === 0n, 'checkTokenAllowance queries allowance via injected client');

  // 2. Error propagation on balance read failure
  const mockFaultyClient = {
    readContract: async () => {
      throw new Error('Simulated RPC network timeout');
    }
  };
  setCustomPublicBscClient(mockFaultyClient);

  let threwBalanceRead = false;
  try {
    await checkTokenBalance({ tokenAddress: usdtAddr, ownerAddress: dummyUser });
  } catch (err) {
    threwBalanceRead = true;
    assert(err.message.includes('Simulated RPC network timeout'), 'checkTokenBalance propagates RPC error instead of masking as 0 balance');
  }
  assert(threwBalanceRead, 'checkTokenBalance throws on contract/RPC read failure');

  let threwAllowanceRead = false;
  try {
    await checkTokenAllowance({ tokenAddress: usdtAddr, ownerAddress: dummyUser, spenderAddress: BSC_PANCAKE_ROUTER });
  } catch (err) {
    threwAllowanceRead = true;
    assert(err.message.includes('Simulated RPC network timeout'), 'checkTokenAllowance propagates RPC error instead of masking as 0 allowance');
  }
  assert(threwAllowanceRead, 'checkTokenAllowance throws on contract/RPC read failure');

  // 3. /api/simulate with mock client: Sufficient Balance + Zero Allowance -> APPROVAL_REQUIRED_FIRST
  setCustomPublicBscClient(mockViemClient);
  const simMockRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser
    })
  }));
  const simMockData = await simMockRes.json();
  assert(simMockRes.status === 200, '/api/simulate returns 200 with injected mock client');
  assert(simMockData.success === true, '/api/simulate reports success: true when balance is sufficient');
  assert(simMockData.overallStatus === 'APPROVAL_REQUIRED_FIRST', '/api/simulate returns APPROVAL_REQUIRED_FIRST when allowance is 0');
  assert(simMockData.legs[0].needsApproval === true, 'Leg marks needsApproval: true');

  // 4. /api/simulate with mock client: Insufficient Balance -> REVERT_BLOCKED
  const mockZeroBalanceClient = {
    readContract: async ({ functionName, args }) => {
      if (functionName === 'balanceOf') return 0n; // 0 balance!
      if (functionName === 'allowance') return 0n;
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockZeroBalanceClient);
  const simZeroBalRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser
    })
  }));
  const simZeroBalData = await simZeroBalRes.json();
  assert(simZeroBalData.success === false, '/api/simulate fails closed (success: false) on insufficient balance');
  assert(simZeroBalData.overallStatus === 'REVERT_BLOCKED', '/api/simulate returns REVERT_BLOCKED on insufficient balance');
  assert(simZeroBalData.legs[0].failReason.includes('Insufficient USDT balance'), 'Leg failReason specifies insufficient USDT balance');

  // 5. /api/simulate with mock client: Balance read failure -> REVERT_BLOCKED
  const mockFaultyBalanceClient = {
    readContract: async ({ functionName, args }) => {
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      if (functionName === 'balanceOf') throw new Error('Simulated RPC network timeout');
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockFaultyBalanceClient);
  const simFaultyBalRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser
    })
  }));
  const simFaultyBalData = await simFaultyBalRes.json();
  assert(simFaultyBalData.success === false, '/api/simulate fails closed (success: false) when balance lookup fails');
  assert(simFaultyBalData.overallStatus === 'REVERT_BLOCKED', '/api/simulate returns REVERT_BLOCKED on balance read failure');
  assert(simFaultyBalData.legs[0].failReason.includes('Balance lookup failed for USDT'), 'Leg failReason specifies balance lookup failure');

  // 6. Aggregate funding validation: each leg passes individually, but combined requirement fails
  // Wallet has 30 USDT. Basket has 2 legs requiring $25 each ($50 total).
  // 25 <= 30 passes per-leg, but 50 > 30 must fail aggregate preflight!
  const mockCombinedFailClient = {
    readContract: async ({ functionName, args }) => {
      if (functionName === 'balanceOf') return 30000000000000000000n; // 30 USDT
      if (functionName === 'allowance') return 0n;
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockCombinedFailClient);

  const simCombinedFailRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 50 }, { ticker: 'MSFT', weight: 50 }],
      depositAmount: 50,
      userWalletAddress: dummyUser
    })
  }));
  const simCombinedFailData = await simCombinedFailRes.json();
  assert(simCombinedFailRes.status === 200, '/api/simulate returns HTTP 200 on aggregate funding check');
  assert(simCombinedFailData.success === false, '/api/simulate fails closed (success: false) when combined legs exceed wallet balance');
  assert(simCombinedFailData.overallStatus === 'REVERT_BLOCKED', '/api/simulate returns REVERT_BLOCKED on aggregate funding failure');
  assert(simCombinedFailData.error.includes('Insufficient USDT balance for basket'), '/api/simulate error message clearly identifies aggregate basket deficit');
  assert(simCombinedFailData.error.includes('required $50.00'), '/api/simulate error specifies required total ($50.00)');
  assert(simCombinedFailData.error.includes('available $30.00'), '/api/simulate error specifies available balance ($30.00)');
  assert(simCombinedFailData.legs.length === 2, 'Legs array returned for failed aggregate basket');
  assert(simCombinedFailData.legs[0].simulationStatus === 'SIMULATED_REVERT', 'Leg 1 marked SIMULATED_REVERT on aggregate deficit');
  assert(simCombinedFailData.legs[1].simulationStatus === 'SIMULATED_REVERT', 'Leg 2 marked SIMULATED_REVERT on aggregate deficit');

  // 7. Exact-balance basket: total required matches wallet balance exactly ($50 required, $50 available) -> succeeds
  const mockExactBalanceClient = {
    readContract: async ({ functionName, args }) => {
      if (functionName === 'balanceOf') return 50000000000000000000n; // Exactly 50 USDT
      if (functionName === 'allowance') return 0n;
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockExactBalanceClient);

  const simExactBalRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 50 }, { ticker: 'MSFT', weight: 50 }],
      depositAmount: 50,
      userWalletAddress: dummyUser
    })
  }));
  const simExactBalData = await simExactBalRes.json();
  assert(simExactBalData.success === true, '/api/simulate succeeds when wallet balance matches aggregate total exactly');
  assert(simExactBalData.overallStatus === 'APPROVAL_REQUIRED_FIRST', 'Exact balance basket correctly requests approval when allowance is zero');
  assert(simExactBalData.legs[0].simulationStatus === 'APPROVAL_REQUIRED_FIRST', 'Leg 1 approval verified on exact balance');
  assert(simExactBalData.legs[1].simulationStatus === 'APPROVAL_REQUIRED_FIRST', 'Leg 2 approval verified on exact balance');

  // 8. Skipped legs below $5 floor do not inflate required balance
  // Basket: NVDA 90% ($22.50), MSFT 10% ($2.50 < $5 floor, skipped). Wallet has 23 USDT.
  // If MSFT $2.50 was counted, 25 USDT would exceed 23 USDT balance and fail.
  const mockSkippedLegClient = {
    readContract: async ({ functionName, args }) => {
      if (functionName === 'balanceOf') return 23000000000000000000n; // 23 USDT
      if (functionName === 'allowance') return 0n;
      if (functionName === 'getAmountsOut') return [args[0], 42000000000000000n];
      return 0n;
    },
    estimateGas: async () => 45000n,
    call: async () => ({ data: '0x' })
  };
  setCustomPublicBscClient(mockSkippedLegClient);

  const simSkippedLegRes = await simulateHandler(new Request('http://localhost/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allocations: [{ ticker: 'NVDA', weight: 90 }, { ticker: 'MSFT', weight: 10 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    })
  }));
  const simSkippedLegData = await simSkippedLegRes.json();
  assert(simSkippedLegData.success === true, '/api/simulate succeeds when wallet covers only executable legs');
  const msftLeg = simSkippedLegData.legs.find(l => l.ticker === 'MSFT');
  assert(msftLeg && msftLeg.status === 'SKIPPED_BELOW_MIN_FLOOR', 'Leg below $5 floor is marked SKIPPED_BELOW_MIN_FLOOR');
  assert(msftLeg && msftLeg.simulationStatus === 'SKIPPED', 'Skipped leg simulationStatus is SKIPPED');
  const nvdaLeg = simSkippedLegData.legs.find(l => l.ticker === 'NVDA');
  assert(nvdaLeg && nvdaLeg.simulationStatus === 'APPROVAL_REQUIRED_FIRST', 'Executable leg is simulated successfully');

  // Reset custom client
  setCustomPublicBscClient(null);

  // --------------------------------------------------------------------------
  // TEST GROUP 8: Production executeBasket Orchestrator Suite
  // --------------------------------------------------------------------------
  console.log('\nTest Group 8: Production executeBasket Orchestrator Suite');

  // Test 8.1: Sufficient USDT + Zero Allowance -> approval sent first, then swap sent
  {
    const sentTransactions = [];
    let promptCount = 0;
    const mockProvider = {
      isBinance: true,
      request: async ({ method, params }) => {
        if (method === 'eth_chainId') return '0x38';
        if (method === 'eth_accounts') return [dummyUser];
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return params[0].data.startsWith('0x095ea7b3') ? '0xapproveHash1' : '0xswapHash1';
        }
        return null;
      }
    };

    let buildCount = 0;
    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => { promptCount++; return true; },
      pollReceiptFn: async () => ({ status: 'CONFIRMED' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: true,
          overallStatus: 'APPROVAL_REQUIRED_FIRST',
          legs: [{ ticker: 'NVDA', simulationStatus: 'APPROVAL_REQUIRED_FIRST', needsApproval: true }]
        }
      }),
      buildSwapApiFn: async () => {
        buildCount++;
        if (buildCount === 1) {
          return {
            ok: true,
            status: 200,
            data: {
              success: true,
              needsApproval: true,
              approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b300000000000000000000000010ed43c718714eb63d5aa57b78b54704e256024e0000000000000000000000000000000000000000000000008ac7230489e80000' },
              simulation: { status: 'SUCCESS' },
              quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
            }
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            needsApproval: false,
            swapTx: { to: BSC_PANCAKE_ROUTER, data: '0x38ed173900000000000000000000000000000000', value: '0x0' },
            simulation: { status: 'SUCCESS' },
            quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
          }
        };
      }
    });

    assert(result.success === true, 'executeBasket succeeds for zero-allowance wallet with sufficient balance');
    assert(sentTransactions.length === 2, 'Exactly 2 transactions broadcast to provider');
    assert(sentTransactions[0].data.startsWith('0x095ea7b3'), 'Transaction 1 is ERC-20 approve()');
    assert(sentTransactions[1].data.startsWith('0x38ed1739'), 'Transaction 2 is PancakeSwap swap');
    assert(sentTransactions[0].data.startsWith('0x095ea7b3') && sentTransactions[1].data.startsWith('0x38ed1739'), 'Approval strictly occurs BEFORE swap');
    assert(promptCount === 2, 'User confirmed both approval and swap dialogs');
  }

  // Test 8.2: Insufficient USDT + Zero Allowance -> Blocked at preflight before any prompt or tx
  {
    const sentTransactions = [];
    let promptCount = 0;
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xhash';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => { promptCount++; return true; },
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: false,
          overallStatus: 'REVERT_BLOCKED',
          legs: [{ ticker: 'NVDA', simulationStatus: 'SIMULATED_REVERT', failReason: 'Insufficient USDT balance for NVDA: required $10.00, available $0.00' }]
        }
      })
    });

    assert(result.success === false, 'executeBasket fails closed on insufficient USDT balance');
    assert(result.blockedAt === 'PREFLIGHT', 'Blocked at PREFLIGHT boundary');
    assert(promptCount === 0, 'ZERO user confirmation prompts triggered');
    assert(sentTransactions.length === 0, 'ZERO transactions sent to provider (swap blocked before signing)');
  }

  // Test 8.3: Balance Lookup Failure -> Blocked at preflight before any prompt or tx
  {
    const sentTransactions = [];
    let promptCount = 0;
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xhash';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => { promptCount++; return true; },
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: false,
          overallStatus: 'REVERT_BLOCKED',
          legs: [{ ticker: 'NVDA', simulationStatus: 'SIMULATED_REVERT', failReason: 'Balance lookup failed for USDT: RPC timeout' }]
        }
      })
    });

    assert(result.success === false, 'executeBasket fails closed on balance lookup error');
    assert(result.blockedAt === 'PREFLIGHT', 'Blocked at PREFLIGHT boundary');
    assert(promptCount === 0, 'ZERO user prompts triggered on balance lookup failure');
    assert(sentTransactions.length === 0, 'ZERO transactions broadcast on balance lookup failure');
  }

  // Test 8.4: Approval Receipt REVERTED -> No swap sent
  {
    const sentTransactions = [];
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xapproveHash';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      pollReceiptFn: async () => ({ status: 'REVERTED' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: { success: true, overallStatus: 'APPROVAL_REQUIRED_FIRST', legs: [] }
      }),
      buildSwapApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: true,
          needsApproval: true,
          approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b300' },
          simulation: { status: 'SUCCESS' },
          quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
        }
      })
    });

    assert(result.success === false, 'executeBasket fails closed when approval reverts on-chain');
    assert(sentTransactions.length === 1, 'Only 1 transaction was sent (the approval attempt)');
    assert(sentTransactions[0].data.startsWith('0x095ea7b3'), 'The single transaction was the approval');
    assert(!sentTransactions.some(tx => tx.data.startsWith('0x38ed1739')), 'NO eth_sendTransaction for swap occurred after approval reverted');
  }

  // Test 8.5: Approval Receipt PENDING -> No swap sent
  {
    const sentTransactions = [];
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xapproveHash';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      pollReceiptFn: async () => ({ status: 'PENDING' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: { success: true, overallStatus: 'APPROVAL_REQUIRED_FIRST', legs: [] }
      }),
      buildSwapApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: true,
          needsApproval: true,
          approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b300' },
          simulation: { status: 'SUCCESS' },
          quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
        }
      })
    });

    assert(result.success === false, 'executeBasket fails closed when approval receipt is pending/unconfirmed');
    assert(sentTransactions.length === 1, 'Only approval was broadcast');
    assert(!sentTransactions.some(tx => tx.data.startsWith('0x38ed1739')), 'NO eth_sendTransaction for swap occurred on pending approval receipt');
  }

  // Test 8.6: Post-Approval Swap Simulation Reverts -> No swap sent
  {
    const sentTransactions = [];
    let buildStep = 0;
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xapproveHash';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      pollReceiptFn: async () => ({ status: 'CONFIRMED' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: { success: true, overallStatus: 'APPROVAL_REQUIRED_FIRST', legs: [] }
      }),
      buildSwapApiFn: async () => {
        buildStep++;
        if (buildStep === 1) {
          return {
            ok: true,
            status: 200,
            data: {
              success: true,
              needsApproval: true,
              approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b300' },
              simulation: { status: 'SUCCESS' },
              quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
            }
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            needsApproval: false,
            swapTx: { to: BSC_PANCAKE_ROUTER, data: '0x38ed173900', value: '0x0' },
            simulation: { status: 'SIMULATED_REVERT', failReason: 'PancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT' },
            quote: { expectedAmountOut: '0.042', amountOutMin: '0.041', slippagePercent: '0.5' }
          }
        };
      }
    });

    assert(result.success === false, 'executeBasket fails closed when post-approval swap simulation reverts');
    assert(sentTransactions.length === 1, 'Only approval transaction was sent');
    assert(!sentTransactions.some(tx => tx.data.startsWith('0x38ed1739')), 'NO eth_sendTransaction for swap occurred when simulation reverted');
  }

  // Test 8.7: Invalid / Missing Wallet Address -> Handled cleanly
  {
    const noAddrResult = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: 10,
      userWalletAddress: null
    });
    assert(noAddrResult.success === false, 'executeBasket rejects missing wallet address');
    assert(noAddrResult.blockedAt === 'VALIDATION', 'Blocked at validation');

    const emptyAllocResult = await executeBasket({
      allocations: [],
      depositAmount: 10,
      userWalletAddress: dummyUser
    });
    assert(emptyAllocResult.success === false, 'executeBasket rejects empty allocations array');
  }

  // Test 8.8: Combined requirement exceeds wallet balance in executeBasket
  // Assert preflight fails, transactions are blocked, and zero transactions are dispatched
  {
    const sentTransactions = [];
    let promptCount = 0;
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return '0xtx';
        }
        return null;
      }
    };

    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 50 }, { ticker: 'MSFT', weight: 50 }],
      depositAmount: 50,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => { promptCount++; return true; },
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: false,
          overallStatus: 'REVERT_BLOCKED',
          error: 'Insufficient USDT balance for basket: required $50.00, available $30.00. Preflight blocked to prevent partial basket execution.',
          legs: [
            { ticker: 'NVDA', simulationStatus: 'SIMULATED_REVERT', failReason: 'Insufficient USDT balance for NVDA: required $25.00, available $30.00 (basket total: $50.00).' },
            { ticker: 'MSFT', simulationStatus: 'SIMULATED_REVERT', failReason: 'Insufficient USDT balance for MSFT: required $25.00, available $30.00 (basket total: $50.00).' }
          ]
        }
      })
    });

    assert(result.success === false, 'executeBasket fails closed on aggregate funding deficit');
    assert(result.blockedAt === 'PREFLIGHT', 'Blocked at PREFLIGHT boundary');
    assert(promptCount === 0, 'ZERO user confirmation prompts triggered on aggregate deficit');
    assert(sentTransactions.length === 0, 'ZERO transactions dispatched to provider when combined balance is insufficient');
  }

  // Test 8.9: Exact-balance basket execution succeeds through approval and swap
  {
    const sentTransactions = [];
    let promptCount = 0;
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return `0xtxHash_${sentTransactions.length}`;
        }
        return null;
      }
    };

    let buildCallCount = 0;
    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 50 }, { ticker: 'MSFT', weight: 50 }],
      depositAmount: 50,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => { promptCount++; return true; },
      pollReceiptFn: async () => ({ status: 'CONFIRMED' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: true,
          overallStatus: 'APPROVAL_REQUIRED_FIRST',
          legs: [
            { ticker: 'NVDA', simulationStatus: 'APPROVAL_REQUIRED_FIRST', needsApproval: true },
            { ticker: 'MSFT', simulationStatus: 'APPROVAL_REQUIRED_FIRST', needsApproval: true }
          ]
        }
      }),
      buildSwapApiFn: async ({ toTicker }) => {
        buildCallCount++;
        // Odd calls are pre-approval (needsApproval: true), even calls are post-approval (needsApproval: false)
        const isFreshAfterApprove = buildCallCount % 2 === 0;
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            needsApproval: !isFreshAfterApprove,
            approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b3' + toTicker },
            swapTx: { to: BSC_PANCAKE_ROUTER, data: '0x38ed1739' + toTicker, value: '0x0' },
            simulation: { status: 'SUCCESS' },
            quote: { expectedAmountOut: '0.1', amountOutMin: '0.099', slippagePercent: '0.5', quoteSource: 'PancakeSwap V2' }
          }
        };
      }
    });

    assert(result.success === true, 'executeBasket succeeds for exact-balance basket');
    assert(sentTransactions.length === 4, 'Broadcast exactly 4 transactions (2 approvals + 2 swaps)');
    assert(sentTransactions[0].data.startsWith('0x095ea7b3'), 'Leg 1 Tx 1 is approval');
    assert(sentTransactions[1].data.startsWith('0x38ed1739'), 'Leg 1 Tx 2 is swap');
    assert(sentTransactions[2].data.startsWith('0x095ea7b3'), 'Leg 2 Tx 1 is approval');
    assert(sentTransactions[3].data.startsWith('0x38ed1739'), 'Leg 2 Tx 2 is swap');
  }

  // Test 8.10: Skipped leg below $5 floor in executeBasket
  {
    const sentTransactions = [];
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_sendTransaction') {
          sentTransactions.push(params[0]);
          return `0xtxHash_${sentTransactions.length}`;
        }
        return null;
      }
    };

    let buildCount = 0;
    const result = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 90 }, { ticker: 'MSFT', weight: 10 }],
      depositAmount: 25,
      userWalletAddress: dummyUser,
      provider: mockProvider,
      confirmDialog: async () => true,
      pollReceiptFn: async () => ({ status: 'CONFIRMED' }),
      simulateApiFn: async () => ({
        ok: true,
        status: 200,
        data: {
          success: true,
          overallStatus: 'APPROVAL_REQUIRED_FIRST',
          legs: [
            { ticker: 'NVDA', simulationStatus: 'APPROVAL_REQUIRED_FIRST', needsApproval: true },
            { ticker: 'MSFT', simulationStatus: 'SKIPPED', status: 'SKIPPED_BELOW_MIN_FLOOR' }
          ]
        }
      }),
      buildSwapApiFn: async () => {
        buildCount++;
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            needsApproval: buildCount === 1,
            approveTx: { to: usdtAddr, spender: BSC_PANCAKE_ROUTER, data: '0x095ea7b3' },
            swapTx: { to: BSC_PANCAKE_ROUTER, data: '0x38ed1739', value: '0x0' },
            simulation: { status: 'SUCCESS' },
            quote: { expectedAmountOut: '0.1', amountOutMin: '0.099', slippagePercent: '0.5' }
          }
        };
      }
    });

    assert(result.success === true, 'executeBasket succeeds when below-floor leg is skipped');
    const skippedLeg = result.results.find(r => r.ticker === 'MSFT');
    assert(skippedLeg && skippedLeg.status.includes('SKIPPED'), 'MSFT leg recorded as SKIPPED');
    assert(sentTransactions.length === 2, 'Only executable leg (NVDA) broadcast transactions (approve + swap)');
  }

  // Test 8.11: Invalid deposit or allocation values rejected in executeBasket at validation
  {
    const negDepResult = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 100 }],
      depositAmount: -10,
      userWalletAddress: dummyUser
    });
    assert(negDepResult.success === false, 'executeBasket rejects negative depositAmount');
    assert(negDepResult.blockedAt === 'VALIDATION', 'Blocked at VALIDATION boundary for negative deposit');

    const negWeightResult = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: -50 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    });
    assert(negWeightResult.success === false, 'executeBasket rejects negative allocation weight');
    assert(negWeightResult.blockedAt === 'VALIDATION', 'Blocked at VALIDATION boundary for negative weight');

    const excessWeightResult = await executeBasket({
      allocations: [{ ticker: 'NVDA', weight: 80 }, { ticker: 'MSFT', weight: 80 }],
      depositAmount: 25,
      userWalletAddress: dummyUser
    });
    assert(excessWeightResult.success === false, 'executeBasket rejects excessive total weights (> 100%)');
    assert(excessWeightResult.blockedAt === 'VALIDATION', 'Blocked at VALIDATION boundary for excessive weight');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 9: Per-User Binance Agentic Wallet Connection & Multi-Tenant Isolation Suite
  // --------------------------------------------------------------------------
  console.log('\nTest Group 9: Per-User Binance Agentic Wallet Connection & Multi-Tenant Isolation Suite');
  const { GET: agenticStatusHandler } = await import('./app/api/agentic-wallet/status/route.js');
  const { GET: agenticSettingsHandler } = await import('./app/api/agentic-wallet/settings/route.js');
  const { GET: agenticBalanceHandler } = await import('./app/api/agentic-wallet/balance/route.js');
  const { POST: agenticSigninHandler } = await import('./app/api/agentic-wallet/auth/signin/route.js');
  const { GET: agenticPairStatusHandler } = await import('./app/api/agentic-wallet/auth/status/route.js');
  const { POST: agenticConfirmHandler } = await import('./app/api/agentic-wallet/auth/confirm-agent/route.js');
  const { POST: agenticSignoutHandler } = await import('./app/api/agentic-wallet/auth/signout/route.js');
  const { POST: agenticExecuteHandler } = await import('./app/api/agentic-wallet/execute-basket/route.js');
  const { BAW_COOKIE_NAME, buildSessionCookieHeader } = await import('./services/userBawSessionManager.js');
  const { saveSession, loadSession, deleteSession, clearAllSessions } = await import('./services/bawSessionStore.js');

  await clearAllSessions();

  // Helper to extract session ID from Set-Cookie header
  function extractSidFromCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`${BAW_COOKIE_NAME}=([a-zA-Z0-9_-]+)`));
    return match ? match[1] : null;
  }

  // 9.1: Unconnected visitor status (no session or unauthenticated)
  {
    const req = new Request('http://localhost/api/agentic-wallet/status');
    const res = await agenticStatusHandler(req);
    const data = await res.json();
    assert(data.success === true, '/api/agentic-wallet/status returns success: true');
    assert(data.data.connected === false, 'Unconnected visitor reports connected: false');
    assert(data.data.status === 'UNCONNECTED', 'Unconnected visitor reports status: UNCONNECTED');
    assert(data.data.address === null, 'Unconnected visitor never sees a shared server address');
    assert(data.data.quota === null, 'Unconnected visitor has null quota');
  }

  // 9.2: Removal of fabricated pairing success — fail closed on unreachable Binance Gateway
  {
    const req = new Request('http://localhost/api/agentic-wallet/auth/signin', { method: 'POST' });
    const res = await agenticSigninHandler(req);
    const data = await res.json();
    assert(res.status === 503 || res.status === 502, '/api/agentic-wallet/auth/signin returns 503/502 when gateway is unreachable');
    assert(data.success === false, 'Signin fails closed (success: false) when Binance is unreachable');
    assert(data.code === 'BINANCE_SERVICE_UNAVAILABLE', 'Signin reports BINANCE_SERVICE_UNAVAILABLE');
    assert(!data.data?.qrSvg, 'Signin never returns QR SVG on gateway failure');
    assert(!data.data?.urlForWeb, 'Signin never returns fabricated synthetic QR URL');
  }

  // 9.3: Cookie as sole credential & No sessionId in JSON body
  {
    const req = new Request('http://localhost/api/agentic-wallet/auth/signin', { method: 'POST' });
    const res = await agenticSigninHandler(req);
    const data = await res.json();
    assert(data.sessionId === undefined, 'Signin never exposes raw sessionId in JSON response body');

    // Attempting to supply session ID via header is ignored
    const spoofReq = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'x-baw-session-id': 'spoofed-attacker-session-id' }
    });
    const spoofRes = await agenticStatusHandler(spoofReq);
    const spoofData = await spoofRes.json();
    assert(spoofData.data.connected === false, 'Header-supplied x-baw-session-id is ignored; cookie is sole credential');
  }

  // 9.4: CSRF origin validation on state-changing POST routes
  {
    const csrfReq = new Request('http://localhost/api/agentic-wallet/auth/confirm-agent', {
      method: 'POST',
      headers: {
        'Origin': 'https://evil-hacker.com',
        'Host': 'localhost'
      },
      body: JSON.stringify({ qrCodeId: 'test-qr' })
    });
    const csrfRes = await agenticConfirmHandler(csrfReq);
    const csrfData = await csrfRes.json();
    assert(csrfRes.status === 403, 'Cross-origin POST request rejected with HTTP 403');
    assert(csrfData.code === 'CSRF_REJECTED', 'Blocked with CSRF_REJECTED error code');
  }

  // 9.5: Unverified confirmation rejected (caller cannot fabricate authorization)
  {
    // Calling confirm without cookie
    const noCookieReq = new Request('http://localhost/api/agentic-wallet/auth/confirm-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeId: 'test-qr' })
    });
    const noCookieRes = await agenticConfirmHandler(noCookieReq);
    assert(noCookieRes.status === 401, 'Confirm without cookie rejected with HTTP 401');

    // Create an unverified session in store
    const unverifiedSid = 'unverified-session-1';
    await saveSession(unverifiedSid, {
      sessionId: unverifiedSid,
      status: 'WAITING_FOR_SCAN',
      appConfirmed: false,
      walletAddress: null,
      qrCodeId: 'genuine-qr-code-id-1',
      dailyLimit: 50000.0,
      quotaLeft: 50000.0,
      createdAt: Date.now(),
      lastActive: Date.now(),
      expiresAt: Date.now() + 3600000
    });

    // Mismatched qrCodeId
    const mismatchReq = new Request('http://localhost/api/agentic-wallet/auth/confirm-agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${unverifiedSid}`
      },
      body: JSON.stringify({ qrCodeId: 'wrong-qr-id' })
    });
    const mismatchRes = await agenticConfirmHandler(mismatchReq);
    assert(mismatchRes.status === 400, 'Confirm with mismatched qrCodeId rejected with HTTP 400');

    // Unverified on mobile app
    const unverifiedReq = new Request('http://localhost/api/agentic-wallet/auth/confirm-agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${unverifiedSid}`
      },
      body: JSON.stringify({ qrCodeId: 'genuine-qr-code-id-1' })
    });
    const unverifiedRes = await agenticConfirmHandler(unverifiedReq);
    assert(unverifiedRes.status === 403, 'Unverified session rejected with HTTP 403');
    const unverifiedData = await unverifiedRes.json();
    assert(unverifiedData.code === 'UNVERIFIED_AUTHORIZATION', 'Rejected with UNVERIFIED_AUTHORIZATION');
  }

  // 9.6: Genuine verified confirmation rotates session ID and persists CONNECTED
  let userASessionIdRotated = null;
  const mockUserAAddress = '0x1111111111111111111111111111111111111111';
  const initialUserASid = 'verified-session-a-initial';
  const userAQrCodeId = 'binance-verified-qr-user-a';
  {
    // Populate session A with verified Binance mobile pairing confirmation
    await saveSession(initialUserASid, {
      sessionId: initialUserASid,
      status: 'APP_CONFIRMED',
      appConfirmed: true,
      walletAddress: mockUserAAddress,
      binanceChainId: '56',
      qrCodeId: userAQrCodeId,
      pairingCode: 'abc123',
      dailyLimit: 50000.0,
      quotaLeft: 50000.0,
      quotaUsed: 0.0,
      createdAt: Date.now(),
      lastActive: Date.now(),
      expireAt: Date.now() + 300000,
      expiresAt: Date.now() + 3600000
    });

    const confirmReq = new Request('http://localhost/api/agentic-wallet/auth/confirm-agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${initialUserASid}`
      },
      body: JSON.stringify({ qrCodeId: userAQrCodeId })
    });
    const confirmRes = await agenticConfirmHandler(confirmReq);
    const confirmData = await confirmRes.json();
    assert(confirmRes.status === 200, 'Verified confirmation returns HTTP 200');
    assert(confirmData.success === true, 'Confirmation returns success: true');
    assert(confirmData.data.status === 'CONNECTED', 'Status marked CONNECTED');
    assert(confirmData.data.walletAddress === mockUserAAddress, 'Wallet address matches Binance MPC address');

    const rotatedCookieHeader = confirmRes.headers.get('set-cookie');
    assert(Boolean(rotatedCookieHeader && rotatedCookieHeader.includes(`${BAW_COOKIE_NAME}=`)), 'Sets rotated session cookie');
    userASessionIdRotated = extractSidFromCookie(rotatedCookieHeader);
    assert(Boolean(userASessionIdRotated), 'Rotated session ID extracted');
    assert(userASessionIdRotated !== initialUserASid, 'Session ID was rotated upon confirmation (prevents session fixation)');
  }

  // 9.7: Session Fixation Defense — Pre-rotation session is strictly revoked
  {
    const oldSessionReq = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${initialUserASid}` }
    });
    const oldSessionRes = await agenticStatusHandler(oldSessionReq);
    const oldSessionData = await oldSessionRes.json();
    assert(oldSessionData.data.connected === false, 'Pre-rotation session ID is completely revoked');
    assert(oldSessionData.data.address === null, 'Pre-rotation session cannot access wallet address');

    const newSessionReq = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}` }
    });
    const newSessionRes = await agenticStatusHandler(newSessionReq);
    const newSessionData = await newSessionRes.json();
    assert(newSessionData.data.connected === true, 'Rotated session is active and connected: true');
    assert(newSessionData.data.address === mockUserAAddress, 'Rotated session retrieves MPC address');
  }

  // 9.8: Multi-Tenant Isolation — User B cannot see, execute, or disconnect User A
  {
    const userBSessionId = 'user-b-distinct-session';
    await saveSession(userBSessionId, {
      sessionId: userBSessionId,
      status: 'UNCONNECTED',
      appConfirmed: false,
      walletAddress: null,
      dailyLimit: 50000.0,
      quotaLeft: 50000.0,
      createdAt: Date.now(),
      lastActive: Date.now(),
      expiresAt: Date.now() + 3600000
    });

    // User B status
    const reqB = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userBSessionId}` }
    });
    const resB = await agenticStatusHandler(reqB);
    const dataB = await resB.json();
    assert(dataB.data.connected === false, 'User B reports connected: false while User A is connected');
    assert(dataB.data.address === null, 'User B never sees User A address');

    // User B execution attempt
    const execReqB = new Request('http://localhost/api/agentic-wallet/execute-basket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${userBSessionId}`
      },
      body: JSON.stringify({
        prompt: 'Attack Basket',
        investmentAmount: 10,
        allocations: [{ ticker: 'NVDA', weight: 100 }]
      })
    });
    const execResB = await agenticExecuteHandler(execReqB);
    const execDataB = await execResB.json();
    assert(execResB.status === 400 || execResB.status === 401, 'User B execution attempt blocked');
    assert(execDataB.code === 'WALLET_NOT_CONNECTED', 'User B blocked with WALLET_NOT_CONNECTED');

    // User B signout does NOT affect User A
    const signoutB = new Request('http://localhost/api/agentic-wallet/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userBSessionId}` }
    });
    await agenticSignoutHandler(signoutB);

    // Verify User A remains connected
    const checkA = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}` }
    });
    const resCheckA = await agenticStatusHandler(checkA);
    const dataCheckA = await resCheckA.json();
    assert(dataCheckA.data.connected === true, 'User A remains connected after User B signout');
    assert(dataCheckA.data.address === mockUserAAddress, 'User A address unchanged');
  }

  // 9.9: Autonomous Execution Guardrails & App-level Boundaries
  {
    const settingsReq = new Request('http://localhost/api/agentic-wallet/settings', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}` }
    });
    const settingsRes = await agenticSettingsHandler(settingsReq);
    const settingsData = await settingsRes.json();
    assert(settingsData.success === true, 'Settings query returns success: true');
    assert(settingsData.data.dailyLimit === 50000.0, 'Daily spend limit is $50,000 USDT');
    assert(settingsData.data.abnormalTxnHandling === 'AutoReject', 'Abnormal Tx policy is AutoReject');
    assert(settingsData.data.slippage === 0.5, 'Slippage is bounded to 0.5% max');

    // Over-quota execution ($50,001 USDT)
    const overQuotaReq = new Request('http://localhost/api/agentic-wallet/execute-basket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}`
      },
      body: JSON.stringify({
        prompt: 'Whale allocation',
        investmentAmount: 50001,
        allocations: [{ ticker: 'NVDA', weight: 100 }]
      })
    });
    const overQuotaRes = await agenticExecuteHandler(overQuotaReq);
    const overQuotaData = await overQuotaRes.json();
    assert(overQuotaRes.status === 400, 'Over-quota execution rejected with HTTP 400');
    assert(overQuotaData.code === 'GUARDRAIL_VIOLATION_QUOTA', 'Blocked with GUARDRAIL_VIOLATION_QUOTA');

    // Empty allocations
    const emptyAllocReq = new Request('http://localhost/api/agentic-wallet/execute-basket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}`
      },
      body: JSON.stringify({
        prompt: 'Empty basket',
        investmentAmount: 10,
        allocations: []
      })
    });
    const emptyAllocRes = await agenticExecuteHandler(emptyAllocReq);
    const emptyAllocData = await emptyAllocRes.json();
    assert(emptyAllocRes.status === 400, 'Empty allocations rejected with HTTP 400');
    assert(emptyAllocData.code === 'INVALID_PARAMETERS', 'Blocked with INVALID_PARAMETERS');

    // Fail closed on unconfigured execution daemon without broadcast
    const execReq = new Request('http://localhost/api/agentic-wallet/execute-basket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}`
      },
      body: JSON.stringify({
        prompt: 'Tech Basket',
        investmentAmount: 20,
        allocations: [{ ticker: 'NVDA', weight: 100 }],
        chainId: 56
      })
    });
    const execRes = await agenticExecuteHandler(execReq);
    const execData = await execRes.json();
    assert(execRes.status === 503 || execRes.status === 400, 'Execution without daemon fails closed with non-2xx');
    assert(execData.success === false, 'Execution reports success: false without real broadcast');
    assert(execData.code === 'AUTONOMOUS_EXECUTION_BLOCKED' || execData.code === 'EXECUTION_ENVIRONMENT_UNAVAILABLE' || execData.code === 'UNSUPPORTED_NETWORK', 'Clear failure code returned');
  }

  // 9.10: Production-Safe Durable Encrypted Store (AES-256-GCM)
  {
    const loadedSession = await loadSession(userASessionIdRotated);
    assert(loadedSession !== null, 'Session loaded successfully from durable store');
    assert(loadedSession.status === 'CONNECTED', 'Loaded session preserves CONNECTED status');
    assert(loadedSession.walletAddress === mockUserAAddress, 'Loaded session preserves wallet address');
    assert(loadedSession.privateKey === undefined, 'Plaintext private keys are never stored');
    assert(loadedSession.seedPhrase === undefined, 'Seed phrases are never stored');
  }

  // 9.11: Disconnect & Signout Lifecycle
  {
    const signoutReq = new Request('http://localhost/api/agentic-wallet/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}` }
    });
    const signoutRes = await agenticSignoutHandler(signoutReq);
    const signoutData = await signoutRes.json();
    assert(signoutData.success === true, 'Signout returns success: true');

    const expiredCookie = signoutRes.headers.get('set-cookie');
    assert(Boolean(expiredCookie && expiredCookie.includes('Max-Age=0')), 'Signout clears cookie with Max-Age=0');

    // Durable store session is deleted
    const sessionPostSignout = await loadSession(userASessionIdRotated);
    assert(sessionPostSignout === null, 'Session deleted from durable encrypted store upon signout');

    // Subsequent status check is UNCONNECTED
    const postSignoutReq = new Request('http://localhost/api/agentic-wallet/status', {
      headers: { 'Cookie': `${BAW_COOKIE_NAME}=${userASessionIdRotated}` }
    });
    const postSignoutRes = await agenticStatusHandler(postSignoutReq);
    const postSignoutData = await postSignoutRes.json();
    assert(postSignoutData.data.connected === false, 'After signout, user reports connected: false');
    assert(postSignoutData.data.status === 'UNCONNECTED', 'After signout, user reports status: UNCONNECTED');
    assert(postSignoutData.data.address === null, 'After signout, address is null');
  }
}

// ============================================================================
// PART 2: LIVE BSC MAINNET SMOKE TEST SUITE (Network-Dependent & Honest)
// ============================================================================
async function runLiveSmokeTests() {
  console.log('\n===============================================================');
  console.log('   OmniBasket AI — Live BSC Mainnet Smoke Test Suite           ');
  console.log('===============================================================\n');

  // Probe live BSC RPC reachability first
  const client = getPublicBscClient();
  let liveRpcReachable = false;
  let latestBlock = null;

  try {
    latestBlock = await Promise.race([
      client.getBlockNumber(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('RPC probe timed out after 3500ms')), 3500))
    ]);
    liveRpcReachable = true;
    console.log(`[Live BSC RPC] Connected successfully to BSC Mainnet #56 (Block: ${latestBlock.toString()})\n`);
  } catch (probeErr) {
    console.log(`⚠️  [Live BSC RPC] RPC probe failed: ${probeErr.message}`);
    console.log('   Live mainnet smoke tests will be SKIPPED as infra/network unavailable.');
    console.log('   (This is an external network condition, not an application code regression.)\n');
  }

  if (!liveRpcReachable) {
    skip('[Live BSC Smoke] PancakeSwap V2 live quote for NVDA', 'BSC RPC unavailable');
    skip('[Live BSC Smoke] Unroutable asset rejection for USDY', 'BSC RPC unavailable');
    skip('[Live BSC Smoke] Approval calldata dry-run on live BSC state', 'BSC RPC unavailable');
    skip('[Live BSC Smoke] Swap simulation revert detection on live BSC state', 'BSC RPC unavailable');
    skip('[Live BSC Smoke] /api/simulate live check on BSC Mainnet', 'BSC RPC unavailable');
    return;
  }

  const dummyUser = '0xB635a5eAe16695910C75be147f7676b546441d72';
  const usdtAddr = BSC_RWA_TOKENS.USDT.contractAddress;
  const nvdaAddr = BSC_RWA_TOKENS.NVDA.contractAddress;
  const exactAmountWei = 10000000000000000000n; // 10 USDT

  // 1. Live PancakeSwap V2 quote for NVDA
  try {
    const quote = await getBscSwapQuote({
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      maxSlippageBps: 50
    });
    assert(quote.expectedAmountOutWei > 0n, `[Live BSC Smoke] Live quote positive expected output: ${quote.expectedAmountOutWei.toString()} wei`);
    assert(quote.amountOutMinWei > 0n, `[Live BSC Smoke] Live quote positive minimum output: ${quote.amountOutMinWei.toString()} wei`);
    assert(quote.amountOutMinWei < quote.expectedAmountOutWei, '[Live BSC Smoke] amountOutMinWei strictly less than expectedAmountOutWei');
    assert(quote.slippageBps <= 50, `[Live BSC Smoke] Slippage bounded to 50 bps (0.5%): current = ${quote.slippageBps}`);
  } catch (err) {
    console.error('Live quote error:', err.message);
    failed++;
  }

  // 2. Live unroutable asset rejection for USDY
  try {
    const unroutableQuote = await getBscSwapQuote({
      fromTokenAddress: usdtAddr,
      toTokenAddress: BSC_RWA_TOKENS.USDY.contractAddress,
      amountInWei: exactAmountWei,
      maxSlippageBps: 50
    });
    assert(unroutableQuote.success === false, '[Live BSC Smoke] Live quote returns success: false for unroutable token (USDY)');
  } catch (err) {
    console.error('Live unroutable quote error:', err.message);
    failed++;
  }

  // 3. Live approval simulation dry-run on BSC
  try {
    const approveTx = buildApproveCalldata({
      tokenAddress: usdtAddr,
      spenderAddress: BSC_PANCAKE_ROUTER,
      amountWei: exactAmountWei
    });
    const simApprove = await simulateBscTransaction({
      from: dummyUser,
      to: approveTx.to,
      data: approveTx.data,
      value: approveTx.value
    });
    assert(simApprove.status === 'SUCCESS', `[Live BSC Smoke] Live approval simulation dry-run status: ${simApprove.status}`);
  } catch (err) {
    console.error('Live approval sim error:', err.message);
    failed++;
  }

  // 4. Live swap simulation revert detection on BSC
  try {
    const swapTx = buildSwapCalldata({
      fromAddress: dummyUser,
      fromTokenAddress: usdtAddr,
      toTokenAddress: nvdaAddr,
      amountInWei: exactAmountWei,
      amountOutMinWei: 42000000000000000n,
      routerAddress: BSC_PANCAKE_ROUTER
    });
    const simSwap = await simulateBscTransaction({
      from: dummyUser,
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value
    });
    assert(simSwap.status === 'SIMULATED_REVERT', `[Live BSC Smoke] Live swap dry-run without allowance detected on-chain revert: ${simSwap.status}`);
    assert(Boolean(simSwap.failReason), `[Live BSC Smoke] Captured revert reason: ${simSwap.failReason}`);
  } catch (err) {
    console.error('Live swap sim error:', err.message);
    failed++;
  }

  // 5. Live /api/simulate balance and allowance evaluation on BSC
  try {
    const { POST: simulateHandler } = await import('./app/api/simulate/route.js');
    const liveSimRes = await simulateHandler(new Request('http://localhost/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocations: [{ ticker: 'NVDA', weight: 60 }, { ticker: 'MSFT', weight: 40 }],
        depositAmount: 50,
        userWalletAddress: dummyUser
      })
    }));
    const liveSimData = await liveSimRes.json();
    assert(liveSimRes.status === 200, '[Live BSC Smoke] /api/simulate returns HTTP 200 on live BSC state');
    // On live BSC Mainnet, dummyUser has 0 USDT balance, so it must fail closed with REVERT_BLOCKED
    assert(liveSimData.overallStatus === 'REVERT_BLOCKED', `[Live BSC Smoke] Zero-USDT wallet correctly blocked on live BSC: ${liveSimData.overallStatus}`);
    assert(liveSimData.legs[0].failReason.includes('Insufficient USDT balance'), `[Live BSC Smoke] Leg failReason correctly identifies insufficient USDT on BSC`);
  } catch (err) {
    console.error('Live /api/simulate error:', err.message);
    failed++;
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function run() {
  const args = process.argv.slice(2);
  const onlyUnit = args.includes('--unit');
  const onlySmoke = args.includes('--smoke');

  if (!onlySmoke) {
    await runOfflineUnitTests();
  }

  if (!onlyUnit) {
    await runLiveSmokeTests();
  }

  console.log('\n===============================================================');
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed, ${skipped} Skipped`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});
