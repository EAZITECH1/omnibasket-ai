import { fetchWithX402Payment } from '@/agent/x402Client';

export async function POST(req) {
  try {
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const targetUrl = `${protocol}://${host}/api/rwa/alpha-feed`;

    const result = await fetchWithX402Payment(targetUrl, { isDemo: true });

    return Response.json(result);
  } catch (error) {
    console.error('x402 Demo API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
