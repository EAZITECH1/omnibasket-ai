export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { execFile } from 'child_process';
import util from 'util';
import { ensureBawSession } from '../../../../services/bawSession.js';
import { getUserRecentOrders } from '../../../../services/userBawSessionManager.js';

const execFilePromise = util.promisify(execFile);

export async function GET(req) {
  // 1. Try per-user authenticated Binance Agentic session
  try {
    const userOrders = await getUserRecentOrders(req);
    if (userOrders?.orders && userOrders.orders.length > 0) {
      return Response.json({
        success: true,
        orders: userOrders.orders.slice(0, 10)
      });
    }
  } catch (_) {}

  const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';
  if (!isAgenticEnabled) {
    return Response.json({
      success: true,
      orders: [],
      message: 'No recent orders for current session.'
    });
  }

  try {
    ensureBawSession();
    let orderId = null;
    try {
      const url = new URL(req.url, 'http://localhost');
      orderId = url.searchParams.get('orderId');
    } catch (_) {}

    const args = orderId
      ? ['market-order', 'list', '--orderId', orderId, '--json']
      : ['market-order', 'list', '--binanceChainId', '56', '--json'];

    const { stdout } = await execFilePromise('baw', args);
    const parsed = JSON.parse(stdout);
    const list = parsed.data?.list || [];
    return Response.json({
      success: true,
      orders: list.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ success: true, orders: [] });
  }
}
