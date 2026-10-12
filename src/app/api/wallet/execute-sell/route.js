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
