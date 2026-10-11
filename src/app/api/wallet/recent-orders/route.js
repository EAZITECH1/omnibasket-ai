export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { execFile } from 'child_process';
import util from 'util';
import { ensureBawSession } from '../../../../services/bawSession.js';

const execFilePromise = util.promisify(execFile);

export async function GET() {
  const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';
  if (!isAgenticEnabled) {
    return Response.json({
      success: true,
      orders: [],
      message: 'Agentic Wallet recent-orders is disabled in public mode.'
    });
  }

  try {
    ensureBawSession();
    const { stdout } = await execFilePromise('baw', ['market-order', 'list', '--binanceChainId', '56', '--json']);
    const parsed = JSON.parse(stdout);
    const list = parsed.data?.list || [];
    return Response.json({
      success: true,
      orders: list.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ success: false, error: 'Failed to retrieve recent orders' }, { status: 503 });
  }
}
