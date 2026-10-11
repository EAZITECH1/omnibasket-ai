export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  getUserStatus 
} from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || getSessionIdFromRequest(req);
    const status = getUserStatus(sessionId);
    return Response.json(status);
  } catch (err) {
    console.error('[API /agentic-wallet/status] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Failed to query Agentic Wallet status'
    }, { status: 500 });
  }
}
