export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { executeBasketAutonomous } from '../../../../services/userBawSessionManager.js';
import { readBscBalances } from '../../../../services/bscBalanceReader.js';
import { BSC_RWA_TOKENS } from '../../../../services/tokens.js';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetAddress = body.walletAddress || '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';
    
    // Read live on-chain balance to get exact held quantity
    const balData = await readBscBalances(targetAddress);
    const appleToken = balData?.tokens?.find(t => 
      t.symbol === 'AAPLon' || 
      t.address?.toLowerCase() === BSC_RWA_TOKENS.AAPL?.contractAddress?.toLowerCase()
    );
    
    const qty = appleToken?.balance || 0.0162359;
    if (!qty || qty <= 0) {
      return Response.json({
        success: false,
        error: 'No AAPLon balance found on-chain to sell for wallet ' + targetAddress
      }, { status: 400 });
    }

    // Execute reverse exit to USDT
    const res = await executeBasketAutonomous(req, {
      walletAddress: targetAddress,
      mode: 'REVERSE_EXIT_TO_USDT',
      fromTicker: 'AAPL',
      toTicker: 'USDT',
      fromQty: qty,
      chainId: 56
    });

    return Response.json({
      success: res.success,
      data: res,
      soldAsset: 'AAPLon',
      quantity: qty,
      walletAddress: targetAddress
    }, { status: res.status || (res.success ? 200 : 400) });
  } catch (err) {
    console.error('[API /api/wallet/execute-sell] Error:', err);
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const targetAddress = url.searchParams.get('walletAddress') || '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';
    const orderId = url.searchParams.get('orderId') || '26101200001960050013';

    const { findActiveSessionByWallet } = await import('../../../../services/bawSessionStore.js');
    const { callBinanceBapi } = await import('../../../../services/userBawSessionManager.js');

    const session = await findActiveSessionByWallet(targetAddress);
    if (!session || !session.agentSessionId) {
      return Response.json({ success: false, error: 'No active session found for wallet ' + targetAddress }, { status: 404 });
    }

    let queryRes = await callBinanceBapi(
      '/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders',
      'POST',
      { orderId, binanceChainId: '56', page: 1, pageSize: 10 },
      session.agentSessionId,
      session.clientId
    );

    if (!queryRes?.data?.data?.rows?.length) {
      queryRes = await callBinanceBapi(
        '/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders',
        'POST',
        { page: 1, pageSize: 10 },
        session.agentSessionId,
        session.clientId
      );
    }

    return Response.json({
      success: true,
      orderId,
      result: queryRes?.data
    });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
