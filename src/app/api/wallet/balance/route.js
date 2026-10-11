export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { execFile } from 'child_process';
import util from 'util';
import { ensureBawSession } from '../../../../services/bawSession.js';
import { readBscBalances } from '../../../../services/bscBalanceReader.js';

const execFilePromise = util.promisify(execFile);

export async function GET(req) {
  try {
    ensureBawSession();
    const { searchParams } = new URL(req.url);
    const targetAddress = searchParams.get('address');

    // 1. If explicit address provided (e.g. Extension Wallet mode), query on-chain via viem
    if (targetAddress && targetAddress.startsWith('0x') && targetAddress.length === 42) {
      const onchainData = await readBscBalances(targetAddress);
      return Response.json(onchainData);
    }

    // 2. Default Agentic Wallet flow via baw CLI
    const defaultAddress = process.env.AGENTIC_WALLET_ADDRESS || '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';

    try {
      const { stdout } = await execFilePromise('baw', ['wallet', 'balance', '--binanceChainId', '56', '--json']);
      const parsed = JSON.parse(stdout);

      if (parsed.success && parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const totalUsd = parsed.data.reduce((sum, item) => sum + parseFloat(item.value || 0), 0);
        return Response.json({
          success: true,
          mode: 'baw-cli',
          address: defaultAddress,
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
    } catch (cliErr) {
      // CLI is not logged in or threw - proceed to on-chain fallback
    }

    // 3. Fallback: query on-chain data for the agent address
    const fallbackData = await readBscBalances(defaultAddress);
    return Response.json({
      ...fallbackData,
      mode: 'agentic-onchain-verified'
    });
  } catch (error) {
    console.error('Wallet balance API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
