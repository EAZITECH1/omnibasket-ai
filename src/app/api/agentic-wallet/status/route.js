export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getUserStatus } from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const status = await getUserStatus(req);
    return Response.json(status, { status: status.status || 200 });
  } catch (err) {
    console.error('[API /agentic-wallet/status] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to query Agentic Wallet status'
    }, { status: 500 });
  }
}
