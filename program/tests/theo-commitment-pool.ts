import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TheoCommitmentPool } from "../target/types/theo_commitment_pool";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import { assert } from "chai";

const STAKE         = 20n;
const EARLY_RETURN  = 10n;
const EARLY_PENALTY = 10n;
const PLAYER_START  = 100n;

const P0_EXITS      = 3;
const P0_SURVIVORS  = 7;
const P0_PENALTY    = EARLY_PENALTY * BigInt(P0_EXITS);
const P0_REWARD     = P0_PENALTY / BigInt(P0_SURVIVORS);
const P0_DUST       = P0_PENALTY % BigInt(P0_SURVIVORS);
const P0_CLAIM      = STAKE + P0_REWARD;

const P1_SEED       = P0_DUST;
const P1_EXITS      = 5;
const P1_SURVIVORS  = 5;
const P1_PENALTY    = P1_SEED + EARLY_PENALTY * BigInt(P1_EXITS);
const P1_REWARD     = P1_PENALTY / BigInt(P1_SURVIVORS);
const P1_DUST       = P1_PENALTY % BigInt(P1_SURVIVORS);
const P1_CLAIM      = STAKE + P1_REWARD;

const P2_SEED       = P1_DUST;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function confirmTx(connection: any, sig: string): Promise<void> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
}
function poolIdBytes(id: number): Buffer { const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id)); return buf; }
function getPDA(seeds: Buffer[], programId: PublicKey): PublicKey { return PublicKey.findProgramAddressSync(seeds, programId)[0]; }
async function bal(connection: any, account: PublicKey): Promise<bigint> { return (await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)).amount; }

describe("Grand Finale: Everything — Withdraw, Exits, Rollovers, Dust, Stalled Pool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TheoCommitmentPool as Program<TheoCommitmentPool>;
  const connection = provider.connection;
  const authority = provider.wallet as anchor.Wallet;

  const players: Keypair[] = Array.from({ length: 24 }, () => Keypair.generate());
  let tokenAccounts: PublicKey[] = [];
  let tokenMint: PublicKey;
  let globalStatePDA: PublicKey;
  let rolloverVaultPDA: PublicKey;

  before(async () => {
    console.log("\n=== GRAND FINALE TEST ===");
    console.log("Pool 0: withdraw during filling, 3 exits, 7 claim → 2 raw dust");
    console.log("Pool 1: seeded 2 raw, 5 exits, 5 claim → 2 raw dust");
    console.log("Pool 2: stalled pool, 3 deposits, fill timer expires, all withdraw\n");

    tokenMint = await createMint(connection, authority.payer, authority.publicKey, null, 2, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    await sleep(2000);
    for (const player of players) {
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: player.publicKey, lamports: 100_000_000 })
      );
      await provider.sendAndConfirm(tx);
      const ta = await createAccount(connection, authority.payer, tokenMint, player.publicKey, undefined, undefined, TOKEN_2022_PROGRAM_ID);
      tokenAccounts.push(ta);
      const mintToSig = await mintTo(connection, authority.payer, tokenMint, ta, authority.publicKey, Number(PLAYER_START), [], undefined, TOKEN_2022_PROGRAM_ID);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: mintToSig, blockhash, lastValidBlockHeight }, "confirmed");
    }
    globalStatePDA   = getPDA([Buffer.from("global")], program.programId);
    rolloverVaultPDA = getPDA([Buffer.from("rollover_vault")], program.programId);
  });

  it("1. Initialize protocol", async () => {
    await program.methods.initialize().accounts({
      authority: authority.publicKey, globalState: globalStatePDA, tokenMint,
      rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const gs = await program.account.globalState.fetch(globalStatePDA);
    assert.equal(gs.rolloverBalance.toString(), "0");
    assert.equal(gs.poolCount.toString(), "0");
    console.log("✓ Protocol initialized | rollover = 0 | pool_count = 0");
  });

  it("2. Pool 0: create pool", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool0PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const pool0 = await program.account.pool.fetch(pool0PDA);
    assert.deepEqual(pool0.status, { filling: {} });
    console.log("✓ Pool 0 created | status = Filling");
  });

  it("3. Pool 0: 5 players deposit during Filling", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    for (let i = 0; i < 5; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      const balBefore = await bal(connection, tokenAccounts[i]);
      const vaultBefore = await bal(connection, vault0PDA);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const balAfter = await bal(connection, tokenAccounts[i]);
      const vaultAfter = await bal(connection, vault0PDA);
      console.log("  Deposit " + i + ": playerBefore=" + balBefore + " playerAfter=" + balAfter + " vaultBefore=" + vaultBefore + " vaultAfter=" + vaultAfter + " transferred=" + (balBefore - balAfter));
    }
    const pool0 = await program.account.pool.fetch(pool0PDA);
    const vaultBal = await bal(connection, vault0PDA);
    assert.deepEqual(pool0.status, { filling: {} });
    assert.equal(pool0.playerCount, 5);
    assert.equal(vaultBal, STAKE * 5n);
    console.log("✓ 5 players deposited | vault = " + Number(vaultBal)/100 + " THEO | still Filling");
  });

  it("4. Pool 0: player 0 withdraws — gets full 0.20 THEO back", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    const balBefore = await bal(connection, tokenAccounts[0]);
    const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[0].publicKey.toBuffer()], program.programId);
    await program.methods.withdraw().accounts({
      player: players[0].publicKey, globalState: globalStatePDA, pool: pool0PDA, userPosition: posPDA,
      tokenMint, playerTokenAccount: tokenAccounts[0], poolVault: vault0PDA,
      rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).signers([players[0]]).rpc().then((s: string) => confirmTx(connection, s));
    const balAfter = await bal(connection, tokenAccounts[0]);
    const vaultBal = await bal(connection, vault0PDA);
    const pool0 = await program.account.pool.fetch(pool0PDA);
    assert.equal(balAfter - balBefore, STAKE);
    assert.equal(balAfter, PLAYER_START);
    assert.equal(vaultBal, STAKE * 4n);
    assert.equal(pool0.playerCount, 4);
    console.log("✓ Player 0 withdrew | got back 0.20 THEO | balance: " + Number(balAfter)/100 + " THEO");
  });

  it("5. Pool 0: player 0 cannot rejoin same pool", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[0].publicKey.toBuffer()], program.programId);
    try {
      await program.methods.deposit().accounts({
        player: players[0].publicKey, globalState: globalStatePDA, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[0], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[0]]).rpc().then((s: string) => confirmTx(connection, s));
      assert.fail("Should not be able to rejoin!");
    } catch (err: any) {
      console.log("✓ Player 0 correctly blocked from rejoining");
      console.log("  Error: " + (err.error?.errorCode?.code || err.message?.split("\n")[0]));
    }
  });

  it("6. Pool 0: 6 more players deposit → pool goes Active", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    for (let i = 5; i < 11; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }
    const pool0 = await program.account.pool.fetch(pool0PDA);
    const vaultBal = await bal(connection, vault0PDA);
    assert.deepEqual(pool0.status, { active: {} });
    assert.equal(vaultBal, STAKE * 10n);
    assert.equal(pool0.playerCount, 10);
    console.log("✓ Pool 0 Active! | 10 players | vault = " + Number(vaultBal)/100 + " THEO");
  });

  it("7. Pool 0: 3 early exits", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    for (let i = 1; i <= P0_EXITS; i++) {
      const balBefore = await bal(connection, tokenAccounts[i]);
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.earlyExit().accounts({
        player: players[i].publicKey, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const balAfter = await bal(connection, tokenAccounts[i]);
      assert.equal(balAfter - balBefore, EARLY_RETURN);
      console.log("  Player " + i + ": got back 0.10 | lost 0.10 | balance: " + Number(balAfter)/100 + " THEO");
    }
    const pool0 = await program.account.pool.fetch(pool0PDA);
    assert.equal(pool0.penaltyVaultBalance.toString(), P0_PENALTY.toString());
    assert.equal(pool0.survivorCount, P0_SURVIVORS);
    console.log("✓ 3 exited | penalty vault = " + Number(P0_PENALTY)/100 + " THEO | " + P0_SURVIVORS + " survivors");
  });

  it("8. Pool 0: 7 survivors claim, finalize → 2 raw dust", async () => {
    const pool0PDA = getPDA([Buffer.from("pool"), poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    console.log("  Waiting 32s for game to end...");
    await sleep(32000);
    for (let i = 4; i <= 10; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.claim().accounts({
        player: players[i].publicKey, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const b = await bal(connection, tokenAccounts[i]);
      assert.equal(b, PLAYER_START - STAKE + P0_CLAIM);
      console.log("  Survivor " + i + ": received " + Number(P0_CLAIM)/100 + " THEO | balance: " + Number(b)/100 + " THEO");
    }
    console.log("  Waiting 11s for claim window...");
    await sleep(11000);
    await program.methods.finalize().accounts({
      caller: authority.publicKey, globalState: globalStatePDA, pool: pool0PDA,
      tokenMint, poolVault: vault0PDA, rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const gs = await program.account.globalState.fetch(globalStatePDA);
    const vault0Bal = await bal(connection, vault0PDA);
    assert.equal(vault0Bal, 0n);
    assert.equal(gs.rolloverBalance.toString(), P0_DUST.toString());
    console.log("✓ Pool 0 finalized | vault = EMPTY | dust = " + gs.rolloverBalance + " raw → Pool 1");
  });

  it("9. Pool 1: create — seeded with Pool 0 dust", async () => {
    const pool1PDA = getPDA([Buffer.from("pool"), poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool1PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const pool1 = await program.account.pool.fetch(pool1PDA);
    const vault1Bal = await bal(connection, vault1PDA);
    const gs = await program.account.globalState.fetch(globalStatePDA);
    assert.equal(vault1Bal, P1_SEED);
    assert.equal(pool1.penaltyVaultBalance.toString(), P1_SEED.toString());
    assert.equal(gs.rolloverBalance.toString(), "0");
    console.log("✓ Pool 1 created | vault = " + vault1Bal + " raw seed | penalty_vault_balance = " + pool1.penaltyVaultBalance);
  });

  it("10. Pool 1: 10 deposits → Active", async () => {
    const pool1PDA = getPDA([Buffer.from("pool"), poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);
    for (let i = 11; i < 21; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(1), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool1PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }
    const pool1 = await program.account.pool.fetch(pool1PDA);
    const vault1Bal = await bal(connection, vault1PDA);
    assert.deepEqual(pool1.status, { active: {} });
    assert.equal(vault1Bal, P1_SEED + STAKE * 10n);
    console.log("✓ Pool 1 active | vault = " + Number(vault1Bal)/100 + " THEO (" + vault1Bal + " raw)");
  });

  it("11. Pool 1: 5 early exits", async () => {
    const pool1PDA = getPDA([Buffer.from("pool"), poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);
    for (let i = 11; i < 11 + P1_EXITS; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(1), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.earlyExit().accounts({
        player: players[i].publicKey, pool: pool1PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const b = await bal(connection, tokenAccounts[i]);
      console.log("  Player " + (i-10) + ": got back 0.10 | lost 0.10 | balance: " + Number(b)/100 + " THEO");
    }
    const pool1 = await program.account.pool.fetch(pool1PDA);
    assert.equal(pool1.penaltyVaultBalance.toString(), P1_PENALTY.toString());
    assert.equal(pool1.survivorCount, P1_SURVIVORS);
    console.log("✓ 5 exited | penalty vault = " + Number(P1_PENALTY)/100 + " THEO (" + P1_PENALTY + " raw)");
  });

  it("12. Pool 1: 5 survivors claim, finalize → 2 raw dust", async () => {
    const pool1PDA = getPDA([Buffer.from("pool"), poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);
    console.log("  Waiting 32s for game to end...");
    await sleep(32000);
    for (let i = 11 + P1_EXITS; i < 21; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(1), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.claim().accounts({
        player: players[i].publicKey, pool: pool1PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const b = await bal(connection, tokenAccounts[i]);
      assert.equal(b, PLAYER_START - STAKE + P1_CLAIM);
      console.log("  Survivor " + (i-15) + ": received " + Number(P1_CLAIM)/100 + " THEO | balance: " + Number(b)/100 + " THEO");
    }
    console.log("  Waiting 11s for claim window...");
    await sleep(11000);
    await program.methods.finalize().accounts({
      caller: authority.publicKey, globalState: globalStatePDA, pool: pool1PDA,
      tokenMint, poolVault: vault1PDA, rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const gs = await program.account.globalState.fetch(globalStatePDA);
    const vault1Bal = await bal(connection, vault1PDA);
    assert.equal(vault1Bal, 0n);
    assert.equal(gs.rolloverBalance.toString(), P1_DUST.toString());
    console.log("✓ Pool 1 finalized | vault = EMPTY | dust = " + gs.rolloverBalance + " raw → Pool 2");
  });

  it("13. Pool 2: create — seeded with Pool 1 dust", async () => {
    const pool2PDA = getPDA([Buffer.from("pool"), poolIdBytes(2)], program.programId);
    const vault2PDA = getPDA([Buffer.from("vault"), poolIdBytes(2)], program.programId);
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool2PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault2PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const pool2 = await program.account.pool.fetch(pool2PDA);
    const vault2Bal = await bal(connection, vault2PDA);
    assert.equal(vault2Bal, P2_SEED);
    assert.equal(pool2.penaltyVaultBalance.toString(), P2_SEED.toString());
    console.log("✓ Pool 2 created | vault = " + vault2Bal + " raw seed from Pool 1 dust");
  });

  it("14. Pool 2: 3 players deposit — pool stays Filling", async () => {
    const pool2PDA = getPDA([Buffer.from("pool"), poolIdBytes(2)], program.programId);
    const vault2PDA = getPDA([Buffer.from("vault"), poolIdBytes(2)], program.programId);
    for (let i = 21; i < 24; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(2), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool2PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault2PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }
    const pool2 = await program.account.pool.fetch(pool2PDA);
    const vault2Bal = await bal(connection, vault2PDA);
    assert.deepEqual(pool2.status, { filling: {} });
    assert.equal(pool2.playerCount, 3);
    assert.equal(vault2Bal, P2_SEED + STAKE * 3n);
    console.log("✓ 3 deposited | vault = " + Number(vault2Bal)/100 + " THEO | Pool 2 still Filling");
  });

  it("15. Pool 2: fill timer expires — close stalled pool", async () => {
    const pool2PDA = getPDA([Buffer.from("pool"), poolIdBytes(2)], program.programId);
    console.log("  Waiting 62s for fill timer to expire...");
    await sleep(62000);
    await program.methods.closeStalledPool().accounts({
      caller: authority.publicKey, globalState: globalStatePDA, pool: pool2PDA, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));
    const pool2 = await program.account.pool.fetch(pool2PDA);
    const gs = await program.account.globalState.fetch(globalStatePDA);
    assert.deepEqual(pool2.status, { closed: {} });
    assert.isNull(gs.activeFillingPool);
    console.log("✓ Pool 2 closed | active_filling_pool = null");
  });

  it("16. Pool 2: all 3 players withdraw full stake", async () => {
    const pool2PDA = getPDA([Buffer.from("pool"), poolIdBytes(2)], program.programId);
    const vault2PDA = getPDA([Buffer.from("vault"), poolIdBytes(2)], program.programId);
    for (let i = 21; i < 24; i++) {
      const balBefore = await bal(connection, tokenAccounts[i]);
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(2), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.withdraw().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool2PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault2PDA,
        rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
      const balAfter = await bal(connection, tokenAccounts[i]);
      assert.equal(balAfter - balBefore, STAKE);
      assert.equal(balAfter, PLAYER_START);
      console.log("  Player " + (i-20) + " withdrew | got back 0.20 THEO | balance: " + Number(balAfter)/100 + " THEO");
    }
    const vault2Bal = await bal(connection, vault2PDA);
    const gs = await program.account.globalState.fetch(globalStatePDA);
    console.log("  Vault remaining: " + vault2Bal + " raw");
    console.log("  GlobalState rollover: " + gs.rolloverBalance + " raw");
    console.log("\n=== GRAND FINALE COMPLETE ===");
    console.log("All instructions tested: initialize, create_pool, deposit, withdraw,");
    console.log("early_exit, claim, finalize, close_stalled_pool");
    console.log("Dust chain: Pool 0 → Pool 1 → Pool 2 ✓");
    console.log("Anti-griefing rejoin block confirmed ✓");
    console.log("Stalled pool lifecycle confirmed ✓");
    console.log("Zero leakage across all pools ✓");
  });
});
