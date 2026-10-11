export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  confirmAgentSignin 
} from '../../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {}

    const { qrCodeId, confirmWord } = body;
    const sessionId = body.sessionId || getSessionIdFromRequest(req);

    if (!sessionId) {
      return Response.json({
        success: false,
        error: 'Session ID is required'
      }, { status: 400 });
    }

    const result = await confirmAgentSignin(sessionId, { qrCodeId, confirmWord });
    return Response.json(result);
  } catch (err) {
    console.error('[API /agentic-wallet/auth/confirm-agent] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Agent confirmation failed'
    }, { status: 500 });
  }
}
