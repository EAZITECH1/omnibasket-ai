export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { startBawSignin, verifyBawSignin } from '../../../../services/bawSession.js';

export async function POST(req) {
  const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';
  if (!isAgenticEnabled) {
    return Response.json({
      success: false,
      error: 'Shared Agentic Wallet pairing is disabled in public mode. Please connect via Binance Web3 Wallet extension.'
    }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'signin', qrCodeId } = body;

    if (action === 'verify') {
      if (!qrCodeId) {
        return Response.json({ success: false, error: 'qrCodeId is required for verify action' }, { status: 400 });
      }
      const verifyRes = await verifyBawSignin(qrCodeId);
      return Response.json(verifyRes);
    }

    // Default: initiate QR code login flow
    const signinRes = await startBawSignin();
    return Response.json(signinRes);
  } catch (err) {
    console.error('Wallet pair API error:', err);
    return Response.json({ success: false, error: 'Pairing service unavailable' }, { status: 503 });
  }
}
