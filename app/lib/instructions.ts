import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PROGRAM_ID, RPC_ENDPOINT } from "./constants";
import { Pool, UserPosition } from "./types";
import IDL from "./idl.json";

const THEO_MINT = new PublicKey("8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ");
const DECIMALS = 100;

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

function getReadonlyProgram(): Program {
  const connection = getConnection();
  const provider = new AnchorProvider(connection, {} as Wallet, { commitment: "confirmed" });
  return new Program(IDL as any, provider);
}

function poolPDA(poolId: number): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(poolId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("pool"), idBuf], PROGRAM_ID);
  return pda;
}

function positionPDA(poolId: number, player: PublicKey): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(poolId));
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("position"), idBuf, player.toBuffer()], PROGRAM_ID);
  return pda;
}

function globalStatePDA(): PublicKey {
  return new PublicKey("4gMN5x1tQpGeEPk6pmD84JWvxYaZtpJ7UD79ueuCmp8x");
}

function statusToString(status: any): Pool["status"] {
  if (status.filling !== undefined) return "Filling";
  if (status.active !== undefined) return "Active";
  if (status.claiming !== undefined) return "Claiming";
  if (status.finalized !== undefined) return "Finalized";
  return "Closed";
}

function mapPoolAccount(account: any, poolId: number): Pool {
  const status = statusToString(account.status);
  const playerCount = account.playerCount ?? 0;
  const survivorCount = account.survivorCount ?? 0;
  const endTime = account.endTime?.toNumber() ?? 0;
  const penaltyRaw = account.penaltyVaultBalance?.toNumber() ?? 0;
  const apr = survivorCount > 0 && playerCount > 0 ? ((playerCount - survivorCount) / playerCount) * 50 : 0;
  return {
    id: String(poolId),
    name: `Pool #${poolId}`,
    description: status === "Active" ? `Active — ${survivorCount} survivors. Game ends ${new Date(endTime * 1000).toLocaleDateString()}.`
      : status === "Filling" ? `Filling — ${playerCount}/5 players. Stake 0.20 THEO to enter.`
      : status === "Claiming" ? `Claim window open! Survivors can claim rewards.`
      : `Pool ${status.toLowerCase()}.`,
    tvl: (penaltyRaw + playerCount * 20) / DECIMALS,
    apr,
    minStake: 0.20,
    maxStake: 1000,
    playerCount,
    survivorCount,
    penaltyVaultBalance: penaltyRaw / DECIMALS,
    isActive: ["Active", "Filling", "Claiming"].includes(status),
    status,
    createdAt: account.startTime?.toNumber() ?? 0,
    startTime: account.startTime?.toNumber() ?? 0,
    endTime,
    claimDeadline: account.claimDeadline?.toNumber() ?? 0,
    rewardPerSurvivor: (account.rewardPerSurvivor?.toNumber() ?? 0) / DECIMALS,
    stakeMint: THEO_MINT.toBase58(),
  };
}

export async function getAllPools(): Promise<Pool[]> {
  try {
    const program = getReadonlyProgram();
    const globalState = await (program.account as any).globalState.fetch(globalStatePDA());
    const poolCount = globalState.poolCount?.toNumber() ?? 0;
    const pools: Pool[] = [];
    for (let i = 0; i < poolCount; i++) {
      try {
        const account = await (program.account as any).pool.fetch(poolPDA(i));
        const pool = mapPoolAccount(account, i);
        if (!["Closed", "Finalized"].includes(pool.status)) pools.push(pool);
      } catch { }
    }
    return pools;
  } catch (e) {
    console.error("getAllPools error:", e);
    return [];
  }
}

export async function getPoolState(poolId: string): Promise<Pool | null> {
  try {
    const program = getReadonlyProgram();
    const account = await (program.account as any).pool.fetch(poolPDA(Number(poolId)));
    return mapPoolAccount(account, Number(poolId));
  } catch (e) {
    console.error("getPoolState error:", e);
    return null;
  }
}

export async function getUserPositions(wallet: PublicKey): Promise<UserPosition[]> {
  try {
    const program = getReadonlyProgram();
    const globalState = await (program.account as any).globalState.fetch(globalStatePDA());
    const poolCount = globalState.poolCount?.toNumber() ?? 0;
    const positions: UserPosition[] = [];
    for (let i = 0; i < poolCount; i++) {
      try {
        const pos = await (program.account as any).userPosition.fetch(positionPDA(i, wallet));
        if (!pos.withdrewFilling) {
          const poolAcc = await (program.account as any).pool.fetch(poolPDA(i));
          const pool = mapPoolAccount(poolAcc, i);
          positions.push({
            poolId: String(i),
            poolName: pool.name,
            stakedAmount: (pos.amount?.toNumber() ?? 0) / DECIMALS,
            claimableRewards: pool.rewardPerSurvivor,
            entryTimestamp: pos.depositedAt?.toNumber() ?? 0,
            exitedEarly: pos.exitedEarly ?? false,
            claimed: pos.claimed ?? false,
            redistributionCollected: pos.redistributionCollected ?? false,
            lockupEnds: pool.endTime,
          });
        }
      } catch { }
    }
    return positions;
  } catch (e) {
    console.error("getUserPositions error:", e);
    return [];
  }
}

export async function joinPool(poolId: string, amount: number, wallet: PublicKey): Promise<any> {
  console.warn("joinPool: transaction signing not yet implemented");
  return null;
}

export async function exitPool(poolId: string, wallet: PublicKey): Promise<any> {
  console.warn("exitPool: transaction signing not yet implemented");
  return null;
}

export async function claimRewards(poolId: string, wallet: PublicKey): Promise<any> {
  console.warn("claimRewards: transaction signing not yet implemented");
  return null;
}
