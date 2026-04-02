use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::{Pool, PoolStatus, UserPosition};
use crate::events::{ClaimWindowOpened, RewardClaimed};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: claim
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a survivor during the Claiming phase (Days 90–95).
// Transfers the survivor's base reward from the pool vault to their wallet.
//
// What it does:
//   1. Checks if pool needs to transition Active → Claiming (lazy transition).
//   2. Validates pool is in Claiming state and claim window is open.
//   3. Validates player is eligible to claim.
//   4. Computes reward_per_survivor if not yet computed.
//   5. Transfers reward_per_survivor from pool vault → player.
//   6. Updates pool.claimed_count and pool.claimed_total.
//   7. Sets position.claimed = true.
//   8. Emits RewardClaimed.
//
// Lazy Active → Claiming transition:
//   There is no dedicated "open_claiming" instruction. Instead, the first
//   claim call after pool.end_time triggers the transition automatically.
//   This keeps the instruction count low and removes the need for a keeper
//   to explicitly advance the pool state.
//
// reward_per_survivor computation:
//   Computed once on first claim. Stored on pool for all subsequent claims.
//   = floor(penalty_vault_balance / survivor_count)
//   If survivor_count == 0, nobody can claim — entire pot rolls over at finalize.
//
// Claim window:
//   pool.in_claim_window() checks: status == Claiming && now >= end_time && now <= claim_deadline
//   After claim_deadline, finalize.rs handles redistribution and rollover.
//
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   UserPosition: ["position", pool_id.to_le_bytes(), player.key()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let player_token_account_ai = ctx.accounts.player_token_account.to_account_info();
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.user_position;
    let now = Clock::get()?.unix_timestamp;

    // ── Guards: Check position eligibility BEFORE any state mutation ─────────
    //
    // Must come before the lazy transition block. Otherwise an ineligible caller
    // (e.g. exited_early) could trigger the Active → Claiming transition and
    // emit ClaimWindowOpened as a side effect before being rejected.

    // ── Guard 1: Player must not have exited early ────────────────────────────
    require!(
        !position.exited_early,
        ErrorCode::ExitedEarly
    );

    // ── Guard 2: Player must not have withdrawn during Filling ────────────────
    require!(
        !position.withdrew_filling,
        ErrorCode::WithdrewDuringFilling
    );

    // ── Guard 3: Player must not have already claimed ─────────────────────────
    require!(
        !position.claimed,
        ErrorCode::AlreadyClaimed
    );

    // ── Lazy transition: Active → Claiming ────────────────────────────────────
    //
    // If pool is still Active but end_time has passed, transition it now.
    // This removes the need for a dedicated keeper instruction.
    if pool.status == PoolStatus::Active && now >= pool.end_time {
        pool.status = PoolStatus::Claiming;

        // Compute reward_per_survivor on transition.
        // survivor_count is now frozen — no more early exits possible.
        if pool.survivor_count > 0 {
            pool.reward_per_survivor = pool.penalty_vault_balance
                .checked_div(pool.survivor_count as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            // No survivors — entire pot rolls over at finalize.
            pool.reward_per_survivor = 0;
        }

        emit!(ClaimWindowOpened {
            pool_id: pool.id,
            survivor_count: pool.survivor_count,
            penalty_vault_balance: pool.penalty_vault_balance,
            reward_per_survivor: pool.reward_per_survivor,
            claim_deadline: pool.claim_deadline,
        });
    }

    // ── Guard 4: Pool must be in Claiming state ───────────────────────────────
    require!(
        pool.status == PoolStatus::Claiming,
        ErrorCode::PoolNotClaiming
    );

    // ── Guard 5: Must be inside the claim window ──────────────────────────────
    require!(
        pool.in_claim_window(now),
        ErrorCode::ClaimWindowClosed
    );

    // ── Step 1: Transfer stake + penalty share from pool vault → player ──────
    //
    // Survivors receive:
    //   STAKE_AMOUNT (0.20)       — their original stake returned
    //   + reward_per_survivor     — their share of the penalty pot
    //
    // claimed_total tracks penalty payouts only (not stake principal).
    // This keeps redistribution math clean at finalize time.
    let claim_amount = Pool::STAKE_AMOUNT
        .checked_add(pool.reward_per_survivor)
        .ok_or(ErrorCode::MathOverflow)?;

    let pool_id_bytes = pool.id.to_le_bytes();
    let bump = pool.bump;
    let pool_seeds = &[b"pool".as_ref(), pool_id_bytes.as_ref(), &[bump]];
    let signer_seeds = &[&pool_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            token_program_ai.clone(),
            Transfer {
                from: pool_vault_ai.clone(),
                to: player_token_account_ai.clone(),
                authority: pool_ai.clone(),
            },
            signer_seeds,
        ),
        claim_amount,
    )?;

    // ── Step 2: Update pool claim tracking ───────────────────────────────────
    //
    // claimed_total tracks penalty payouts only — not stake principal.
    // Redistribution math at finalize uses:
    //   unclaimed_base = reward_per_survivor * (survivor_count - claimed_count)
    // Stake is not part of redistribution.
    pool.claimed_count = pool.claimed_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.claimed_total = pool.claimed_total
        .checked_add(pool.reward_per_survivor)
        .ok_or(ErrorCode::MathOverflow)?;

    // ── Step 3: Mark position as claimed ─────────────────────────────────────
    position.claimed = true;

    // ── Step 4: Emit RewardClaimed ────────────────────────────────────────────
    emit!(RewardClaimed {
        pool_id: pool.id,
        player: ctx.accounts.player.key(),
        amount: claim_amount, // stake (0.20) + penalty share
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Claim<'info> {
    /// The survivor claiming their reward.
    #[account(mut)]
    pub player: Signer<'info>,

    /// The pool in Claiming state.
    #[account(
        mut,
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Player's position — verified as survivor, marked claimed here.
    #[account(
        mut,
        seeds = [b"position", pool.id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == player.key() @ ErrorCode::Unauthorized,
        constraint = user_position.pool_id == pool.id @ ErrorCode::PositionPoolMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Player's token account — destination of the reward transfer.
    #[account(
        mut,
        token::mint = pool_vault.mint,
        token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Pool vault — source of the reward transfer.
    #[account(
        mut,
        token::authority = pool,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Player exited early and is not eligible to claim.")]
    ExitedEarly,
    #[msg("Player withdrew during Filling and is not eligible to claim.")]
    WithdrewDuringFilling,
    #[msg("Player has already claimed their reward.")]
    AlreadyClaimed,
    #[msg("Pool is not in Claiming state.")]
    PoolNotClaiming,
    #[msg("Claim window is closed.")]
    ClaimWindowClosed,
    #[msg("No reward available — survivor count was zero at claim time.")]
    NoRewardAvailable,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Signer is not the position owner.")]
    Unauthorized,
    #[msg("Position does not belong to this pool.")]
    PositionPoolMismatch,
}
