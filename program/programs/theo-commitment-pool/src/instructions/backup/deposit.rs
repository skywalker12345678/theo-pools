use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::{GlobalState, Pool, PoolStatus, UserPosition};
use crate::events::{PlayerJoined, PoolActivated};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: deposit
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a player who wants to join an existing Filling pool.
// Pool must already exist (created via create_pool).
//
// What it does:
//   1. Validates pool is in Filling state and fill timer has not expired.
//   2. Validates player does not already have a position in this pool.
//   3. Transfers STAKE_AMOUNT tokens from player → pool vault.
//   4. Initializes UserPosition PDA for this (player, pool) pair.
//   5. Increments pool.player_count and pool.survivor_count.
//   6. Resets fill_deadline to now + FILL_TIMEOUT (every join resets timer).
//      NOTE: Timer reset happens BEFORE checking if pool is now full.
//   7. If player_count == MAX_PLAYERS:
//      — Transitions pool to Active
//      — Sets start_time, end_time, claim_deadline
//      — Clears GlobalState.active_filling_pool (invariant maintenance)
//      — Emits PoolActivated
//   8. Emits PlayerJoined.
//
// PDA seeds:
//   UserPosition: ["position", pool_id.to_le_bytes(), player.key()]

pub fn handler(ctx: Context<Deposit>) -> Result<()> {
    let player_key = ctx.accounts.player.key();
    let pool_key = ctx.accounts.pool.key();
    let player_ai = ctx.accounts.player.to_account_info();
    let player_token_account_ai = ctx.accounts.player_token_account.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let global = &mut ctx.accounts.global_state;
    let position = &mut ctx.accounts.user_position;
    let now = Clock::get()?.unix_timestamp;

    // ── Guard 1: Pool must be Filling ─────────────────────────────────────────
    require!(
        pool.status == PoolStatus::Filling,
        ErrorCode::PoolNotFilling
    );

    // ── Guard 2: This pool must be the active filling pool ───────────────────
    //
    // Prevents depositing into a valid-but-non-active Filling pool.
    // Fully enforces the single-filling-pool invariant on-chain.
    require!(
        global.active_filling_pool == Some(pool.id),
        ErrorCode::NotActiveFillingPool
    );

    // ── Guard 3: Fill timer must not have expired ────────────────────────────
    require!(
        !pool.fill_timer_expired(now),
        ErrorCode::FillTimerExpired
    );

    // ── Guard 4: Pool must not be full ───────────────────────────────────────
    require!(
        pool.player_count < Pool::MAX_PLAYERS,
        ErrorCode::PoolFull
    );

    // ── Step 1: Transfer STAKE_AMOUNT from player to pool vault ──────────────
    token::transfer(
        CpiContext::new(
            token_program_ai.clone(),
            Transfer {
                from: player_token_account_ai.clone(),
                to: pool_vault_ai.clone(),
                authority: player_ai.clone(),
            },
        ),
        Pool::STAKE_AMOUNT,
    )?;

    // ── Step 2: Initialize UserPosition ──────────────────────────────────────
    position.owner = player_key;
    position.pool = pool_key;
    position.pool_id = pool.id;
    position.amount = Pool::STAKE_AMOUNT;
    position.deposited_at = now;
    position.withdrew_filling = false;
    position.exited_early = false;
    position.claimed = false;
    position.redistribution_collected = false;
    position.bump = ctx.bumps.user_position;

    // ── Step 3: Update pool player/survivor counts ────────────────────────────
    pool.player_count = pool.player_count.checked_add(1)
        .ok_or(ErrorCode::PlayerCountOverflow)?;
    pool.survivor_count = pool.survivor_count.checked_add(1)
        .ok_or(ErrorCode::PlayerCountOverflow)?;

    // ── Step 4: Reset fill timer ──────────────────────────────────────────────
    //
    // IMPORTANT: Timer reset happens BEFORE checking if pool is now full.
    // The 10th joiner resets the timer, then the timer is discarded as the
    // pool transitions to Active. This is intentional — order matters here.
    pool.fill_deadline = now.checked_add(Pool::FILL_TIMEOUT)
        .ok_or(ErrorCode::TimestampOverflow)?;

    // ── Step 5: Emit PlayerJoined ─────────────────────────────────────────────
    let pool_id = pool.id;
    emit!(PlayerJoined {
        pool_id,
        player: ctx.accounts.player.key(),
        player_count: pool.player_count,
        fill_deadline: pool.fill_deadline,
    });

    // ── Step 6: Check if pool is now full → transition to Active ─────────────
    if pool.player_count == Pool::MAX_PLAYERS {
        let start_time = now;
        let end_time = now.checked_add(Pool::GAME_DURATION)
            .ok_or(ErrorCode::TimestampOverflow)?;
        let claim_deadline = end_time.checked_add(Pool::CLAIM_WINDOW)
            .ok_or(ErrorCode::TimestampOverflow)?;

        pool.status = PoolStatus::Active;
        pool.start_time = start_time;
        pool.end_time = end_time;
        pool.claim_deadline = claim_deadline;

        // Clear the global filling pool pointer — this pool is no longer filling.
        // The next create_pool call can now proceed.
        global.active_filling_pool = None;

        emit!(PoolActivated {
            pool_id,
            start_time,
            end_time,
        });
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The player joining the pool.
    #[account(mut)]
    pub player: Signer<'info>,

    /// GlobalState — mutable so we can clear active_filling_pool on activation.
    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// The Filling pool the player is joining.
    #[account(
        mut,
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// UserPosition PDA — initialized here. One per (player, pool).
    /// If this account already exists, init will fail — preventing double-join.
    #[account(
        init,
        payer = player,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", pool.id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// The THEO token mint. Validated against pool.token_mint.
    #[account(address = pool.token_mint)]
    pub token_mint: Account<'info, Mint>,

    /// Player's THEO token account — source of the stake transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Pool vault — destination of the stake transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = pool,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Pool is not in Filling state.")]
    PoolNotFilling,
    #[msg("This pool is not the active filling pool.")]
    NotActiveFillingPool,
    #[msg("Fill timer has expired. This pool is stalled.")]
    FillTimerExpired,
    #[msg("Pool is already full.")]
    PoolFull,
    #[msg("Player count overflowed.")]
    PlayerCountOverflow,
    #[msg("Timestamp arithmetic overflowed.")]
    TimestampOverflow,
}
