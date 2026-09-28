import { AGENT_IDENTITY } from '@/agent/agentIdentity';
import { getMarketHoursStatus } from '@/services/marketHours';

export async function GET() {
  const marketStatus = getMarketHoursStatus();

  return Response.json({
    status: 'ONLINE',
    agent: AGENT_IDENTITY,
    market: marketStatus,
    heartbeat: new Date().toISOString(),
    uptime: '100% (24/7 BSC Sentinel)',
    activeStrategies: ['AI_CHIPS_BASKET', 'DEFENSIVE_YIELD_ONDO', 'MAGNIFICENT_7_INDEX']
  });
}
