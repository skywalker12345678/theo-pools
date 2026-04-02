import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TheoCommitmentPool } from "../target/types/theo_commitment_pool";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// ── Config ────────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey("9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J");
const THEO_MINT    = new PublicKey("8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ"); // Token-2022 testnet mint

function getPDA(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TheoCommitmentPool as Program<TheoCommitmentPool>;

  const globalStatePDA   = getPDA([Buffer.from("global")], PROGRAM_ID);
  const rolloverVaultPDA = getPDA([Buffer.from("rollover_vault")], PROGRAM_ID);

  console.log("=== THEO Commitment Pool — Testnet Init ===");
  console.log("Program ID:      ", PROGRAM_ID.toBase58());
  console.log("THEO Mint:       ", THEO_MINT.toBase58());
  console.log("GlobalState PDA: ", globalStatePDA.toBase58());
  console.log("Rollover Vault:  ", rolloverVaultPDA.toBase58());
  console.log("Authority:       ", provider.wallet.publicKey.toBase58());
  console.log("");

  // Check if already initialized
  try {
    const existing = await program.account.globalState.fetch(globalStatePDA);
    console.log("⚠️  Already initialized!");
    console.log("   rollover_balance:", existing.rolloverBalance.toString());
    console.log("   pool_count:      ", existing.poolCount.toString());
    console.log("   authority:       ", existing.authority.toBase58());
    return;
  } catch {
    console.log("Not yet initialized — proceeding...");
  }

  const tx = await program.methods.initialize().accounts({
    authority:      provider.wallet.publicKey,
    globalState:    globalStatePDA,
    tokenMint:      THEO_MINT,
    rolloverVault:  rolloverVaultPDA,
    tokenProgram:   TOKEN_2022_PROGRAM_ID,
    systemProgram:  SystemProgram.programId,
  } as any).rpc();

  console.log("✓ Initialize tx:", tx);

  // Verify
  const gs = await program.account.globalState.fetch(globalStatePDA);
  console.log("\n=== GlobalState ===");
  console.log("rollover_balance:", gs.rolloverBalance.toString());
  console.log("pool_count:      ", gs.poolCount.toString());
  console.log("rollover_vault:  ", gs.rolloverVault.toBase58());
  console.log("token_mint:      ", gs.tokenMint.toBase58());
  console.log("authority:       ", gs.authority.toBase58());
  console.log("\n✓ Protocol initialized on testnet!");
}

main().catch(console.error);
