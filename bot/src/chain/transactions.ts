import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { THEO_MINT, PDAs, connection, getReadonlyProvider } from "./client";

async function ata(player: PublicKey) {
  return getAssociatedTokenAddress(THEO_MINT, player, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}
async function makeTx(player: PublicKey, ix: any): Promise<Transaction> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: player });
  tx.add(ix); return tx;
}

export async function buildDepositTx(player: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.deposit().accounts({
    player, globalState: PDAs.globalState(), pool: PDAs.pool(poolId),
    userPosition: PDAs.position(poolId, player), tokenMint: THEO_MINT,
    playerTokenAccount: await ata(player), poolVault: PDAs.vault(poolId),
    tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
  } as any).instruction();
  return makeTx(player, ix);
}

export async function buildWithdrawTx(player: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.withdraw().accounts({
    player, globalState: PDAs.globalState(), pool: PDAs.pool(poolId),
    userPosition: PDAs.position(poolId, player), tokenMint: THEO_MINT,
    playerTokenAccount: await ata(player), poolVault: PDAs.vault(poolId),
    rolloverVault: PDAs.rolloverVault(), tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
  } as any).instruction();
  return makeTx(player, ix);
}

export async function buildEarlyExitTx(player: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.earlyExit().accounts({
    player, pool: PDAs.pool(poolId), userPosition: PDAs.position(poolId, player),
    tokenMint: THEO_MINT, playerTokenAccount: await ata(player),
    poolVault: PDAs.vault(poolId), tokenProgram: TOKEN_2022_PROGRAM_ID,
  } as any).instruction();
  return makeTx(player, ix);
}

export async function buildClaimTx(player: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.claim().accounts({
    player, pool: PDAs.pool(poolId), userPosition: PDAs.position(poolId, player),
    tokenMint: THEO_MINT, playerTokenAccount: await ata(player),
    poolVault: PDAs.vault(poolId), tokenProgram: TOKEN_2022_PROGRAM_ID,
  } as any).instruction();
  return makeTx(player, ix);
}

export function serializeTx(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

export async function buildCreatePoolTx(creator: PublicKey): Promise<Transaction> {
  const program = getReadonlyProvider();
  const { globalState, rolloverVault } = { globalState: PDAs.globalState(), rolloverVault: PDAs.rolloverVault() };
  const gs = await (program.account as any).globalState.fetch(globalState);
  const poolId = Number(gs.poolCount);
  const ix = await program.methods.createPool().accounts({
    creator, globalState, pool: PDAs.pool(poolId), tokenMint: THEO_MINT,
    rolloverVault, poolVault: PDAs.vault(poolId),
    tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
  } as any).instruction();
  return makeTx(creator, ix);
}

export async function buildCloseStalledPoolTx(caller: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.closeStalledPool().accounts({
    caller, globalState: PDAs.globalState(), pool: PDAs.pool(poolId),
    systemProgram: SystemProgram.programId,
  } as any).instruction();
  return makeTx(caller, ix);
}

export async function buildFinalizeTx(caller: PublicKey, poolId: number): Promise<Transaction> {
  const program = getReadonlyProvider();
  const ix = await program.methods.finalize().accounts({
    caller, globalState: PDAs.globalState(), pool: PDAs.pool(poolId),
    tokenMint: THEO_MINT, poolVault: PDAs.vault(poolId),
    rolloverVault: PDAs.rolloverVault(), tokenProgram: TOKEN_2022_PROGRAM_ID,
  } as any).instruction();
  return makeTx(caller, ix);
}
