"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { exitPool, claimRewards } from "@/lib/instructions";
import { UserPosition } from "@/lib/types";

interface StakePositionProps {
  position: UserPosition;
  onRefresh?: () => void;
}

export function StakePosition({ position, onRefresh }: StakePositionProps) {
  const [exiting, setExiting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const isLocked =
    position.lockupEnds != null && position.lockupEnds > Date.now() / 1000;

  async function handleExit() {
    if (!publicKey) return;
    setExiting(true);
    setMessage(null);
    try {
      const tx = await exitPool(position.poolId, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMessage({ type: "success", text: "Exited pool. Stake returned." });
      onRefresh?.();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Exit failed";
      setMessage({ type: "error", text });
    } finally {
      setExiting(false);
    }
  }

  async function handleClaim() {
    if (!publicKey) return;
    setClaiming(true);
    setMessage(null);
    try {
      const tx = await claimRewards(position.poolId, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMessage({
        type: "success",
        text: `Claimed ${position.claimableRewards.toFixed(4)} XNT`,
      });
      onRefresh?.();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Claim failed";
      setMessage({ type: "error", text });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius)",
        padding: 20,
        transition: "border-color 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{position.poolName}</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Joined{" "}
            {new Date(position.entryTimestamp * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {isLocked && position.lockupEnds && (
          <span className="badge" style={{ background: "rgba(243,156,18,0.12)", color: "var(--warning)", border: "1px solid rgba(243,156,18,0.3)", fontSize: 11 }}>
            🔒 Locked until{" "}
            {new Date(position.lockupEnds * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatBox
          label="Staked"
          value={position.stakedAmount.toLocaleString()}
          unit="XNT"
        />
        <StatBox
          label="Claimable Rewards"
          value={position.claimableRewards.toFixed(4)}
          unit="XNT"
          accent
        />
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            marginBottom: 12,
            background:
              message.type === "success"
                ? "rgba(46,204,113,0.1)"
                : "rgba(231,76,60,0.1)",
            border: `1px solid ${
              message.type === "success"
                ? "rgba(46,204,113,0.3)"
                : "rgba(231,76,60,0.3)"
            }`,
            color:
              message.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-danger"
          onClick={handleExit}
          disabled={exiting || claiming || isLocked}
          style={{ flex: 1, fontSize: 13 }}
          title={isLocked ? "Stake is locked" : "Exit pool and withdraw stake"}
        >
          {exiting ? (
            <>
              <span className="spinner" /> Exiting…
            </>
          ) : (
            "Exit Pool"
          )}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleClaim}
          disabled={
            claiming ||
            exiting ||
            position.claimableRewards <= 0
          }
          style={{ flex: 1, fontSize: 13 }}
        >
          {claiming ? (
            <>
              <span className="spinner" /> Claiming…
            </>
          ) : (
            `Claim ${position.claimableRewards.toFixed(4)} XNT`
          )}
        </button>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}{" "}
        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
