import { getReadonlyProvider, PDAs, connection } from "./client";
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export interface PoolInfo {
  id: number; status: string; playerCount: number; survivorCount: number;
  penaltyVaultBalance: number; vaultBalance: bigint;
  fillDeadline: number; gameEndTime: number; claimDeadline: number;
}

export async function fetchAllPools(): Promise<PoolInfo[]> {
  const program = getReadonlyProvider();
  const gs = await (program.account as any).globalState.fetch(PDAs.globalState());
  const poolCount = Number(gs.poolCount);
  const pools: PoolInfo[] = [];
  for (let i = 0; i < poolCount; i++) {
    try {
      const pool = await (program.account as any).pool.fetch(PDAs.pool(i));
      let vaultBalance = 0n;
      try { const v = await getAccount(connection, PDAs.vault(i), "confirmed", TOKEN_2022_PROGRAM_ID); vaultBalance = v.amount; } catch {}
      const status = Object.keys(pool.status)[0];
      pools.push({ id: i, status, playerCount: pool.playerCount, survivorCount: pool.survivorCount,
        penaltyVaultBalance: Number(pool.penaltyVaultBalance), vaultBalance,
        fillDeadline: Number(pool.fillDeadline), gameEndTime: Number(pool.endTime), claimDeadline: Number(pool.claimDeadline) });
    } catch {}
  }
  return pools;
}

export async function fetchGlobalState() {
  return await ((getReadonlyProvider()).account as any).globalState.fetch(PDAs.globalState());
}

export function formatTime(s: number): string {
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s/60) + "m " + (s%60) + "s";
  return Math.floor(s/3600) + "h " + Math.floor((s%3600)/60) + "m";
}

export function formatPool(p: PoolInfo): string {
  const now = Math.floor(Date.now()/1000);
  let t = "";
  if (p.status === "filling" && p.fillDeadline > 0) t = "\nFill expires in: " + formatTime(Math.max(0, p.fillDeadline - now));
  else if (p.status === "active" && p.gameEndTime > 0) t = "\nGame ends in: " + formatTime(Math.max(0, p.gameEndTime - now));
  else if (p.status === "claiming" && p.claimDeadline > 0) t = "\nClaim window: " + formatTime(Math.max(0, p.claimDeadline - now));
  const e: Record<string,string> = { filling:"🟡", active:"🟢", claiming:"🏆", closed:"🔴", finalized:"⚫" };
  return (e[p.status]||"⚪") + " *Pool #" + p.id + "*\nStatus: " + p.status.toUpperCase() + "\nPlayers: " + p.playerCount + "\nVault: " + (Number(p.vaultBalance)/100).toFixed(2) + " THEO" + t;
}
