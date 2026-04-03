import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID, RPC_ENDPOINT } from "./constants";
import { Pool, UserPosition } from "./types";
import IDL from "./idl.json";

const THEO_MINT = new PublicKey("8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ");
const DECIMALS = 100;

// ── Connection & Program ─────────────────────────────────────────
export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

function getReadonlyProgram(): Program {
  const connection = getConnection();
  const wallet = new Wallet(PublicKey.default as any);
  const provider = new AnchorProvider(connection, {} as Wallet, { commitment: "confirmed" });
  return new Program(IDL as any, provider);
}

// ── PDAs ─────────────────────────────────────────────────────────
function poolIdBytes(id: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(id));
  return buf;
}

const PDAs = {
  globalState:   () => PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID)[0],
  rolloverVault: () => PublicKey.findProgramAddressSync([Buffer.from("rollover_vault")], PROGRAM_ID)[0],
  pool:          (id: number) => PublicKey.findProgramAddressSync([Buffer.from("pool"), poolIdBytes(id)], PROGRAM_ID)[0],
  vault:         (id: number) => PublicKey.findProgramAddressSync([Buffer.from("vault"), poolIdBytes(id)], PROGRAM_ID)[0],
  position:      (poolId: number, player: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("position"), poolIdBytes(poolId), player.toBuffer()], PROGRAM_ID)[0],
};

async function ata(player: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(THEO_MINT, player, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

async function makeTx(player: PublicKey, ix: any): Promise<Transaction> {
  const connection = getConnection();
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: player });
  tx.add(ix);
  return tx;
}

// ── Data Fetching ────────────────────────────────────────────────
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
  const apr = survivorCount > 0 && playerCount > 0
    ? ((playerCount - survivorCount) / playerCount) * 50
    : 0;
  return {
    id: String(poolId),
    name: `Pool #${poolId}`,
    description: status === "Active"
      ? `Active — ${survivorCount} survivors. Game ends ${new Date(endTime * 1000).toLocaleDateString()}.`
      : status === "Filling"
      ? `Filling — ${playerCount}/5 players. Stake 0.20 THEO to enter.`
      : status === "Claiming"
      ? `Claim window open! Survivors can claim rewards.`
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
    const globalState = await (program.account as any).globalState.fetch(PDAs.globalState());
    const poolCount = globalState.poolCount?.toNumber() ?? 0;
    const pools: Pool[] = [];
    for (let i = 0; i < poolCount; i++) {
      try {
        const account = await (program.account as any).pool.fetch(PDAs.pool(i));
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
    const account = await (program.account as any).pool.fetch(PDAs.pool(Number(poolId)));
    return mapPoolAccount(account, Number(poolId));
  } catch (e) {
    console.error("getPoolState error:", e);
    return null;
  }
}

export async function getUserPositions(wallet: PublicKey): Promise<UserPosition[]> {
  try {
    const program = getReadonlyProgram();
    const globalState = await (program.account as any).globalState.fetch(PDAs.globalState());
    const poolCount = globalState.poolCount?.toNumber() ?? 0;
    const positions: UserPosition[] = [];
    for (let i = 0; i < poolCount; i++) {
      try {
        const pos = await (program.account as any).userPosition.fetch(PDAs.position(i, wallet));
        if (!pos.withdrewFilling) {
          const poolAcc = await (program.account as any).pool.fetch(PDAs.pool(i));
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

// ── Transaction Builders ─────────────────────────────────────────
export async function joinPool(poolId: string, amount: number, wallet: PublicKey): Promise<Transaction> {
  const program = getReadonlyProgram();
  const id = Number(poolId);
  const ix = await (program.methods as any).deposit().accounts({
    player: wallet,
    globalState: PDAs.globalState(),
    pool: PDAs.pool(id),
    userPosition: PDAs.position(id, wallet),
    tokenMint: THEO_MINT,
    playerTokenAccount: await ata(wallet),
    poolVault: PDAs.vault(id),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction();
  return makeTx(wallet, ix);
}

export async function exitPool(poolId: string, wallet: PublicKey): Promise<Transaction> {
  const program = getReadonlyProgram();
  const id = Number(poolId);
  const ix = await (program.methods as any).earlyExit().accounts({
    player: wallet,
    pool: PDAs.pool(id),
    userPosition: PDAs.position(id, wallet),
    tokenMint: THEO_MINT,
    playerTokenAccount: await ata(wallet),
    poolVault: PDAs.vault(id),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  }).instruction();
  return makeTx(wallet, ix);
}

export async function claimRewards(poolId: string, wallet: PublicKey): Promise<Transaction> {
  const program = getReadonlyProgram();
  const id = Number(poolId);
  const ix = await (program.methods as any).claim().accounts({
    player: wallet,
    pool: PDAs.pool(id),
    userPosition: PDAs.position(id, wallet),
    tokenMint: THEO_MINT,
    playerTokenAccount: await ata(wallet),
    poolVault: PDAs.vault(id),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  }).instruction();
  return makeTx(wallet, ix);
}

export async function createPool(wallet: PublicKey): Promise<Transaction> {
  const program = getReadonlyProgram();
  const globalState = await (program.account as any).globalState.fetch(PDAs.globalState());
  const poolId = Number(globalState.poolCount);
  const ix = await (program.methods as any).createPool().accounts({
    creator: wallet,
    globalState: PDAs.globalState(),
    pool: PDAs.pool(poolId),
    tokenMint: THEO_MINT,
    rolloverVault: PDAs.rolloverVault(),
    poolVault: PDAs.vault(poolId),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction();
  return makeTx(wallet, ix);
}

export async function finalize(poolId: string, wallet: PublicKey): Promise<Transaction> {
  const program = getReadonlyProgram();
  const id = Number(poolId);
  const ix = await (program.methods as any).finalize().accounts({
    caller: wallet,
    globalState: PDAs.globalState(),
    pool: PDAs.pool(id),
    tokenMint: THEO_MINT,
    poolVault: PDAs.vault(id),
    rolloverVault: PDAs.rolloverVault(),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  }).instruction();
  return makeTx(wallet, ix);
}
