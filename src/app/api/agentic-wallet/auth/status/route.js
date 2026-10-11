export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  checkPairingStatus 
} from '../../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const qrCodeId = searchParams.get('qrCodeId');
    const sessionId = searchParams.get('sessionId') || getSessionIdFromRequest(req);

    if (!sessionId) {
      return Response.json({
        success: false,
        error: 'Session ID is required'
      }, { status: 400 });
    }

    const result = await checkPairingStatus(sessionId, qrCodeId);
    return Response.json(result);
  } catch (err) {
    console.error('[API /agentic-wallet/auth/status] Error:', err);
    return Response.json({
      success: false,
      error: err.message || 'Status check failed'
    }, { status: 500 });
  }
}
