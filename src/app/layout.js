import './globals.css';
import ClientProviders from '../components/ClientProviders.js';

export const metadata = {
  title: 'OmniBasket AI — Thematic Stock Baskets on BNB Smart Chain',
  description: 'Autonomous conversational thematic stock baskets and 24/7 smart DCA rebalancer on BSC using Binance Web3 Wallet.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png' }
    ],
    shortcut: '/icon.svg',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-bnb-dark text-[#EAECEF] min-h-screen antialiased">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
