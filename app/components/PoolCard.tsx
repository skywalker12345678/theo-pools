"use client";

import Link from "next/link";
import { Pool } from "@/lib/types";

interface PoolCardProps {
  pool: Pool;
}

export function PoolCard({ pool }: PoolCardProps) {
  return (
    <Link href={`/pool/${pool.id}`} style={{ display: "block" }}>
      <div
        className="card"
        style={{
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Accent top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "var(--accent)",
            borderRadius: "var(--radius) var(--radius) 0 0",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
            marginTop: 8,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {pool.name}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                maxWidth: 260,
                lineHeight: 1.5,
              }}
            >
              {pool.description}
            </p>
          </div>
          <span className="badge badge-green" style={{ marginLeft: 12, flexShrink: 0 }}>
            ● Active
          </span>
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 16,
          }}
        >
          <Stat label="TVL" value={`${(pool.tvl / 1000).toFixed(1)}k`} unit="XNT" />
          <Stat
            label="APR"
            value={`${pool.apr.toFixed(1)}`}
            unit="%"
            highlight
          />
          <Stat label="Min Stake" value={`${pool.minStake}`} unit="XNT" />
          <Stat label="Players" value={`${pool.playerCount}`} unit="" />
        </div>

        {/* Join CTA */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <span
            style={{
              fontSize: 13,
              color: "var(--accent)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View Pool →
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: highlight ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}
        {unit && (
          <span
            style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)", marginLeft: 3 }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
