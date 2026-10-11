export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getBawSessionInfo, 
  getAgenticWalletStatus, 
  getAgenticWalletAddress, 
  getAgenticWalletQuota 
} from '../../../../services/bawSession.js';

export async function GET() {
  const isAgenticEnabled = process.env.ENABLE_AGENTIC_WALLET === 'true';

  if (!isAgenticEnabled) {
    return Response.json({
      success: true,
      mode: 'agentic',
      enabled: false,
      connected: false,
      address: null,
      status: 'UNAVAILABLE',
      message: 'Agentic Wallet unavailable in public mode. Shared server-side wallet has been disabled for multi-user security. Please connect via Binance Web3 Wallet extension.',
      chainId: 56,
      network: 'BNB Smart Chain (BSC)'
    });
  }

  try {
    const sessionInfo = getBawSessionInfo();
    const statusRes = await getAgenticWalletStatus();
    const quotaRes = await getAgenticWalletQuota();
    const addressRes = await getAgenticWalletAddress();

    const cliStatus = statusRes.success && statusRes.data ? statusRes.data.status : 'UNCONNECTED';
    const isConnected = cliStatus === 'CONNECTED' || cliStatus === 'AUTHORIZED';
    
    let resolvedAddress = null;
    if (isConnected && addressRes.success && addressRes.addresses) {
      if (typeof addressRes.addresses === 'string') {
        resolvedAddress = addressRes.addresses;
      } else if (Array.isArray(addressRes.addresses) && addressRes.addresses.length > 0) {
        resolvedAddress = addressRes.addresses[0].address || addressRes.addresses[0];
      }
    }

    return Response.json({
      success: true,
      mode: 'agentic',
      enabled: true,
      connected: isConnected,
      status: cliStatus,
      address: resolvedAddress,
      chainId: 56,
      network: 'BNB Smart Chain (BSC)',
      session: {
        exists: sessionInfo.exists,
        hasClientId: sessionInfo.hasClientId
      },
      quota: quotaRes.success ? quotaRes.data : null
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: 'Agentic Wallet service unavailable',
      mode: 'agentic',
      enabled: true,
      connected: false,
      chainId: 56
    }, { status: 503 });
  }
}
