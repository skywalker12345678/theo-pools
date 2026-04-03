"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { RPC_ENDPOINT } from "@/lib/constants";

// Import wallet-adapter default styles
import "@solana/wallet-adapter-react-ui/styles.css";

interface WalletProviderWrapperProps {
  children: React.ReactNode;
}

export function WalletProviderWrapper({ children }: WalletProviderWrapperProps) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // Backpack and X1 Wallet are detected automatically via the
      // Standard Wallet API — no explicit adapter needed for modern wallets.
      // If you need legacy support, add:
      //   new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    // @ts-expect-error - Wallet adapter React 18 types mismatch with Next.js 14
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
