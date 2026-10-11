export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  authSignin, 
  checkPairingStatus 
} from '../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'signin' } = body;

    if (action === 'verify') {
      const verifyRes = await checkPairingStatus(req);
      return Response.json(verifyRes, { status: verifyRes.status || 200 });
    }

    // Default: initiate per-user QR code login flow
    const signinRes = await authSignin(req);
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (signinRes.cookieHeader) {
      headers.set('Set-Cookie', signinRes.cookieHeader);
    }

    const jsonBody = { ...signinRes };
    delete jsonBody.sessionId;
    delete jsonBody.cookieHeader;

    return new Response(JSON.stringify(jsonBody), {
      status: signinRes.status || (signinRes.success ? 200 : 503),
      headers
    });
  } catch (err) {
    console.error('Wallet pair API error:', err.message);
    return Response.json({ success: false, error: 'Pairing service unavailable' }, { status: 503 });
  }
}
