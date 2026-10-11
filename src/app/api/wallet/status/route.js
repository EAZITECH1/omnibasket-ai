export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getUserStatus } from '../../../../services/userBawSessionManager.js';

export async function GET(req) {
  // Check if calling user has an isolated authenticated session
  const userStatus = await getUserStatus(req);
  if (userStatus.data?.connected) {
    return Response.json({
      success: true,
      mode: 'agentic',
      enabled: true,
      connected: true,
      address: userStatus.data.address,
      status: userStatus.data.status,
      chainId: 56,
      network: 'BNB Smart Chain (BSC)',
      quota: userStatus.data.quota
    });
  }

  // Without a connected personal session, report public state (never return a shared server address)
  return Response.json({
    success: true,
    mode: 'agentic',
    enabled: false,
    connected: false,
    address: null,
    status: 'UNAVAILABLE',
    message: 'No shared server wallet. Connect your personal Binance Agentic Wallet via QR pairing or use Binance Web3 Wallet extension.',
    chainId: 56,
    network: 'BNB Smart Chain (BSC)'
  });
}
