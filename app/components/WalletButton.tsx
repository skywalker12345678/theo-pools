"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

function truncate(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (connecting) {
    return (
      <button className="btn btn-secondary" disabled>
        <span className="spinner" />
        Connecting…
      </button>
    );
  }

  if (publicKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: "var(--accent-dim)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent)",
          }}
        >
          {/* Wallet icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 7H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-1 4h-3a2 2 0 0 0 0 4h3v2H4V9h16v2z" />
          </svg>
          {truncate(publicKey.toBase58())}
        </span>
        <button
          className="btn btn-secondary"
          onClick={disconnect}
          style={{ padding: "6px 12px", fontSize: 13 }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn btn-primary"
      onClick={() => setVisible(true)}
      style={{ padding: "8px 20px" }}
    >
      {/* Wallet icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 7H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-1 4h-3a2 2 0 0 0 0 4h3v2H4V9h16v2z" />
        <path d="M3 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      </svg>
      Connect Wallet
    </button>
  );
}
