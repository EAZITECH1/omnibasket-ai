'use client';

import React from 'react';
import { WalletProvider } from '../context/WalletContext.js';
import WalletModal from './WalletModal.js';

export default function ClientProviders({ children }) {
  return (
    <WalletProvider>
      {children}
      <WalletModal />
    </WalletProvider>
  );
}
