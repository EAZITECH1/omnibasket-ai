import './globals.css';

export const metadata = {
  title: 'OmniBasket AI — Thematic Stock Baskets on BNB Smart Chain',
  description: 'Autonomous conversational thematic stock baskets and 24/7 smart DCA rebalancer on BSC using Binance Web3 Wallet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-bnb-dark text-[#EAECEF] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
