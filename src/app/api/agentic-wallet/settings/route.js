export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  getSettings 
} from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || getSessionIdFromRequest(req);
    const settings = getSettings(sessionId);
    return Response.json(settings);
  } catch (err) {
    console.error('[API /agentic-wallet/settings] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Failed to query Agentic Wallet settings'
    }, { status: 500 });
  }
}
