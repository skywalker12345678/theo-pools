import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

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

  const poolId = 0;
  const poolPDA      = getPDA([Buffer.from("pool"), poolIdBytes(poolId)], PROGRAM_ID);
  const poolVaultPDA = getPDA([Buffer.from("vault"), poolIdBytes(poolId)], PROGRAM_ID);
  const globalPDA    = getPDA([Buffer.from("global")], PROGRAM_ID);
  const rolloverPDA  = getPDA([Buffer.from("rollover_vault")], PROGRAM_ID);

  // Step 1: close stalled pool
  console.log("Closing stalled pool...");
  try {
    const tx1 = await (program.methods as any).closeStalledPool().accounts({
      authority:     provider.wallet.publicKey,
      globalState:   globalPDA,
      pool:          poolPDA,
      poolVault:     poolVaultPDA,
      tokenMint:     THEO_MINT,
      rolloverVault: rolloverPDA,
      tokenProgram:  TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("✓ Pool closed! tx:", tx1);
  } catch (e: any) {
    console.log("Close failed (may already be closed):", e.message);
  }

  // Step 2: withdraw for authority wallet
  console.log("Withdrawing...");
  const playerTokenAccount = await getAssociatedTokenAddress(
    THEO_MINT, provider.wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const posPDA = getPDA([Buffer.from("position"), poolIdBytes(poolId), provider.wallet.publicKey.toBuffer()], PROGRAM_ID);

  const tx2 = await (program.methods as any).withdraw().accounts({
    player:             provider.wallet.publicKey,
    globalState:        globalPDA,
    pool:               poolPDA,
    userPosition:       posPDA,
    tokenMint:          THEO_MINT,
    playerTokenAccount,
    poolVault:          poolVaultPDA,
    rolloverVault:      rolloverPDA,
    tokenProgram:       TOKEN_2022_PROGRAM_ID,
    systemProgram:      SystemProgram.programId,
  }).rpc();
  console.log("✓ Withdrawn! tx:", tx2);
}

main().catch(console.error);
