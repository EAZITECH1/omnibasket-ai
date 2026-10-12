import { runAgentCycle } from '@/agent/autonomousWorker';
import { PRESET_BASKETS } from '@/services/tokens';
import { getBalance } from '@/services/userBawSessionManager';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const basketId = body.basketId || 'ai-supercycle';
    const selectedBasket = PRESET_BASKETS.find(b => b.id === basketId) || PRESET_BASKETS[0];
    const depositAmount = body.depositAmount || 25;

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Read live balances from cookie session or address if available
    let liveHoldings = body.holdings || null;
    if (!liveHoldings) {
      try {
        const balRes = await getBalance(req);
        const tokenList = balRes?.data?.balances || balRes?.tokens || [];
        if (Array.isArray(tokenList) && tokenList.length > 0) {
          const held = tokenList
            .filter(t => parseFloat(t.balance || 0) > 0.000001 && t.symbol !== 'USDT')
            .map(t => ({
              ticker: t.symbol.replace(/on$/i, ''),
              valueUsd: parseFloat(t.valueUsd || (parseFloat(t.balance) * (parseFloat(t.price) || 100)))
            }));
          if (held.length > 0) {
            liveHoldings = held;
          }
        }
      } catch (_) {}
    }

    const report = await runAgentCycle({
      basket: selectedBasket,
      depositAmount,
      baseUrl,
      sampleHoldings: (liveHoldings && liveHoldings.length > 0) ? liveHoldings : undefined
    });

    return Response.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Agent cycle error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
