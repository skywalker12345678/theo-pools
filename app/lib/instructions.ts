import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { PROGRAM_ID, RPC_ENDPOINT } from "./constants";
import { Pool, UserPosition } from "./types";
import IDL from "./idl.json";

const THEO_MINT = new PublicKey("8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ");
const DECIMALS = 100; // 2 decimals, 1 THEO = 100 raw

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

function getReadonlyProgram(): Program {
  const connection = getConnection();
  // Read-only provider — no wallet needed for fetching
  const provider = new AnchorProvider(
    connection,
    {} as Wallet,
    { commitment: "confirmed" }
  );
  return new Program(IDL as any, PROGRAM_ID, provider);
}

function poolPDA(poolId: number): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(poolId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), idBuf],
    PROGRAM_ID
  );
  return pda;
}

function positionPDA(poolId: number, player: PublicKey): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(poolId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), idBuf, player.toBuffer()],
    PROGRAM_ID
  );
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
  if (status.closed !== undefined) return "Closed";
  return "Closed";
}

function mapPoolAccount(account: any, poolId: number): Pool {
  const status = statusToString(account.status);
  const tvlRaw = account.penaltyVaultBalance?.toNumber() ?? 0;
  const playerCount = account.playerCount ?? 0;
  const survivorCount = account.survivorCount ?? 0;
  const endTime = account.endTime?.toNumber() ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = Math.max(0, (endTime - now) / 86400);
  // Simple APR estimate based on penalty pool
  const apr = survivorCount > 0 && playerCount > 0
    ? ((playerCount - survivorCount) / playerCount) * 50
    : 0;

  return {
    id: String(poolId),
    name: `Pool #${poolId}`,
    description: status === "Active"
      ? `Active pool — ${survivorCount} survivors remaining. Game ends ${new Date(endTime * 1000).toLocaleDateString()}.`
      : status === "Filling"
      ? `Filling pool — ${playerCount}/5 players joined. Stake 0.20 THEO to enter.`
      : status === "Claiming"
      ? `Claim window open! Survivors can claim their rewards.`
      : `Pool ${status.toLowerCase()}.`,
    tvl: (tvlRaw + playerCount * 20) / DECIMALS,
    apr,
    minStake: 0.20,
    maxStake: 1000,
    playerCount,
    survivorCount,
    penaltyVaultBalance: tvlRaw / DECIMALS,
    isActive: status === "Active" || status === "Filling" || status === "Claiming",
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
    // Fetch global state to get pool count
    const globalState = await (program.account as any).globalState.fetch(globalStatePDA());
    const poolCount = globalState.poolCount?.toNumber() ?? 0;

    const pools: Pool[] = [];
    for (let i = 0; i < poolCount; i++) {
      try {
        const pda = poolPDA(i);
        const account = await (program.account as any).pool.fetch(pda);
        const pool = mapPoolAccount(account, i);
        // Only show active pools
        if (pool.status !== "Closed" && pool.status !== "Finalized") {
          pools.push(pool);
        }
      } catch {
        // Pool doesn't exist or is closed, skip
      }
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
    const pda = poolPDA(Number(poolId));
    const account = await (program.account as any).pool.fetch(pda);
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
        const posPda = positionPDA(i, wallet);
        const pos = await (program.account as any).userPosition.fetch(posPda);
        if (!pos.withdrewFilling) {
          const poolPda = poolPDA(i);
          const poolAcc = await (program.account as any).pool.fetch(poolPda);
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
      } catch {
        // No position in this pool
      }
    }
    return positions;
  } catch (e) {
    console.error("getUserPositions error:", e);
    return [];
  }
}

// Transaction builders (to be signed by wallet in the app)
export async function getConnection2() { return getConnection(); }
