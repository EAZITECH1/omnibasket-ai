import { runAgentCycle } from '@/agent/autonomousWorker';
import { PRESET_BASKETS } from '@/services/tokens';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const basketId = body.basketId || 'ai-supercycle';
    const selectedBasket = PRESET_BASKETS.find(b => b.id === basketId) || PRESET_BASKETS[0];
    const depositAmount = body.depositAmount || 25;

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const report = await runAgentCycle({
      basket: selectedBasket,
      depositAmount,
      baseUrl
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
