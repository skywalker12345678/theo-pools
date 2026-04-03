"use client";
import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { joinPool } from "@/lib/instructions";
import { Pool } from "@/lib/types";

interface JoinModalProps {
  pool: Pool;
  onClose: () => void;
  onSuccess?: () => void;
}

export function JoinModal({ pool, onClose, onSuccess }: JoinModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const STAKE_AMOUNT = 0.20;

  async function handleJoin() {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const tx = await joinPool(pool.id, STAKE_AMOUNT, publicKey);
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, backdropFilter: "blur(4px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 201, width: "100%", maxWidth: 480, padding: "0 16px" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, boxShadow: "var(--shadow)" }}>
          
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Join {pool.name}</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Stake THEO to earn rewards</p>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
          </div>

          {/* Pool info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <InfoRow label="Players" value={`${pool.playerCount}/5`} />
            <InfoRow label="Survivors" value={`${pool.survivorCount}`} />
            <InfoRow label="Penalty Pot" value={`${pool.penaltyVaultBalance.toFixed(2)} THEO`} accent />
            <InfoRow label="Status" value={pool.status} />
          </div>

          {/* Fixed stake amount */}
          <div style={{ padding: "16px", background: "var(--accent-dim)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stake Amount (Fixed)</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "var(--accent)" }}>0.20 THEO</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>All players stake the same amount</div>
          </div>

          {!txSig ? (
            <>
              {error && (
                <div style={{ padding: "10px 14px", background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)", borderRadius: "var(--radius-sm)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleJoin} disabled={loading || !publicKey} style={{ flex: 2 }}>
                  {loading ? <><span className="spinner" /> Confirming…</> : "Stake & Join Pool"}
                </button>
              </div>
              {!publicKey && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 12 }}>Connect your wallet to continue</p>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Successfully Joined!</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>You staked <strong style={{ color: "var(--accent)" }}>0.20 THEO</strong> in {pool.name}.</p>
              <a href={`https://explorer.x1.xyz/tx/${txSig}`} target="_blank" rel="noreferrer" style={{ display: "block", color: "var(--accent)", fontSize: 12, marginBottom: 20, wordBreak: "break-all" }}>View on Explorer ↗</a>
              <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean; }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
