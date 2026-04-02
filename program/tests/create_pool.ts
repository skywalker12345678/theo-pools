import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J");
const THEO_MINT  = new PublicKey("8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ");

function poolIdBytes(id: number): Buffer {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id)); return buf;
}
function getPDA(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const idl = require("../target/idl/theo_commitment_pool.json");
  const program = new anchor.Program(idl, provider);

  const globalStatePDA = getPDA([Buffer.from("global")], PROGRAM_ID);
  const gs = await (program.account as any).globalState.fetch(globalStatePDA);
  const poolId = Number(gs.poolCount);

  const poolPDA      = getPDA([Buffer.from("pool"), poolIdBytes(poolId)], PROGRAM_ID);
  const poolVaultPDA = getPDA([Buffer.from("vault"), poolIdBytes(poolId)], PROGRAM_ID);

  console.log("=== Create Pool ===");
  console.log("Pool ID:", poolId);
  console.log("Pool PDA:", poolPDA.toBase58());

  const tx = await (program.methods as any).createPool().accounts({
    authority:     provider.wallet.publicKey,
    globalState:   globalStatePDA,
    pool:          poolPDA,
    poolVault:     poolVaultPDA,
    tokenMint:     THEO_MINT,
    rolloverVault: getPDA([Buffer.from("rollover_vault")], PROGRAM_ID),
    tokenProgram:  TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).rpc();

  console.log("✓ Pool created! tx:", tx);
  const pool = await (program.account as any).pool.fetch(poolPDA);
  console.log("Status:", Object.keys(pool.status)[0]);
  console.log("Fill deadline:", new Date(Number(pool.fillDeadline) * 1000).toLocaleString());
}

main().catch(console.error);
