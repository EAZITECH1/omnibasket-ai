export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { authSignout } from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const result = await authSignout(req);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (result.cookieHeader) {
      headers.set('Set-Cookie', result.cookieHeader);
    }

    const jsonBody = { ...result };
    delete jsonBody.cookieHeader;

    return new Response(JSON.stringify(jsonBody), {
      status: result.status || (result.success ? 200 : 400),
      headers
    });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/signout] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Signout failed'
    }, { status: 500 });
  }
}
