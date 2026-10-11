export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  getBalance 
} from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || getSessionIdFromRequest(req);
    const balances = await getBalance(sessionId);
    return Response.json(balances);
  } catch (err) {
    console.error('[API /agentic-wallet/balance] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Failed to query Agentic Wallet balance'
    }, { status: 500 });
  }
}
