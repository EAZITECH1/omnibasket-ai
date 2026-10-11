export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getSessionIdFromRequest, 
  executeBasketAutonomous 
} from '../../../../services/userBawSessionManager.js';

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {}

    const { prompt, investmentAmount, allocations, chainId = 56 } = body;
    const sessionId = body.sessionId || getSessionIdFromRequest(req);

    if (!sessionId) {
      return Response.json({
        success: false,
        code: 'WALLET_NOT_CONNECTED',
        error: 'Active Agentic Wallet session required'
      }, { status: 401 });
    }

    const result = await executeBasketAutonomous({
      sessionId,
      prompt,
      investmentAmount,
      allocations,
      chainId
    });

    if (!result.success) {
      return Response.json(result, { status: 400 });
    }

    return Response.json(result);
  } catch (err) {
    console.error('[API /agentic-wallet/execute-basket] Error:', err);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: err.message || 'Execution error'
    }, { status: 500 });
  }
}
