/**
 * THEO Pools On-Chain Instructions
 *
 * Program ID: 9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J
 * Network: X1 Testnet (https://rpc.testnet.x1.xyz)
 *
 * --- HOW TO WIRE UP THE REAL IDL ---
 * 1. Export your IDL from Anchor: `anchor build && cat target/idl/theo_pools.json`
 * 2. Copy the JSON to lib/idl/theo_pools.json
 * 3. Import it: `import IDL from "./idl/theo_pools.json"`
 * 4. Create an Anchor Program instance:
 *    ```
 *    import { Program, AnchorProvider } from "@coral-xyz/anchor";
 *    const provider = new AnchorProvider(connection, wallet, {});
 *    const program = new Program(IDL, PROGRAM_ID, provider);
 *    ```
 * 5. Replace the TODO stubs below with real Anchor calls.
 *
 * --- ACCOUNT DERIVATION ---
 * Most pool accounts are PDAs. Typical patterns:
 *   Pool state:    [Buffer.from("pool"), poolId]
 *   User stake:   [Buffer.from("stake"), pool.publicKey, wallet.publicKey]
 *   Vault:        [Buffer.from("vault"), pool.publicKey]
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { PROGRAM_ID, RPC_ENDPOINT } from "./constants";
import { Pool, UserPosition } from "./types";
import { MOCK_POOLS, MOCK_USER_POSITIONS } from "./mockData";

// ---------------------------------------------------------------------------
// Connection helper
// ---------------------------------------------------------------------------

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

// ---------------------------------------------------------------------------
// joinPool
// ---------------------------------------------------------------------------

/**
 * Build a transaction instruction to join a staking pool.
 *
 * @param poolId   - The pool identifier (maps to on-chain pool PDA)
 * @param amount   - Amount of XNT to stake (in lamports or UI units — decide with your contract)
 * @param wallet   - The user's public key
 * @returns        A Transaction ready to be signed and sent
 *
 * TODO: Replace mock implementation with real Anchor instruction:
 *   const [poolPda] = PublicKey.findProgramAddressSync(
 *     [Buffer.from("pool"), Buffer.from(poolId)],
 *     PROGRAM_ID
 *   );
 *   const [stakePda] = PublicKey.findProgramAddressSync(
 *     [Buffer.from("stake"), poolPda.toBuffer(), wallet.toBuffer()],
 *     PROGRAM_ID
 *   );
 *   const tx = await program.methods
 *     .joinPool(new BN(amount))
 *     .accounts({ pool: poolPda, userStake: stakePda, user: wallet, ... })
 *     .transaction();
 */
export async function joinPool(
  poolId: string,
  amount: number,
  wallet: PublicKey
): Promise<Transaction> {
  // TODO: Remove mock and wire up real Anchor instruction
  console.warn("joinPool: using mock implementation — wire up real IDL");

  const connection = getConnection();
  const tx = new Transaction();

  // TODO: Derive pool PDA
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(poolId)],
    PROGRAM_ID
  );

  // TODO: Derive user stake PDA
  const [stakePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), poolPda.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID
  );

  // TODO: Add real instruction — example placeholder shows accounts needed
  // tx.add(
  //   await program.methods.joinPool(new BN(amount * LAMPORTS_PER_SOL))
  //     .accounts({
  //       pool: poolPda,
  //       userStake: stakePda,
  //       user: wallet,
  //       vault: vaultPda,
  //       tokenMint: STAKE_MINT,
  //       userTokenAccount: userAta,
  //       vaultTokenAccount: vaultAta,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       systemProgram: SystemProgram.programId,
  //       rent: SYSVAR_RENT_PUBKEY,
  //     })
  //     .instruction()
  // );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet;

  void poolPda;
  void stakePda;

  return tx;
}

// ---------------------------------------------------------------------------
// exitPool
// ---------------------------------------------------------------------------

/**
 * Build a transaction instruction to exit a staking pool and withdraw stake.
 *
 * @param poolId   - The pool identifier
 * @param wallet   - The user's public key
 * @returns        A Transaction ready to be signed and sent
 *
 * TODO: Replace mock with real Anchor instruction:
 *   const tx = await program.methods
 *     .exitPool()
 *     .accounts({ pool: poolPda, userStake: stakePda, user: wallet, ... })
 *     .transaction();
 */
export async function exitPool(
  poolId: string,
  wallet: PublicKey
): Promise<Transaction> {
  // TODO: Remove mock and wire up real Anchor instruction
  console.warn("exitPool: using mock implementation — wire up real IDL");

  const connection = getConnection();
  const tx = new Transaction();

  // TODO: Derive PDAs and add real exit instruction
  // const [poolPda] = PublicKey.findProgramAddressSync(...)
  // const [stakePda] = PublicKey.findProgramAddressSync(...)
  // tx.add(await program.methods.exitPool().accounts({...}).instruction())

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet;

  return tx;
}

// ---------------------------------------------------------------------------
// claimRewards
// ---------------------------------------------------------------------------

/**
 * Build a transaction instruction to claim pending rewards from a pool.
 *
 * @param poolId   - The pool identifier
 * @param wallet   - The user's public key
 * @returns        A Transaction ready to be signed and sent
 *
 * TODO: Replace mock with real Anchor instruction:
 *   const tx = await program.methods
 *     .claimRewards()
 *     .accounts({ pool: poolPda, userStake: stakePda, user: wallet, rewardVault: ..., ... })
 *     .transaction();
 */
export async function claimRewards(
  poolId: string,
  wallet: PublicKey
): Promise<Transaction> {
  // TODO: Remove mock and wire up real Anchor instruction
  console.warn("claimRewards: using mock implementation — wire up real IDL");

  const connection = getConnection();
  const tx = new Transaction();

  // TODO: Derive PDAs and add real claim instruction
  // tx.add(await program.methods.claimRewards().accounts({...}).instruction())

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet;

  return tx;
}

// ---------------------------------------------------------------------------
// getPoolState
// ---------------------------------------------------------------------------

/**
 * Fetch on-chain state for a single pool.
 *
 * @param poolId   - The pool identifier
 * @returns        Pool data (currently returns mock)
 *
 * TODO: Replace mock with real account fetch:
 *   const [poolPda] = PublicKey.findProgramAddressSync(
 *     [Buffer.from("pool"), Buffer.from(poolId)], PROGRAM_ID
 *   );
 *   const poolAccount = await program.account.pool.fetch(poolPda);
 *   return mapPoolAccountToPool(poolAccount);
 */
export async function getPoolState(poolId: string): Promise<Pool | null> {
  // TODO: Remove mock and fetch real on-chain account
  console.warn("getPoolState: using mock data — wire up real IDL");

  // Simulate network delay
  await new Promise((r) => setTimeout(r, 50));

  return MOCK_POOLS.find((p) => p.id === poolId) ?? null;
}

// ---------------------------------------------------------------------------
// getAllPools
// ---------------------------------------------------------------------------

/**
 * Fetch all pool accounts from the program.
 *
 * TODO: Replace mock with real account scan:
 *   const pools = await program.account.pool.all();
 *   return pools.map(({ account, publicKey }) => mapPoolAccountToPool(account, publicKey));
 */
export async function getAllPools(): Promise<Pool[]> {
  // TODO: Remove mock and scan program accounts
  console.warn("getAllPools: using mock data — wire up real IDL");

  await new Promise((r) => setTimeout(r, 100));

  return MOCK_POOLS;
}

// ---------------------------------------------------------------------------
// getUserPositions
// ---------------------------------------------------------------------------

/**
 * Fetch all active staking positions for a given wallet.
 *
 * @param wallet   - The user's public key
 * @returns        Array of UserPosition objects
 *
 * TODO: Replace mock with real account scan:
 *   const stakeAccounts = await program.account.userStake.all([
 *     { memcmp: { offset: 8, bytes: wallet.toBase58() } }
 *   ]);
 *   return stakeAccounts.map(({ account }) => mapStakeAccountToPosition(account));
 */
export async function getUserPositions(
  wallet: PublicKey
): Promise<UserPosition[]> {
  // TODO: Remove mock and fetch real stake accounts filtered by wallet
  console.warn(
    `getUserPositions: using mock data for ${wallet.toBase58()} — wire up real IDL`
  );

  await new Promise((r) => setTimeout(r, 100));

  return MOCK_USER_POSITIONS;
}
