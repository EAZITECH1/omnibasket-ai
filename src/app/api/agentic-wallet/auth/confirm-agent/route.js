export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { confirmAgentSignin } from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await confirmAgentSignin(req, body);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (result.cookieHeader) {
      headers.set('Set-Cookie', result.cookieHeader);
    }

    const jsonBody = { ...result };
    delete jsonBody.rotatedSessionId;
    delete jsonBody.cookieHeader;

    return new Response(JSON.stringify(jsonBody), {
      status: result.status || (result.success ? 200 : 400),
      headers
    });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/confirm-agent] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Agent confirmation failed'
    }, { status: 500 });
  }
}
