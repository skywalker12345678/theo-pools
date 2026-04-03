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
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const numAmount = parseFloat(amount);
  const isValid =
    !isNaN(numAmount) &&
    numAmount >= pool.minStake &&
    numAmount <= pool.maxStake;

  async function handleJoin() {
    if (!publicKey || !isValid) return;
    setLoading(true);
    setError(null);

    try {
      const tx = await joinPool(pool.id, numAmount, publicKey);
      const sig = await sendTransaction(tx, connection);
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 200,
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: "100%",
          maxWidth: 480,
          padding: "0 16px",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 32,
            boxShadow: "var(--shadow)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Join {pool.name}</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                Stake XNT to earn rewards
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Pool info */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 24,
              padding: 16,
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <InfoRow label="APR" value={`${pool.apr.toFixed(1)}%`} accent />
            <InfoRow label="Min Stake" value={`${pool.minStake} XNT`} />
            <InfoRow label="Max Stake" value={`${pool.maxStake.toLocaleString()} XNT`} />
            <InfoRow label="TVL" value={`${(pool.tvl / 1000).toFixed(1)}k XNT`} />
          </div>

          {/* Amount input */}
          {!txSig ? (
            <>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Stake Amount (XNT)
              </label>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  className="input"
                  type="number"
                  min={pool.minStake}
                  max={pool.maxStake}
                  placeholder={`Min ${pool.minStake} XNT`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ paddingRight: 60 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  XNT
                </span>
              </div>

              {/* Quick amounts */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {[pool.minStake, pool.minStake * 5, pool.minStake * 10].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-secondary)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {v} XNT
                  </button>
                ))}
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(231,76,60,0.1)",
                    border: "1px solid rgba(231,76,60,0.3)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--danger)",
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={onClose}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleJoin}
                  disabled={!isValid || loading || !publicKey}
                  style={{ flex: 2 }}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Confirming…
                    </>
                  ) : (
                    "Stake & Join Pool"
                  )}
                </button>
              </div>

              {!publicKey && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 12 }}>
                  Connect your wallet to continue
                </p>
              )}
            </>
          ) : (
            /* Success state */
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Successfully Joined!
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
                You staked{" "}
                <strong style={{ color: "var(--accent)" }}>{amount} XNT</strong> in{" "}
                {pool.name}.
              </p>
              <a
                href={`https://explorer.testnet.x1.xyz/tx/${txSig}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  color: "var(--accent)",
                  fontSize: 12,
                  marginBottom: 20,
                  wordBreak: "break-all",
                }}
              >
                View on Explorer ↗
              </a>
              <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
