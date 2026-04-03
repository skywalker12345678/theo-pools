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
  const claimWindowEnd = position.lockupEnds ? position.lockupEnds + 5 * 24 * 60 * 60 : 0;
  const claimWindowClosed = claimWindowEnd > 0 && now > claimWindowEnd;
  const canExit = !position.exitedEarly && !position.claimed && !gameEnded;
  const canClaim = !position.claimed && !position.exitedEarly && gameEnded && !claimWindowClosed;
  const rolledOver = !position.claimed && !position.exitedEarly && gameEnded && claimWindowClosed;

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

  // Status badge
  const badge = position.claimed
    ? { label: "✓ Claimed", color: "var(--success)", bg: "rgba(46,204,113,0.1)", border: "rgba(46,204,113,0.3)" }
    : position.exitedEarly
    ? { label: "Exited Early", color: "var(--danger)", bg: "rgba(231,76,60,0.1)", border: "rgba(231,76,60,0.3)" }
    : rolledOver
    ? { label: "🔄 Rolled Over", color: "var(--text-muted)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" }
    : gameEnded
    ? { label: "🏆 Survivor! Claim Now!", color: "var(--success)", bg: "rgba(46,204,113,0.1)", border: "rgba(46,204,113,0.3)" }
    : { label: "🟡 Active", color: "var(--accent)", bg: "rgba(252,163,17,0.1)", border: "rgba(252,163,17,0.3)" };

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
        <span style={{ padding: "4px 10px", background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 20, fontSize: 11, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <StatBox label="Staked" value="0.20" unit="THEO" />
        {!rolledOver && !position.exitedEarly && (
          <StatBox label="Claimable" value={position.claimableRewards.toFixed(4)} unit="THEO" accent />
        )}
        {rolledOver && (
          <div style={{ padding: "12px 14px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", gridColumn: "span 1" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Seeded next pool</div>
          </div>
        )}
        <StatBox label="Game Ended" value={position.lockupEnds ? new Date(position.lockupEnds * 1000).toLocaleDateString() : "—"} unit="" />
      </div>

      {/* Rolled over explanation */}
      {rolledOver && (
        <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          ℹ️ The claim window closed. Your rewards rolled over to seed the next pool. This is how the game works — attention is rewarded.
        </div>
      )}

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
            {claiming ? <><span className="spinner" /> Claiming…</> : "🏆 Claim Rewards"}
          </button>
        )}
        {position.claimed && (
          <div style={{ flex: 1, textAlign: "center", padding: "10px", color: "var(--success)", fontSize: 13, fontWeight: 600 }}>✓ Rewards successfully claimed!</div>
        )}
        {position.exitedEarly && (
          <div style={{ flex: 1, textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 13 }}>Exited early — 50% was returned to your wallet</div>
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
