use anchor_lang::prelude::*;

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────
//
// All program events are defined here and imported by instruction handlers.
// Events are emitted via anchor's emit!() macro and visible on-chain via
// transaction logs. The Telegram bot listens to these to drive notifications.

/// Emitted when a new pool is created.
#[event]
pub struct PoolCreated {
    pub pool_id: u64,
    pub rollover_seed: u64,
    pub fill_deadline: i64,
}

/// Emitted when a player joins a Filling pool.
#[event]
pub struct PlayerJoined {
    pub pool_id: u64,
    pub player: Pubkey,
    pub player_count: u8,
    pub fill_deadline: i64,
}

/// Emitted when a pool transitions Filling → Active (10th player joins).
#[event]
pub struct PoolActivated {
    pub pool_id: u64,
    pub start_time: i64,
    pub end_time: i64,
}

/// Emitted when a player withdraws during the Filling phase (no penalty).
/// pool_closed = true if this was the last player and the pool auto-closed.
#[event]
pub struct FillingWithdraw {
    pub pool_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub pool_closed: bool,
}

/// Emitted when a player exits early from an Active pool (penalized).
#[event]
pub struct EarlyExit {
    pub pool_id: u64,
    pub player: Pubkey,
    pub returned: u64,
    pub penalized: u64,
    pub penalty_vault_total: u64,
}

/// Emitted when a pool transitions Active → Claiming (lazy, on first claim call).
#[event]
pub struct ClaimWindowOpened {
    pub pool_id: u64,
    pub survivor_count: u8,
    pub penalty_vault_balance: u64,
    pub reward_per_survivor: u64,
    pub claim_deadline: i64,
}

/// Emitted when a survivor successfully claims their base reward.
/// amount = STAKE_AMOUNT + reward_per_survivor (penalty share).
#[event]
pub struct RewardClaimed {
    pub pool_id: u64,
    pub player: Pubkey,
    pub amount: u64,
}

/// Emitted when a pool is finalized after the claim window closes.
#[event]
pub struct PoolFinalized {
    pub pool_id: u64,
    pub claimed_count: u8,
    pub redistribution_per_claimer: u64,
    pub redistribution_dust: u64,   // floor division remainder — rolled to GlobalState
    pub rolled_over: u64,           // total rolled into GlobalState (dust + unclaimed stakes)
}

/// Emitted when a stalled Filling pool is closed.
/// Via close_stalled_pool: rollover_returned = 0 (no tokens moved).
/// Via withdraw (last player): rollover_returned = rollover_seed (tokens returned).
#[event]
pub struct PoolClosed {
    pub pool_id: u64,
    pub rollover_returned: u64,
}

/// Emitted when a survivor collects their redistribution bonus after finalization.
#[event]
pub struct RedistributionCollected {
    pub pool_id: u64,
    pub player: Pubkey,
    pub amount: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: RolloverSeeded is defined but intentionally not emitted.
// The rollover seed transfer is already captured by PoolCreated.rollover_seed.
// Kept here for potential future use or off-chain tooling.
// ─────────────────────────────────────────────────────────────────────────────

/// Defined but not currently emitted — rollover info carried by PoolCreated.
#[event]
pub struct RolloverSeeded {
    pub pool_id: u64,
    pub amount: u64,
}
