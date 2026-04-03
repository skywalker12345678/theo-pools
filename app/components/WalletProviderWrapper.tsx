"use client";
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { FC, ReactNode, useMemo } from "react";
// @ts-ignore
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
// @ts-ignore
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_ENDPOINT = "https://rpc.testnet.x1.xyz";

export const WalletProviderWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    // @ts-ignore
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      {/* @ts-ignore */}
      <WalletProvider wallets={wallets} autoConnect>
        {/* @ts-ignore */}
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProviderWrapper;
