export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { exec } from 'child_process';
import util from 'util';
import { ensureBawSession } from '../../../../services/bawSession';

const execPromise = util.promisify(exec);

export async function GET() {
  try {
    ensureBawSession();
    const { stdout } = await execPromise('baw wallet balance --binanceChainId 56 --json');
    const parsed = JSON.parse(stdout);

    if (parsed.success && parsed.data) {
      const totalUsd = parsed.data.reduce((sum, item) => sum + parseFloat(item.value || 0), 0);
      return Response.json({
        success: true,
        address: '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283',
        network: 'BNB Smart Chain (BSC)',
        chainId: 56,
        totalValueUsd: parseFloat(totalUsd.toFixed(2)),
        tokens: parsed.data.map(t => ({
          symbol: t.symbol,
          address: t.address,
          balance: parseFloat(parseFloat(t.balance || 0).toFixed(6)),
          rawBalance: t.balance,
          priceUsd: parseFloat(parseFloat(t.price || 0).toFixed(2)),
          valueUsd: parseFloat(parseFloat(t.value || 0).toFixed(2))
        }))
      });
    }

    return Response.json({ success: false, error: 'Failed to parse balance data' }, { status: 500 });
  } catch (error) {
    console.error('Wallet balance API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
