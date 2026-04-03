"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getPoolState } from "@/lib/instructions";
import { JoinModal } from "@/components/JoinModal";
import { Pool } from "@/lib/types";
import { PROGRAM_ID } from "@/lib/constants";
export default function PoolDetailClient() {
  const params = useParams();
  const poolId = params.id as string;
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [joined, setJoined] = useState(false);
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  useEffect(() => {
    if (poolId) { getPoolState(poolId).then((data) => { setPool(data); setLoading(false); }); }
  }, [poolId]);
  if (loading) return <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-muted)" }}><div className="spinner" style={{ margin: "0 auto 12px", width: 28, height: 28 }} /><p>Loading pool…</p></div>;
  if (!pool) return <div style={{ textAlign: "center", padding: "100px 0" }}><div style={{ fontSize: 40, marginBottom: 16 }}>🕳️</div><h2 style={{ fontSize: 22, marginBottom: 8 }}>Pool Not Found</h2><p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Pool <code>{poolId}</code> does not exist on-chain.</p><Link href="/" className="btn btn-primary">← Back to Pools</Link></div>;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: 14 }}>Pools</Link>
        <span style={{ color: "var(--text-muted)" }}>›</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{pool.name}</span>
      </div>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 32, marginBottom: 24, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, background: "radial-gradient(circle, rgba(252,163,17,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800 }}>{pool.name}</h1>
              <span className="badge badge-green">● Active</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 500 }}>{pool.description}</p>
          </div>
          {joined ? (
            <div style={{ padding: "12px 20px", background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.3)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontWeight: 700, fontSize: 14, textAlign: "center" }}>
              ✓ Joined!<div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}><Link href="/dashboard" style={{ color: "var(--success)" }}>View in Dashboard →</Link></div>
            </div>
          ) : (
            <button className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 16 }} onClick={() => { if (!publicKey) { setVisible(true); } else { setShowJoin(true); } }}>{publicKey ? "Join Pool" : "Connect to Join"}</button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border-subtle)" }}>
          {[
            { label: "APR", value: `${pool.apr.toFixed(1)}%`, accent: true },
            { label: "TVL", value: `${(pool.tvl / 1000).toFixed(1)}k THEO` },
            { label: "Min Stake", value: `${pool.minStake} THEO` },
            { label: "Stakers", value: `${pool.playerCount}` },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>On-Chain Details</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <DetailRow label="Program ID" value={PROGRAM_ID.toBase58()} mono explorer={`https://explorer.x1.xyz/address/${PROGRAM_ID.toBase58()}`} />
          <DetailRow label="Pool ID" value={pool.id} mono />
          {pool.poolAuthority && <DetailRow label="Pool Authority" value={pool.poolAuthority} mono />}
          {pool.stakeMint && <DetailRow label="Stake Token" value={pool.stakeMint} mono explorer={`https://explorer.x1.xyz/address/${pool.stakeMint}`} />}
          <DetailRow label="Max Stake" value={`${pool.maxStake.toLocaleString()} THEO`} />
          <DetailRow label="Created" value={new Date(pool.createdAt * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
        </div>
      </div>
      <div style={{ padding: "14px 18px", background: "var(--accent-dim)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--text-secondary)" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <span>This pool is deployed on <strong style={{ color: "var(--text-primary)" }}>X1 Testnet</strong>. Rewards are testnet tokens only. Always check the <a href={`https://explorer.x1.xyz/address/${PROGRAM_ID.toBase58()}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>program on-chain</a> before staking.</span>
      </div>
      {showJoin && <JoinModal pool={pool} onClose={() => setShowJoin(false)} onSuccess={() => { setShowJoin(false); setJoined(true); }} />}
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
