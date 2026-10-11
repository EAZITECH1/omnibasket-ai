export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { 
  getBawSessionInfo, 
  getAgenticWalletStatus, 
  getAgenticWalletAddress, 
  getAgenticWalletQuota 
} from '../../../../services/bawSession.js';

export async function GET() {
  try {
    const sessionInfo = getBawSessionInfo();
    const statusRes = await getAgenticWalletStatus();
    const quotaRes = await getAgenticWalletQuota();
    const addressRes = await getAgenticWalletAddress();

    // Default or configured address
    const defaultAddress = process.env.AGENTIC_WALLET_ADDRESS || '0x03A48c451B8cbE0bed6172eeaaE84a9B20505283';
    
    // Determine connection state
    const cliStatus = statusRes.success && statusRes.data ? statusRes.data.status : 'UNCONNECTED';
    const isConnected = cliStatus === 'CONNECTED' || cliStatus === 'AUTHORIZED';
    
    let resolvedAddress = defaultAddress;
    if (addressRes.success && addressRes.addresses) {
      if (typeof addressRes.addresses === 'string') {
        resolvedAddress = addressRes.addresses;
      } else if (Array.isArray(addressRes.addresses) && addressRes.addresses.length > 0) {
        resolvedAddress = addressRes.addresses[0].address || addressRes.addresses[0];
      }
    }

    return Response.json({
      success: true,
      mode: 'agentic',
      connected: isConnected,
      status: cliStatus,
      address: resolvedAddress,
      chainId: 56,
      network: 'BNB Smart Chain (BSC)',
      session: {
        exists: sessionInfo.exists,
        hasClientId: sessionInfo.hasClientId,
        clientIdSnippet: sessionInfo.clientIdSnippet
      },
      quota: quotaRes.success ? quotaRes.data : { dailyLimit: 1000, remaining: 1000 },
      isDemoFallback: !isConnected
    });
  } catch (err) {
    console.error('Wallet status API error:', err);
    return Response.json({
      success: false,
      error: err.message,
      mode: 'agentic',
      connected: false,
      chainId: 56
    }, { status: 500 });
  }
}
