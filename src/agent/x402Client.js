import { execFile } from 'child_process';
import util from 'util';

const execFilePromise = util.promisify(execFile);

/**
 * Autonomous x402 Micropayment Client
 * Consumes HTTP 402 paywalled endpoints, previews with `baw`, signs, and replays
 */
export async function fetchWithX402Payment(targetUrl, options = {}) {
  const trace = {
    targetUrl,
    startedAt: new Date().toISOString(),
    steps: []
  };

  const isExplicitDemo = options.isDemo === true || process.env.ALLOW_DEMO_SIGNATURES === 'true';

  // Step 1: Initial Request (Expect HTTP 402)
  trace.steps.push({ step: 1, name: 'INITIAL_REQUEST', status: 'DISPATCHING' });
  const initialRes = await fetch(targetUrl);

  if (initialRes.status !== 402) {
    trace.steps[0].status = 'COMPLETED_NO_PAYWALL';
    const data = await initialRes.json();
    return { success: true, status: initialRes.status, data, trace };
  }

  trace.steps[0].status = 'CHALLENGE_RECEIVED_402';
  const paymentRequiredHeader = initialRes.headers.get('payment-required');
  const initialBody = await initialRes.json();

  trace.steps.push({
    step: 2,
    name: 'PARSE_PAYMENT_REQUIREMENTS',
    status: 'PARSED',
    payload: initialBody
  });

  // Explicitly verify payment network is strictly BNB Smart Chain (eip155:56)
  const isBsc = initialBody.accepts?.some(a => a.network === 'eip155:56');
  if (!isBsc) {
    throw new Error('x402 payment requirements must specify BNB Smart Chain (eip155:56).');
  }

  // Step 2: Use Binance Agentic Wallet (`baw`) to preview payment options
  const reqStr = JSON.stringify(initialBody);

  let previewResult = null;
  try {
    const { stdout } = await execFilePromise('baw', [
      'x402-payment', 'preview',
      '--paymentRequirements', reqStr,
      '--json'
    ]);
    previewResult = JSON.parse(stdout);
  } catch (err) {
    if (err.stdout) {
      try {
        previewResult = JSON.parse(err.stdout);
      } catch (_) {}
    }
  }

  trace.steps.push({
    step: 3,
    name: 'BAW_PAYMENT_PREVIEW',
    status: previewResult?.success ? 'PREVIEW_SUCCESS' : 'PREVIEW_EVALUATED',
    data: previewResult?.data || previewResult
  });

  let paymentId = previewResult?.data?.paymentId;
  if (!paymentId) {
    if (isExplicitDemo) {
      paymentId = '721677d8-3e8d-460d-b58e-fea3540d16bd';
    } else {
      throw new Error(`baw x402-payment preview failed to generate paymentId on BSC: ${previewResult?.error?.message || 'Missing paymentId in CLI preview'}`);
    }
  }

  let paymentHeaderName = 'PAYMENT-SIGNATURE';
  let paymentHeaderValue = '';

  // Step 3: Attempt Sign via `baw` or require explicit demo mode for fallback
  try {
    const { stdout } = await execFilePromise('baw', [
      'x402-payment', 'sign',
      '--paymentId', paymentId,
      '--selectedIndex', '1',
      '--json'
    ]);
    const signResult = JSON.parse(stdout);
    if (signResult.success && signResult.data?.paymentHeaderValue) {
      paymentHeaderName = signResult.data.paymentHeaderName;
      paymentHeaderValue = signResult.data.paymentHeaderValue;
    }
  } catch (err) {
    if (!isExplicitDemo) {
      throw new Error(`Production x402 signing failed via baw on BSC: ${err.message || 'Signature authorization rejected'}`);
    }

    // Sandbox / demonstration fallback only: formulate clearly tagged demonstration signature with full schema
    const cleanPaymentId = (paymentId || '721677d83e8d460db58efea3540d16bd').replace(/-/g, '');
    const simSigPayload = {
      x402Version: 2,
      paymentId,
      network: 'eip155:56',
      asset: '0x55d398326f99059fF775485246999027B3197955',
      token: '0x55d398326f99059fF775485246999027B3197955',
      amount: '10000000000000000',
      payTo: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
      from: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
      signedBy: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      validAfter: Math.floor(Date.now() / 1000) - 60,
      nonce: `0x${cleanPaymentId.padEnd(64, '0').slice(0, 64)}`,
      timestamp: Date.now(),
      demoMode: true
    };
    paymentHeaderValue = Buffer.from(JSON.stringify(simSigPayload)).toString('base64');
  }

  trace.steps.push({
    step: 4,
    name: 'GENERATE_PAYMENT_SIGNATURE',
    status: 'SIGNATURE_READY',
    headerName: paymentHeaderName,
    headerValueSnippet: paymentHeaderValue.slice(0, 32) + '...'
  });

  // Step 4: Replay Request with Signed Payment Header
  trace.steps.push({ step: 5, name: 'REPLAY_WITH_PAYMENT_HEADER', status: 'DISPATCHING' });
  const replayRes = await fetch(targetUrl, {
    headers: {
      [paymentHeaderName]: paymentHeaderValue,
      'Content-Type': 'application/json'
    }
  });

  const unlockedData = await replayRes.json();
  trace.steps[4].status = replayRes.status === 200 ? 'SUCCESS_UNLOCKED' : 'FAILED';

  return {
    success: replayRes.status === 200,
    status: replayRes.status,
    data: unlockedData,
    trace
  };
}
