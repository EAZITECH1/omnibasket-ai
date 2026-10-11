export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { executeBasketAutonomous } from '../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await executeBasketAutonomous(req, body);
    return Response.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (err) {
    console.error('[API /agentic-wallet/execute-basket] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Execution error'
    }, { status: 500 });
  }
}
