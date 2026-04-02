use anchor_lang::prelude::*;

// ─────────────────────────────────────────────────────────────────────────────
// POOL STATUS
// ─────────────────────────────────────────────────────────────────────────────

/// Strict one-directional lifecycle:
///   Filling → Active → Claiming → Finalized
/// A stalled Filling pool is closed on last withdrawal (never reaches Active).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PoolStatus {
    /// Accepting players. Fill timer active. Max 10 players.
    Filling,
    /// 10 players confirmed. 90-day lock in progress.
    Active,
    /// Day 90 reached. 5-day claim window open.
    Claiming,
    /// Claim window closed. Redistribution done. Pool permanently closed.
    Finalized,
    /// Pool stalled during Filling and was closed on last withdrawal.
    Closed,
}

impl Default for PoolStatus {
    fn default() -> Self {
        PoolStatus::Filling
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────

/// Singleton PDA. One per program deployment.
/// Tracks the global rollover vault and pool counter.
///
/// PDA seeds: ["global"]
#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    /// Authority that can manage the protocol.
    pub authority: Pubkey,

    /// The canonical THEO token mint for this deployment.
    /// All pools must use this mint. Validated at pool creation and deposit.
    pub token_mint: Pubkey,

    /// Token account PDA holding global rollover vault funds.
    /// Seeded into the next pool created.
    pub rollover_vault: Pubkey,

    /// Running balance of tokens in the global rollover vault (raw units).
    pub rollover_balance: u64,

    /// Total number of pools ever created (monotonically increasing).
    /// Used as the next pool_id on creation.
    pub pool_count: u64,

    /// The pool_id of the currently open Filling pool, if any.
    /// Set when a new pool is created. Cleared when pool goes Active or Closed.
    /// Enforces the single-filling-pool-at-a-time invariant on-chain.
    pub active_filling_pool: Option<u64>,

    /// PDA bump for ["global"]
    pub bump: u8,

    /// Reserved for future fields without account migration.
    /// Note: Option<u64> consumes 9 bytes, token_mint Pubkey consumes 32 bytes.
    pub _reserved: [u8; 23],
}

// ─────────────────────────────────────────────────────────────────────────────
// POOL
// ─────────────────────────────────────────────────────────────────────────────

/// One PDA per pool. Pools are disposable; the program is permanent.
///
/// PDA seeds: ["pool", id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Monotonic pool identifier (0-indexed).
    pub id: u64,

    /// The THEO token mint this pool accepts.
    pub token_mint: Pubkey,

    /// Token account PDA holding this pool's staked funds.
    pub vault: Pubkey,

    /// Number of players who have joined (and not withdrawn during Filling).
    pub player_count: u8,

    /// Number of players who have not exited early.
    /// Decrements on each early_exit(). Used for floor(P / W) at claim time.
    pub survivor_count: u8,

    /// Accumulated penalty tokens from early exits (raw units).
    pub penalty_vault_balance: u64,

    /// Deadline by which the pool must reach MAX_PLAYERS.
    /// Resets to now + FILL_TIMEOUT on every new join. Zero until first join.
    pub fill_deadline: i64,

    /// Unix timestamp when the pool transitioned to Active.
    pub start_time: i64,

    /// Unix timestamp when the 90-day lock expires (= start_time + GAME_DURATION).
    pub end_time: i64,

    /// Unix timestamp when the claim window closes (= end_time + CLAIM_WINDOW).
    pub claim_deadline: i64,

    /// Current lifecycle state.
    pub status: PoolStatus,

    /// Rollover seed transferred from GlobalState when this pool was created.
    /// Tracked separately to allow recovery if pool stalls (rule 6B).
    pub rollover_seed: u64,

    /// Penalty share per survivor = floor(penalty_vault_balance / survivor_count).
    /// Computed when pool enters Claiming. Frozen for all subsequent claims.
    /// Full claim amount = STAKE_AMOUNT + reward_per_survivor.
    /// claimed_total tracks penalty payouts only (not stake principal).
    pub reward_per_survivor: u64,

    /// Number of survivors who have successfully claimed.
    /// Used at finalization to compute unclaimed redistribution.
    pub claimed_count: u8,

    /// Total tokens paid out to claimers so far.
    pub claimed_total: u64,

    /// Per-claimer redistribution amount computed at finalize time.
    /// = floor((penalty_vault_balance - (claimed_count * reward_per_survivor)) / claimed_count)
    /// Survivors who claimed call collect_redistribution() to pull this amount.
    pub redistribution_per_claimer: u64,

    /// Floor division dust from redistribution calculation.
    /// = (penalty_vault_balance - (claimed_count * reward_per_survivor)) % claimed_count
    /// Rolled into GlobalState.rollover_balance at finalize time. Never silently lost.
    pub redistribution_dust: u64,

    /// Set true after finalize() computes redistribution_per_claimer and redistribution_dust.
    /// Guards against double-finalization. Must be the first require! check in finalize().
    pub finalized: bool,

    /// PDA bump for ["pool", id.to_le_bytes()]
    pub bump: u8,
}

impl Pool {
    /// Maximum players per pool.
    #[cfg(not(any(feature = "test-fast", feature = "testnet")))]
    pub const MAX_PLAYERS: u8 = 10;
    #[cfg(feature = "testnet")]
    pub const MAX_PLAYERS: u8 = 5;
    #[cfg(feature = "test-fast")]
    pub const MAX_PLAYERS: u8 = 10;

    /// Pool lock duration: 90 days in seconds.
    #[cfg(not(any(feature = "test-fast", feature = "testnet")))]
    pub const GAME_DURATION: i64 = 90 * 24 * 60 * 60;
    #[cfg(feature = "testnet")]
    pub const GAME_DURATION: i64 = 600;
    #[cfg(feature = "test-fast")]
    pub const GAME_DURATION: i64 = 30;

    /// Claim window duration: 5 days in seconds.
    #[cfg(not(any(feature = "test-fast", feature = "testnet")))]
    pub const CLAIM_WINDOW: i64 = 5 * 24 * 60 * 60;
    #[cfg(feature = "testnet")]
    pub const CLAIM_WINDOW: i64 = 1200;
    #[cfg(feature = "test-fast")]
    pub const CLAIM_WINDOW: i64 = 10;

    /// Fill timeout: 5 days in seconds. Resets on each join.
    #[cfg(not(any(feature = "test-fast", feature = "testnet")))]
    pub const FILL_TIMEOUT: i64 = 5 * 24 * 60 * 60;
    #[cfg(feature = "testnet")]
    pub const FILL_TIMEOUT: i64 = 900;
    #[cfg(feature = "test-fast")]
    pub const FILL_TIMEOUT: i64 = 60;

    /// Stake per player: 0.20 THEO (2 decimals = 20 raw units).
    pub const STAKE_AMOUNT: u64 = 20;

    /// Returned to early exiter: 0.10 THEO (10 raw units).
    pub const EARLY_EXIT_RETURN: u64 = 10;

    /// Forfeited to penalty vault on early exit: 0.10 THEO (10 raw units).
    pub const EARLY_EXIT_PENALTY: u64 = 10;

    /// Returns true if the fill timer has expired (pool stalled).
    pub fn fill_timer_expired(&self, now: i64) -> bool {
        self.fill_deadline > 0 && now > self.fill_deadline
    }

    /// Returns true if the pool is in the active lock window.
    pub fn is_locked(&self, now: i64) -> bool {
        self.status == PoolStatus::Active && now < self.end_time
    }

    /// Returns true if we are inside the claim window.
    /// Requires now >= end_time as an extra guard against premature claims
    /// if status were ever flipped early by mistake.
    pub fn in_claim_window(&self, now: i64) -> bool {
        self.status == PoolStatus::Claiming
            && now >= self.end_time
            && now <= self.claim_deadline
    }

    /// Returns true if finalization is permissible.
    pub fn can_finalize(&self, now: i64) -> bool {
        self.status == PoolStatus::Claiming && now > self.claim_deadline
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER POSITION
// ─────────────────────────────────────────────────────────────────────────────

/// One PDA per (player, pool) pair.
///
/// PDA seeds: ["position", pool_id.to_le_bytes(), owner.as_ref()]
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    /// The player's wallet pubkey.
    pub owner: Pubkey,

    /// The pool PDA this position belongs to.
    pub pool: Pubkey,

    /// The pool's numeric ID. Stored for cheap off-chain queries and event logging.
    pub pool_id: u64,

    /// Amount deposited. Always STAKE_AMOUNT (0.20 THEO = 20 raw units).
    pub amount: u64,

    /// Unix timestamp of deposit.
    pub deposited_at: i64,

    /// True if the player withdrew during the Filling phase (no penalty).
    /// Distinct from exited_early — that flag is strictly for Active-phase exits.
    pub withdrew_filling: bool,

    /// True if the player called early_exit() during the Active window.
    /// Single source of truth for exit state.
    pub exited_early: bool,

    /// True if the survivor successfully called claim() during the claim window.
    pub claimed: bool,

    /// True if the survivor has collected their redistribution bonus via collect_redistribution().
    /// Separate from claimed — redistribution is a second pull after finalize().
    pub redistribution_collected: bool,

    /// PDA bump for ["position", pool_id.to_le_bytes(), owner.as_ref()]
    pub bump: u8,
}

impl UserPosition {
    /// A position is claimable iff the player never exited (filling or active) and hasn't claimed yet.
    pub fn can_claim(&self) -> bool {
        !self.withdrew_filling && !self.exited_early && !self.claimed
    }

    /// A position is eligible for redistribution collection iff:
    /// — player claimed their base reward
    /// — redistribution not yet collected
    pub fn can_collect_redistribution(&self) -> bool {
        self.claimed && !self.redistribution_collected
    }
}

