"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { Pool } from "@/lib/types";
import { getAllPools, createPool } from "@/lib/instructions";
import { PoolCard } from "@/components/PoolCard";

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    getAllPools().then((data) => { setPools(data); setLoading(false); });
  }, []);

  const totalTVL = pools.reduce((sum, p) => sum + p.tvl, 0);
  const totalPlayers = pools.reduce((sum, p) => sum + p.playerCount, 0);

  async function handleCreatePool() {
    if (!publicKey) { setVisible(true); return; }
    setCreating(true);
    setMessage(null);
    try {
      const tx = await createPool(publicKey);
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setMessage("Pool created! Refreshing...");
      const data = await getAllPools();
      setPools(data);
    } catch (e: any) {
      setMessage("Error: " + e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "48px 0 40px" }}>
        <div style={{ display: "inline-block", padding: "4px 14px", background: "var(--accent-dim)", border: "1px solid var(--border)", borderRadius: 20, fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>X1 Testnet</div>
        <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>THEO <span style={{ color: "var(--accent)", textShadow: "0 0 30px rgba(252,163,17,0.4)" }}>Staking Pools</span></h1>
        <p style={{ fontSize: 17, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto 0", lineHeight: 1.7 }}>Stake THEO tokens, survive the full duration, and split the penalty pot with other survivors.</p>
      </div>

      {/* Stats bar */}
      {!loading && pools.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 40, padding: "20px 24px", background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border-subtle)" }}>
          <StatItem label="Total Value Locked" value={`${(totalTVL / 1000).toFixed(0)}k THEO`} />
          <StatItem label="Active Pools" value={`${pools.length}`} center />
          <StatItem label="Total Stakers" value={`${totalPlayers.toLocaleString()}`} right />
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", marginBottom: 16, background: message.startsWith("Error") ? "rgba(231,76,60,0.1)" : "rgba(46,204,113,0.1)", border: `1px solid ${message.startsWith("Error") ? "rgba(231,76,60,0.3)" : "rgba(46,204,113,0.3)"}`, color: message.startsWith("Error") ? "var(--danger)" : "var(--success)", fontSize: 13 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
          <div className="spinner" style={{ margin: "0 auto 12px", width: 28, height: 28 }} />
          <p>Loading pools…</p>
        </div>
      ) : pools.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: "center", padding: "60px 24px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏊</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>No Active Pools</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 28, maxWidth: 400, margin: "0 auto 28px" }}>
            There are no pools running right now. Create one to start the game — it's permissionless, anyone can do it!
          </p>
          <button className="btn btn-primary" onClick={handleCreatePool} disabled={creating} style={{ padding: "14px 32px", fontSize: 16 }}>
            {creating ? <><span className="spinner" /> Creating Pool…</> : "🆕 Create New Pool"}
          </button>
          {!publicKey && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>Connect your wallet first</p>}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 32 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
                  {["Pool", "TVL", "APR", "Min Stake", "Players", ""].map((h, i) => (
                    <th key={i} style={{ padding: "14px 20px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pools.map((pool, idx) => <PoolTableRow key={pool.id} pool={pool} isLast={idx === pools.length - 1} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
            {pools.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
          </div>

          {/* Create pool button */}
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <button className="btn btn-secondary" onClick={handleCreatePool} disabled={creating} style={{ fontSize: 14 }}>
              {creating ? <><span className="spinner" /> Creating…</> : "🆕 Create New Pool"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatItem({ label, value, center, right }: { label: string; value: string; center?: boolean; right?: boolean; }) {
  return (
    <div style={{ textAlign: center ? "center" : right ? "right" : "left" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function PoolTableRow({ pool, isLast }: { pool: Pool; isLast: boolean }) {
  return (
    <tr style={{ borderBottom: isLast ? "none" : "1px solid var(--border-subtle)", transition: "background 0.15s", cursor: "pointer" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-card-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
      onClick={() => (window.location.href = `/pool/${pool.id}`)}>
      <td style={{ padding: "16px 20px" }}><div style={{ fontWeight: 700, fontSize: 15 }}>{pool.name}</div><div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{pool.playerCount} stakers</div></td>
      <td style={{ padding: "16px 20px", textAlign: "right", fontWeight: 600 }}>{(pool.tvl / 1000).toFixed(1)}k THEO</td>
      <td style={{ padding: "16px 20px", textAlign: "right", fontWeight: 700, color: "var(--accent)", fontSize: 16 }}>{pool.apr.toFixed(1)}%</td>
      <td style={{ padding: "16px 20px", textAlign: "right", color: "var(--text-secondary)" }}>{pool.minStake} THEO</td>
      <td style={{ padding: "16px 20px", textAlign: "right", color: "var(--text-secondary)" }}>{pool.playerCount.toLocaleString()}</td>
      <td style={{ padding: "16px 20px", textAlign: "right" }}><span style={{ padding: "5px 14px", background: "var(--accent-dim)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>View →</span></td>
    </tr>
  );
}
