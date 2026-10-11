export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getBalance } from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const balances = await getBalance(req);
    return Response.json(balances, { status: balances.status || 200 });
  } catch (err) {
    console.error('[API /agentic-wallet/balance] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to query Agentic Wallet balance'
    }, { status: 500 });
  }
}
