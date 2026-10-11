export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { checkPairingStatus } from '../../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const result = await checkPairingStatus(req);
    return Response.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (err) {
    console.error('[API /agentic-wallet/auth/status] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Status check failed'
    }, { status: 500 });
  }
}
