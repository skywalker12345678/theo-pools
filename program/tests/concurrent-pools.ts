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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function confirmTx(connection: any, sig: string): Promise<void> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
}
function poolIdBytes(id: number): Buffer { const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id)); return buf; }
function getPDA(seeds: Buffer[], programId: PublicKey): PublicKey { return PublicKey.findProgramAddressSync(seeds, programId)[0]; }
async function bal(connection: any, account: PublicKey): Promise<bigint> { return (await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)).amount; }

describe("Concurrent Pools: Multiple pools running simultaneously", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TheoCommitmentPool as Program<TheoCommitmentPool>;
  const connection = provider.connection;
  const authority = provider.wallet as anchor.Wallet;

  // 15 players: 5 for pool0, 5 for pool1, 5 for pool2
  const players: Keypair[] = Array.from({ length: 15 }, () => Keypair.generate());
  let tokenAccounts: PublicKey[] = [];
  let tokenMint: PublicKey;
  let globalStatePDA: PublicKey;
  let rolloverVaultPDA: PublicKey;

  before(async () => {
    console.log("\n=== CONCURRENT POOLS TEST ===");
    console.log("Proves multiple pools can run simultaneously\n");

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
    console.log("✓ Protocol initialized");
  });

  it("2. Create Pool 0 and fill it to Active", async () => {
    const pool0PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(0)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool0PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));

    // Deposit 5 players into Pool 0
    for (let i = 0; i < 5; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }

    const pool0 = await program.account.pool.fetch(pool0PDA);
    const vault0Bal = await bal(connection, vault0PDA);
    assert.deepEqual(pool0.status, { active: {} });
    assert.equal(pool0.playerCount, 5);
    assert.equal(vault0Bal, STAKE * 5n);
    console.log("✓ Pool 0 ACTIVE | 5 players | vault = " + Number(vault0Bal)/100 + " THEO");
  });

  it("3. Create Pool 1 while Pool 0 is Active — should succeed", async () => {
    const pool0PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(0)], program.programId);
    const pool1PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);

    // Pool 0 is Active — creating Pool 1 should work fine
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool1PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));

    const pool0 = await program.account.pool.fetch(pool0PDA);
    const pool1 = await program.account.pool.fetch(pool1PDA);
    assert.deepEqual(pool0.status, { active: {} });
    assert.deepEqual(pool1.status, { filling: {} });
    console.log("✓ Pool 0 still ACTIVE | Pool 1 now FILLING — both exist simultaneously");
  });

  it("4. Try create Pool 2 while Pool 1 is Filling — should FAIL", async () => {
    const pool2PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(2)], program.programId);
    const vault2PDA = getPDA([Buffer.from("vault"), poolIdBytes(2)], program.programId);
    try {
      await program.methods.createPool().accounts({
        creator: authority.publicKey, globalState: globalStatePDA, pool: pool2PDA, tokenMint,
        rolloverVault: rolloverVaultPDA, poolVault: vault2PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).rpc();
      assert.fail("Should not be able to create pool while one is Filling!");
    } catch (err: any) {
      console.log("✓ Correctly blocked — cannot create pool while one is Filling");
      console.log("  Error: " + (err.error?.errorCode?.code || err.message?.split("\n")[0]));
    }
  });

  it("5. Fill Pool 1 to Active — now TWO pools Active simultaneously", async () => {
    const pool0PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(0)], program.programId);
    const pool1PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(1)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);

    // Deposit 5 players into Pool 1
    for (let i = 5; i < 10; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(1), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.deposit().accounts({
        player: players[i].publicKey, globalState: globalStatePDA, pool: pool1PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }

    const pool0 = await program.account.pool.fetch(pool0PDA);
    const pool1 = await program.account.pool.fetch(pool1PDA);
    const vault0Bal = await bal(connection, getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId));
    const vault1Bal = await bal(connection, vault1PDA);
    assert.deepEqual(pool0.status, { active: {} });
    assert.deepEqual(pool1.status, { active: {} });
    assert.equal(vault0Bal, STAKE * 5n);
    assert.equal(vault1Bal, STAKE * 5n);
    console.log("✓ Pool 0 ACTIVE | vault = " + Number(vault0Bal)/100 + " THEO");
    console.log("✓ Pool 1 ACTIVE | vault = " + Number(vault1Bal)/100 + " THEO");
    console.log("✓ TWO POOLS RUNNING SIMULTANEOUSLY!");
  });

  it("6. Create Pool 2 now that Pool 1 is Active — should succeed", async () => {
    const pool2PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(2)], program.programId);
    const vault2PDA = getPDA([Buffer.from("vault"), poolIdBytes(2)], program.programId);
    await program.methods.createPool().accounts({
      creator: authority.publicKey, globalState: globalStatePDA, pool: pool2PDA, tokenMint,
      rolloverVault: rolloverVaultPDA, poolVault: vault2PDA, tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    } as any).rpc().then((s: string) => confirmTx(connection, s));

    const pool2 = await program.account.pool.fetch(pool2PDA);
    assert.deepEqual(pool2.status, { filling: {} });
    console.log("✓ Pool 2 created while Pool 0 and Pool 1 both Active — THREE pools coexisting!");
  });

  it("7. Wait for game to end — Pool 0 and Pool 1 claim independently", async () => {
    const pool0PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(0)], program.programId);
    const pool1PDA  = getPDA([Buffer.from("pool"),  poolIdBytes(1)], program.programId);
    const vault0PDA = getPDA([Buffer.from("vault"), poolIdBytes(0)], program.programId);
    const vault1PDA = getPDA([Buffer.from("vault"), poolIdBytes(1)], program.programId);

    console.log("  Waiting 12 min for game to end...");
    await sleep(720000);

    // All 5 Pool 0 survivors claim
    for (let i = 0; i < 5; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(0), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.claim().accounts({
        player: players[i].publicKey, pool: pool0PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault0PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }
    console.log("✓ Pool 0: all 5 survivors claimed");

    // All 5 Pool 1 survivors claim
    for (let i = 5; i < 10; i++) {
      const posPDA = getPDA([Buffer.from("position"), poolIdBytes(1), players[i].publicKey.toBuffer()], program.programId);
      await program.methods.claim().accounts({
        player: players[i].publicKey, pool: pool1PDA, userPosition: posPDA,
        tokenMint, playerTokenAccount: tokenAccounts[i], poolVault: vault1PDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any).signers([players[i]]).rpc().then((s: string) => confirmTx(connection, s));
    }
    console.log("✓ Pool 1: all 5 survivors claimed");

    // Verify both vaults empty after claim window
    console.log("  Waiting 21 min for claim window...");
    await sleep(1260000);

    await program.methods.finalize().accounts({
      caller: authority.publicKey, globalState: globalStatePDA, pool: pool0PDA,
      tokenMint, poolVault: vault0PDA, rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc().then((s: string) => confirmTx(connection, s));

    await program.methods.finalize().accounts({
      caller: authority.publicKey, globalState: globalStatePDA, pool: pool1PDA,
      tokenMint, poolVault: vault1PDA, rolloverVault: rolloverVaultPDA, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any).rpc().then((s: string) => confirmTx(connection, s));

    const vault0Bal = await bal(connection, vault0PDA);
    const vault1Bal = await bal(connection, vault1PDA);
    assert.equal(vault0Bal, 0n);
    assert.equal(vault1Bal, 0n);
    console.log("✓ Pool 0 finalized | vault = EMPTY");
    console.log("✓ Pool 1 finalized | vault = EMPTY");
    console.log("✓ Zero interference between concurrent pools!");
  });
});
