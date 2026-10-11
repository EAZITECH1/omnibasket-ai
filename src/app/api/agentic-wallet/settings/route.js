export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getSettings } from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  try {
    const settings = await getSettings(req);
    return Response.json(settings, { status: settings.status || 200 });
  } catch (err) {
    console.error('[API /agentic-wallet/settings] Error:', err.message);
    return Response.json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to query Agentic Wallet settings'
    }, { status: 500 });
  }
}
