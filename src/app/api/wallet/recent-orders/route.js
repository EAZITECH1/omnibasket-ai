export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { exec } from 'child_process';
import util from 'util';
import { ensureBawSession } from '../../../../services/bawSession';

const execPromise = util.promisify(exec);

export async function GET() {
  try {
    ensureBawSession();
    const { stdout } = await execPromise('baw market-order list --binanceChainId 56 --json');
    const parsed = JSON.parse(stdout);
    const list = parsed.data?.list || [];
    return Response.json({
      success: true,
      orders: list.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
