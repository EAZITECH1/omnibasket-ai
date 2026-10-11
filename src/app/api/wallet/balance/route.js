export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { execFile } from 'child_process';
import util from 'util';
import { isAddress } from 'viem';
import { ensureBawSession } from '../../../../services/bawSession.js';
import { readBscBalances } from '../../../../services/bscBalanceReader.js';

const execFilePromise = util.promisify(execFile);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const targetAddress = searchParams.get('address');

    // 1. If explicit address provided (e.g. Extension Wallet mode), query on-chain via viem on BSC #56
    if (targetAddress) {
      if (!isAddress(targetAddress)) {
        return Response.json({ success: false, error: 'Invalid BSC address provided.' }, { status: 400 });
      }
      const onchainData = await readBscBalances(targetAddress);
      return Response.json(onchainData);
    }

    // 2. If no address passed, check if Agentic mode is explicitly enabled
    const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';
    if (!isAgenticEnabled) {
      return Response.json({ 
        success: false, 
        error: 'Agentic Wallet unavailable in public mode. Connect your browser extension to view balances.' 
      }, { status: 503 });
    }

    ensureBawSession();

    try {
      const { stdout } = await execFilePromise('baw', ['wallet', 'balance', '--binanceChainId', '56', '--json']);
      const parsed = JSON.parse(stdout);

      if (parsed.success && parsed.data && Array.isArray(parsed.data)) {
        const totalUsd = parsed.data.reduce((sum, item) => sum + parseFloat(item.value || 0), 0);
        return Response.json({
          success: true,
          mode: 'baw-cli',
          address: null,
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
    } catch (_) {}

    return Response.json({ 
      success: false, 
      error: 'Agentic Wallet session unauthenticated.' 
    }, { status: 503 });
  } catch (error) {
    console.error('Wallet balance API error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
