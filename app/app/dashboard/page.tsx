"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getUserPositions } from "@/lib/instructions";
import { StakePosition } from "@/components/StakePosition";
import { UserPosition } from "@/lib/types";
export default function DashboardPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchPositions = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    const data = await getUserPositions(publicKey);
    setPositions(data);
    setLoading(false);
  }, [publicKey]);
  useEffect(() => { fetchPositions(); }, [fetchPositions]);
  const totalStaked = positions.reduce((s, p) => s + p.stakedAmount, 0);
  const totalRewards = positions.filter(p => !p.claimed && !p.exitedEarly && p.lockupEnds && Math.floor(Date.now()/1000) > p.lockupEnds && Math.floor(Date.now()/1000) < p.lockupEnds + 5*24*60*60).reduce((s, p) => s + p.claimableRewards, 0);
  if (!publicKey) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <div style={{ width: 72, height: 72, background: "var(--accent-dim)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>🔐</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>Connect Your Wallet</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 28, maxWidth: 400, margin: "0 auto 28px" }}>Connect your Backpack, X1 Wallet, Phantom, or Solflare wallet to view your staking positions.</p>
        <button className="btn btn-primary" onClick={() => setVisible(true)} style={{ padding: "12px 28px", fontSize: 15 }}>Connect Wallet</button>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>My Dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "monospace" }}>{publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-8)}</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchPositions} disabled={loading} style={{ fontSize: 13 }}>{loading ? <><span className="spinner" /> Refreshing…</> : "↻ Refresh"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <SummaryCard label="Total Staked" value={`${totalStaked.toLocaleString()}`} unit="THEO" />
        <SummaryCard label="Claimable Rewards" value={totalRewards.toFixed(4)} unit="THEO" accent />
        <SummaryCard label="Active Pools" value={`${positions.length}`} unit="" />
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}><div className="spinner" style={{ margin: "0 auto 12px", width: 24, height: 24 }} /><p>Loading positions…</p></div>
      ) : positions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏊</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Active Stakes</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20 }}>You haven&apos;t joined any pools yet.</p>
          <Link href="/" className="btn btn-primary">Browse Pools</Link>
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "var(--text-secondary)" }}>Active Positions ({positions.length})</h2>
          <div style={{ display: "grid", gap: 16 }}>{positions.map((pos) => <StakePosition key={pos.poolId} position={pos} onRefresh={fetchPositions} />)}</div>
        </div>
      )}
      {positions.length > 0 && (
        <div style={{ marginTop: 32, padding: "20px 24px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Want to stake more?</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Explore more THEO pools and maximize your rewards.</div>
          </div>
          <Link href="/" className="btn btn-primary">Browse Pools →</Link>
        </div>
      )}
    </div>
  );
}
function SummaryCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean; }) {
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${accent ? "var(--border)" : "var(--border-subtle)"}`, borderRadius: "var(--radius)", padding: "20px 22px", boxShadow: accent ? "var(--shadow-accent)" : "none" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? "var(--accent)" : "var(--text-primary)" }}>{value}{unit && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)", marginLeft: 6 }}>{unit}</span>}</div>
    </div>
  );
}
