export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  authSignin 
} from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {}

    const incomingSid = body.sessionId || getSessionIdFromRequest(req);
    const result = await authSignin(incomingSid);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set(
      'Set-Cookie', 
      `omnibasket_baw_sid=${result.sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/signin] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Failed to initiate Agentic Wallet pairing'
    }, { status: 500 });
  }
}
