"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getPoolState, getUserPositions, joinPool, exitPool, claimRewards, withdraw, closeStalledPool, createPool, finalize } from "@/lib/instructions";
import { JoinModal } from "@/components/JoinModal";
import { Countdown } from "@/components/Countdown";
import { Pool, UserPosition } from "@/lib/types";
import { PROGRAM_ID } from "@/lib/constants";

export default function PoolDetailClient() {
  const params = useParams();
  const poolId = params.id as string;
  const [pool, setPool] = useState<Pool | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; sig?: string } | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const fetchData = useCallback(async () => {
    if (!poolId) return;
    const poolData = await getPoolState(poolId);
    setPool(poolData);
    if (publicKey && poolData) {
      const positions = await getUserPositions(publicKey);
      const pos = positions.find(p => p.poolId === poolId) ?? null;
      setPosition(pos);
    }
    setLoading(false);
  }, [poolId, publicKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAction(action: string, fn: () => Promise<any>) {
    if (!publicKey) { setVisible(true); return; }
    setActionLoading(action);
    setMessage(null);
    try {
      const tx = await fn();
      if (!tx) throw new Error("Failed to build transaction");
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setMessage({ type: "success", text: "Transaction confirmed!", sig });
      await fetchData();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Transaction failed" });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-muted)" }}><div className="spinner" style={{ margin: "0 auto 12px", width: 28, height: 28 }} /><p>Loading pool…</p></div>;
  if (!pool) return <div style={{ textAlign: "center", padding: "100px 0" }}><div style={{ fontSize: 40, marginBottom: 16 }}>🕳️</div><h2>Pool Not Found</h2><Link href="/" className="btn btn-primary" style={{ marginTop: 16 }}>← Back</Link></div>;

  const now = Math.floor(Date.now() / 1000);
  const gameEnded = pool.endTime > 0 && now > pool.endTime;
  const claimWindowOpen = gameEnded && pool.claimDeadline > 0 && now < pool.claimDeadline;
  const claimWindowClosed = pool.claimDeadline > 0 && now > pool.claimDeadline;

  const hasPosition = !!position;
  const canJoin = pool.status === "Filling" && !hasPosition;
  const canExit = hasPosition && !position?.exitedEarly && !position?.claimed && pool.status === "Active" && !gameEnded;
  const canClaim = hasPosition && !position?.exitedEarly && !position?.claimed && (pool.status === "Claiming" || (pool.status === "Active" && gameEnded));
  const canWithdraw = hasPosition && pool.status === "Filling";
  const canClose = pool.status === "Filling";
  const canFinalize = claimWindowClosed && pool.status !== "Finalized";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: 14 }}>Pools</Link>
        <span style={{ color: "var(--text-muted)" }}>›</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{pool.name}</span>
      </div>

      {/* Pool header */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 32, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800 }}>{pool.name}</h1>
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: pool.status === "Active" ? "rgba(46,204,113,0.15)" : pool.status === "Filling" ? "rgba(252,163,17,0.15)" : "rgba(255,255,255,0.05)", color: pool.status === "Active" ? "var(--success)" : pool.status === "Filling" ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${pool.status === "Active" ? "rgba(46,204,113,0.3)" : pool.status === "Filling" ? "rgba(252,163,17,0.3)" : "rgba(255,255,255,0.1)"}` }}>● {pool.status}</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>{pool.description}</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, paddingTop: 24, borderTop: "1px solid var(--border-subtle)", marginBottom: 24 }}>
          {[
            { label: "Players", value: `${pool.playerCount}/5` },
            { label: "Survivors", value: `${pool.survivorCount}` },
            { label: "Penalty Pot", value: `${pool.penaltyVaultBalance.toFixed(2)} THEO`, accent: true },
            { label: "Reward/Survivor", value: pool.rewardPerSurvivor > 0 ? `${pool.rewardPerSurvivor.toFixed(4)} THEO` : "TBD" },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Countdown timer */}
        <div style={{ paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          {pool.status === "Filling" && pool.fillDeadline > 0 && (
            <Countdown targetTime={pool.fillDeadline} label="Fill Window Closes" />
          )}
          {pool.status === "Active" && pool.endTime > 0 && (
            <Countdown targetTime={pool.endTime} label="Game Ends In" />
          )}
          {pool.status === "Claiming" && pool.claimDeadline > 0 && (
            <Countdown targetTime={pool.claimDeadline} label="Claim Window Closes" />
          )}
          {pool.status === "Active" && gameEnded && (
            <Countdown targetTime={pool.claimDeadline} label="Claim Window Closes" />
          )}
        </div>
      </div>

      {/* Your Position */}
      {publicKey && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Your Position</h2>
          {hasPosition ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Status</div>
                <div style={{ fontWeight: 700, color: position?.exitedEarly ? "var(--danger)" : position?.claimed ? "var(--success)" : "var(--accent)" }}>
                  {position?.exitedEarly ? "Exited Early" : position?.claimed ? "Claimed" : "Active"}
                </div>
              </div>
              <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Staked</div>
                <div style={{ fontWeight: 700 }}>0.20 THEO</div>
              </div>
              <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Claimable</div>
                <div style={{ fontWeight: 700, color: "var(--accent)" }}>{position?.claimableRewards.toFixed(4)} THEO</div>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>You don&apos;t have a position in this pool.</p>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", marginBottom: 16, background: message.type === "success" ? "rgba(46,204,113,0.1)" : "rgba(231,76,60,0.1)", border: `1px solid ${message.type === "success" ? "rgba(46,204,113,0.3)" : "rgba(231,76,60,0.3)"}`, color: message.type === "success" ? "var(--success)" : "var(--danger)" }}>
          {message.text}
          {message.sig && <a href={`https://explorer.x1.xyz/tx/${message.sig}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginLeft: 8, fontSize: 12 }}>View tx ↗</a>}
        </div>
      )}

      {/* Actions */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Actions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {!publicKey && <button className="btn btn-primary" onClick={() => setVisible(true)}>Connect Wallet</button>}
          {canJoin && <button className="btn btn-primary" onClick={() => setShowJoin(true)}>💰 Join Pool (0.20 THEO)</button>}
          {canExit && (
            <button className="btn btn-danger" disabled={actionLoading === "exit"} onClick={() => handleAction("exit", () => exitPool(poolId, publicKey!))}>
              {actionLoading === "exit" ? <><span className="spinner" /> Exiting…</> : "⚡ Exit Early (50% back)"}
            </button>
          )}
          {canClaim && (
            <button className="btn btn-primary" disabled={actionLoading === "claim"} onClick={() => handleAction("claim", () => claimRewards(poolId, publicKey!))}>
              {actionLoading === "claim" ? <><span className="spinner" /> Claiming…</> : "🏆 Claim Rewards"}
            </button>
          )}
          {canWithdraw && (
            <button className="btn btn-secondary" disabled={actionLoading === "withdraw"} onClick={() => handleAction("withdraw", () => withdraw(poolId, publicKey!))}>
              {actionLoading === "withdraw" ? <><span className="spinner" /> Withdrawing…</> : "↩️ Withdraw"}
            </button>
          )}
          {canClose && (
            <button className="btn btn-secondary" disabled={actionLoading === "close"} onClick={() => handleAction("close", () => closeStalledPool(poolId, publicKey!))}>
              {actionLoading === "close" ? <><span className="spinner" /> Closing…</> : "🔓 Close Stalled Pool"}
            </button>
          )}
          {canFinalize && (
            <button className="btn btn-secondary" disabled={actionLoading === "finalize"} onClick={() => handleAction("finalize", () => finalize(poolId, publicKey!))}>
              {actionLoading === "finalize" ? <><span className="spinner" /> Finalizing…</> : "🏁 Finalize Pool"}
            </button>
          )}
          {publicKey && (
            <button className="btn btn-secondary" disabled={actionLoading === "create"} onClick={() => handleAction("create", () => createPool(publicKey!))}>
              {actionLoading === "create" ? <><span className="spinner" /> Creating…</> : "🆕 Create New Pool"}
            </button>
          )}
        </div>
      </div>

      {/* On-chain details */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>On-Chain Details</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <DetailRow label="Program ID" value={PROGRAM_ID.toBase58()} mono explorer={`https://explorer.x1.xyz/address/${PROGRAM_ID.toBase58()}`} />
          <DetailRow label="Pool ID" value={pool.id} mono />
          <DetailRow label="Stake Token" value={pool.stakeMint ?? "—"} mono explorer={pool.stakeMint ? `https://explorer.x1.xyz/address/${pool.stakeMint}` : undefined} />
          <DetailRow label="Game End" value={pool.endTime > 0 ? new Date(pool.endTime * 1000).toLocaleString() : "—"} />
          <DetailRow label="Claim Deadline" value={pool.claimDeadline > 0 ? new Date(pool.claimDeadline * 1000).toLocaleString() : "—"} />
        </div>
      </div>

      {showJoin && <JoinModal pool={pool} onClose={() => setShowJoin(false)} onSuccess={() => { setShowJoin(false); fetchData(); }} />}
    </div>
  );
}

function DetailRow({ label, value, mono, explorer }: { label: string; value: string; mono?: boolean; explorer?: string; }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all", textAlign: "right" }}>
        {value}{explorer && <a href={explorer} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginLeft: 6, fontSize: 11 }}>↗</a>}
      </span>
    </div>
  );
}
