import { pollExtensionReceipt } from '../lib/wallet/provider.js';

/**
 * Production basket execution orchestrator.
 *
 * Runs the complete fail-closed execution pipeline:
 * 1. Step 1: Preflight whole-basket simulation check (/api/simulate)
 *    - Validates userWalletAddress, assets, liquidity routes, balances, and allowances.
 *    - Fails closed if preflight reverts or fails (e.g., REVERT_BLOCKED, insufficient balance, unroutable asset).
 * 2. Step 2: Sequential per-leg execution:
 *    - Skips allocations below $5.00 minimum order floor.
 *    - Calls /api/swap/build to get fresh quote and calldata.
 *    - Sequential approval flow if allowance is required:
 *      - Strictly verifies approval simulation status === 'SUCCESS'.
 *      - Requests user approval confirmation.
 *      - Dispatches approval transaction via provider / sendTransaction.
 *      - Polls receipt and strictly verifies status === 'CONFIRMED' (fails closed on REVERTED or PENDING).
 *      - Re-calls /api/swap/build to obtain fresh quote and re-simulate swap with confirmed on-chain allowance.
 *    - Strictly verifies swap simulation status === 'SUCCESS'.
 *    - Requests user swap confirmation.
 *    - Dispatches swap transaction via provider / sendTransaction.
 *    - Polls receipt and strictly verifies status === 'CONFIRMED'.
 *
 * @param {Object} options
 * @param {Array} options.allocations - Array of { ticker, weight, name }
 * @param {number} options.depositAmount - Total deposit in USD/USDT
 * @param {string} options.userWalletAddress - Connected wallet address on BSC
 * @param {Object} [options.provider] - EIP-1193 provider instance
 * @param {Function} [options.onNotice] - Progress notification callback
 * @param {Function} [options.confirmDialog] - Confirmation prompt callback (default: globalThis.confirm)
 * @param {Function} [options.sendTransactionFn] - Transaction dispatcher
 * @param {Function} [options.pollReceiptFn] - Receipt polling function
 * @param {Function} [options.simulateApiFn] - API caller for /api/simulate
 * @param {Function} [options.buildSwapApiFn] - API caller for /api/swap/build
 */
export async function executeBasket({
  allocations,
  depositAmount,
  userWalletAddress,
  provider,
  onNotice = () => {},
  confirmDialog = (msg) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(msg) : true),
  sendTransactionFn,
  pollReceiptFn = pollExtensionReceipt,
  simulateApiFn,
  buildSwapApiFn
}) {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return {
      success: false,
      summary: 'Invalid allocations array.',
      blockedAt: 'VALIDATION',
      results: []
    };
  }

  if (!userWalletAddress) {
    return {
      success: false,
      summary: 'Connected wallet address is required.',
      blockedAt: 'VALIDATION',
      results: []
    };
  }

  const defaultSendTx = async ({ to, data, value = '0x0' }) => {
    if (!provider || typeof provider.request !== 'function') {
      throw new Error('No valid injected provider available to broadcast transaction.');
    }
    return await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: userWalletAddress, to, data, value }]
    });
  };

  const sendTx = sendTransactionFn || defaultSendTx;

  const callSimulate = simulateApiFn || (async (payload) => {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  });

  const callBuildSwap = buildSwapApiFn || (async (payload) => {
    const res = await fetch('/api/swap/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  });

  // --------------------------------------------------------------------------
  // Step 1: Pre-Transaction Validation Guardrail across all legs
  // --------------------------------------------------------------------------
  onNotice('Running Pre-Transaction EVM Simulation across all basket legs on BSC...');
  const simResponse = await callSimulate({
    allocations,
    depositAmount,
    userWalletAddress
  });

  if (!simResponse.ok || !simResponse.data.success || simResponse.data.overallStatus === 'REVERT_BLOCKED') {
    const revertLeg = simResponse.data.legs?.find(l => l.simulationStatus === 'SIMULATED_REVERT');
    const failMsg = revertLeg 
      ? `Simulation reverted on leg ${revertLeg.ticker}: ${revertLeg.failReason || 'Revert'}`
      : (simResponse.data.error || 'Pre-transaction simulation guardrail blocked execution.');

    return {
      success: false,
      blockedAt: 'PREFLIGHT',
      summary: `Execution blocked by Pre-Transaction Simulation Guardrail: ${failMsg}`,
      results: [],
      error: failMsg,
      preflightResponse: simResponse.data
    };
  }

  // --------------------------------------------------------------------------
  // Step 2: Sequentially execute each leg
  // --------------------------------------------------------------------------
  const results = [];

  for (const alloc of allocations) {
    const legUsd = (depositAmount * alloc.weight) / 100;
    if (legUsd < 5) {
      results.push({
        ticker: alloc.ticker,
        name: alloc.name || alloc.ticker,
        status: 'SKIPPED (< $5.00 min)',
        success: false,
        error: 'Below $5.00 minimum floor'
      });
      continue;
    }

    try {
      // Build calldata and obtain fresh on-chain quote
      const buildResponse = await callBuildSwap({
        userWalletAddress,
        fromTicker: 'USDT',
        toTicker: alloc.ticker,
        fromAmount: legUsd,
        slippagePercent: '0.5'
      });

      let buildData = buildResponse.data;
      if (!buildData?.success) {
        throw new Error(buildData?.error || `Failed to build calldata for ${alloc.ticker}`);
      }

      // Sequential approval flow if allowance is required
      if (buildData.needsApproval && buildData.approveTx) {
        if (buildData.simulation?.status !== 'SUCCESS') {
          throw new Error(`Approval simulation failed for ${alloc.ticker}: ${buildData.simulation?.failReason || 'Revert'}`);
        }

        const approveConfirm = await confirmDialog(`Approve token allowance for basket leg ${alloc.ticker}?\n\n• Token: USDT\n• Spender: ${buildData.approveTx.spender} (PancakeSwap Router)\n• Allowance: $${legUsd} USDT (Exact Order Amount, Non-Unlimited)\n• Pre-Simulation: SUCCESS (Verified against current BSC chain state)\n\nApprove in your Binance Web3 Wallet?`);
        if (!approveConfirm) {
          throw new Error(`Approval for ${alloc.ticker} cancelled by user.`);
        }

        onNotice(`Approving $${legUsd} USDT for ${alloc.ticker}...`);
        const approveHash = await sendTx({
          to: buildData.approveTx.to,
          data: buildData.approveTx.data,
          value: '0x0'
        });

        onNotice(`Confirming token approval on BSC...`);
        const approveReceipt = await pollReceiptFn(provider, approveHash);
        if (approveReceipt?.status !== 'CONFIRMED') {
          throw new Error(`Token approval for ${alloc.ticker} was not confirmed on-chain (status: ${approveReceipt?.status || 'UNKNOWN'}). Execution blocked.`);
        }

        // Re-fetch build to re-quote and re-simulate swap with active on-chain allowance
        onNotice(`Re-simulating swap for ${alloc.ticker}...`);
        const freshBuildResponse = await callBuildSwap({
          userWalletAddress,
          fromTicker: 'USDT',
          toTicker: alloc.ticker,
          fromAmount: legUsd,
          slippagePercent: '0.5'
        });
        buildData = freshBuildResponse.data;
        if (!buildData?.success) {
          throw new Error(`Re-simulation failed for ${alloc.ticker}: ${buildData?.error || 'Failed build'}`);
        }
      }

      // Strict pre-transaction simulation check: must be SUCCESS
      if (buildData.simulation?.status !== 'SUCCESS') {
        throw new Error(`Simulation failed for ${alloc.ticker}: ${buildData.simulation?.status} (${buildData.simulation?.failReason || 'Revert'}). Execution aborted to prevent capital loss.`);
      }

      const quote = buildData.quote;
      const legConfirm = await confirmDialog(`Broadcast swap for ${alloc.ticker}?\n\n• Input: $${legUsd} USDT\n• Expected Output: ${quote?.expectedAmountOut} ${alloc.ticker}\n• Minimum Guaranteed: ${quote?.amountOutMin} ${alloc.ticker} (Slippage: max ${quote?.slippagePercent}%)\n• Source: ${quote?.quoteSource}\n• Pre-Simulation: SUCCESS (Verified against current BSC chain state)\n\nNote: Simulation reflects current chain state. Prices and pool reserves may fluctuate before block inclusion.\n\nSign in your Binance Web3 Wallet?`);
      if (!legConfirm) {
        throw new Error(`Swap for ${alloc.ticker} cancelled by user.`);
      }

      // Broadcast swap
      onNotice(`Signing swap for ${alloc.ticker}...`);
      const swapHash = await sendTx({
        to: buildData.swapTx.to,
        data: buildData.swapTx.data,
        value: buildData.swapTx.value || '0x0'
      });

      // Poll receipt
      onNotice(`Confirming ${alloc.ticker} on BSC...`);
      const legReceipt = await pollReceiptFn(provider, swapHash);
      const isConfirmed = legReceipt?.status === 'CONFIRMED';
      if (!isConfirmed) {
        throw new Error(`Swap transaction for ${alloc.ticker} was not confirmed on-chain (status: ${legReceipt?.status || 'UNKNOWN'}).`);
      }

      results.push({
        ticker: alloc.ticker,
        name: alloc.name || alloc.ticker,
        status: 'CONFIRMED',
        success: true,
        txHash: swapHash,
        bscScanUrl: `https://bscscan.com/tx/${swapHash}`,
        expectedAmountOut: quote?.expectedAmountOut,
        amountOutMin: quote?.amountOutMin
      });
    } catch (err) {
      results.push({
        ticker: alloc.ticker,
        name: alloc.name || alloc.ticker,
        status: 'FAILED',
        success: false,
        error: err.message
      });
    }
  }

  const confirmedCount = results.filter(r => r.success).length;
  const allSuccess = confirmedCount > 0 && confirmedCount === results.filter(r => r.status !== 'SKIPPED (< $5.00 min)').length;

  return {
    success: allSuccess,
    summary: `Executed ${confirmedCount}/${results.length} legs via Binance Web3 Wallet on BSC Mainnet.`,
    results
  };
}
