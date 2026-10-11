export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  authSignout 
} from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {}

    const sessionId = body.sessionId || getSessionIdFromRequest(req);
    const result = await authSignout(sessionId);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set(
      'Set-Cookie', 
      'omnibasket_baw_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers
    });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/signout] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Signout failed'
    }, { status: 500 });
  }
}
