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

  const now = Math.floor(Date.now() / 1000);
  const gameEnded = position.lockupEnds ? now > position.lockupEnds : false;
  const canExit = !position.exitedEarly && !position.claimed && !gameEnded;
  const canClaim = !position.claimed && gameEnded && !position.exitedEarly;

  async function handleExit() {
    if (!publicKey) return;
    setExiting(true);
    setMessage(null);
    try {
      const tx = await exitPool(position.poolId, publicKey);
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setMessage({ type: "success", text: "Exited early — 50% returned, 50% to survivors." });
      onRefresh?.();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Exit failed" });
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
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setMessage({ type: "success", text: `Claimed ${position.claimableRewards.toFixed(4)} THEO!` });
      onRefresh?.();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Claim failed" });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{position.poolName}</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Joined {new Date(position.entryTimestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {/* Status badge */}
        {position.claimed && (
          <span style={{ padding: "4px 10px", background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.3)", borderRadius: 20, fontSize: 11, color: "var(--success)", fontWeight: 700 }}>✓ Claimed</span>
        )}
        {position.exitedEarly && (
          <span style={{ padding: "4px 10px", background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)", borderRadius: 20, fontSize: 11, color: "var(--danger)", fontWeight: 700 }}>Exited Early</span>
        )}
        {!position.exitedEarly && !position.claimed && !gameEnded && (
          <span style={{ padding: "4px 10px", background: "rgba(252,163,17,0.1)", border: "1px solid rgba(252,163,17,0.3)", borderRadius: 20, fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>🟡 Active</span>
        )}
        {!position.exitedEarly && !position.claimed && gameEnded && (
          <span style={{ padding: "4px 10px", background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.3)", borderRadius: 20, fontSize: 11, color: "var(--success)", fontWeight: 700 }}>🏆 Survivor!</span>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <StatBox label="Staked" value="0.20" unit="THEO" />
        <StatBox label="Claimable" value={position.claimableRewards.toFixed(4)} unit="THEO" accent />
        <StatBox label="Game Ends" value={position.lockupEnds ? new Date(position.lockupEnds * 1000).toLocaleDateString() : "—"} unit="" />
      </div>

      {/* Message */}
      {message && (
        <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: 13, marginBottom: 12, background: message.type === "success" ? "rgba(46,204,113,0.1)" : "rgba(231,76,60,0.1)", border: `1px solid ${message.type === "success" ? "rgba(46,204,113,0.3)" : "rgba(231,76,60,0.3)"}`, color: message.type === "success" ? "var(--success)" : "var(--danger)" }}>
          {message.text}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {canExit && (
          <button className="btn btn-danger" onClick={handleExit} disabled={exiting} style={{ flex: 1, fontSize: 13 }}>
            {exiting ? <><span className="spinner" /> Exiting…</> : "⚡ Exit Early (50% back)"}
          </button>
        )}
        {canClaim && (
          <button className="btn btn-primary" onClick={handleClaim} disabled={claiming} style={{ flex: 1, fontSize: 13 }}>
            {claiming ? <><span className="spinner" /> Claiming…</> : `🏆 Claim Rewards`}
          </button>
        )}
        {position.claimed && (
          <div style={{ flex: 1, textAlign: "center", padding: "10px", color: "var(--success)", fontSize: 13, fontWeight: 600 }}>✓ Rewards claimed!</div>
        )}
        {position.exitedEarly && (
          <div style={{ flex: 1, textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 13 }}>Exited — 50% returned</div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean; }) {
  return (
    <div style={{ padding: "12px 14px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? "var(--accent)" : "var(--text-primary)" }}>
        {value} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{unit}</span>
      </div>
    </div>
  );
}
