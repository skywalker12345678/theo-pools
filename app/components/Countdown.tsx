"use client";
import { useEffect, useState } from "react";

export function Countdown({ targetTime, label }: { targetTime: number; label: string }) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, targetTime - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, targetTime - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  const hours = Math.floor(timeLeft / 3600);
  const mins = Math.floor((timeLeft % 3600) / 60);
  const secs = timeLeft % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (timeLeft === 0) return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(231,76,60,0.15)", border: "1px solid rgba(231,76,60,0.4)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>
      ⏰ {label} — Time's up!
    </div>
  );

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {hours > 0 && <><span style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{pad(hours)}</span><span style={{ fontSize: 12, color: "var(--text-muted)" }}>h</span></>}
        <span style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{pad(mins)}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>m</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: timeLeft < 60 ? "var(--danger)" : "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{pad(secs)}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>s</span>
      </div>
    </div>
  );
}
