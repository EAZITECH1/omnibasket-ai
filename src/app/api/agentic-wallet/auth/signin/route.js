export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { authSignin } from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const result = await authSignin(req);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (result.cookieHeader) {
      headers.set('Set-Cookie', result.cookieHeader);
    }

    // Never return raw sessionId in JSON response
    const jsonBody = { ...result };
    delete jsonBody.sessionId;
    delete jsonBody.cookieHeader;

    return new Response(JSON.stringify(jsonBody), {
      status: result.status || (result.success ? 200 : 503),
      headers
    });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/signin] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Pairing service unavailable. Please retry or use Binance Web3 Wallet extension.'
    }, { status: 500 });
  }
}
