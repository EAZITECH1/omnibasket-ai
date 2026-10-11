export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  authSignin, 
  checkPairingStatus 
} from '../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'signin', qrCodeId } = body;
    const sessionId = body.sessionId || getSessionIdFromRequest(req);

    if (action === 'verify') {
      if (!qrCodeId) {
        return Response.json({ success: false, error: 'qrCodeId is required for verify action' }, { status: 400 });
      }
      const verifyRes = await checkPairingStatus(sessionId, qrCodeId);
      return Response.json(verifyRes);
    }

    // Default: initiate per-user QR code login flow
    const signinRes = await authSignin(sessionId);
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set(
      'Set-Cookie', 
      `omnibasket_baw_sid=${signinRes.sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );

    return new Response(JSON.stringify(signinRes), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('Wallet pair API error:', err);
    return Response.json({ success: false, error: 'Pairing service unavailable' }, { status: 503 });
  }
}
