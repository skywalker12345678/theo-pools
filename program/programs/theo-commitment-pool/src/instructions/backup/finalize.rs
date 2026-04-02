use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::{GlobalState, Pool, PoolStatus};
use crate::events::{ClaimWindowOpened, PoolFinalized};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: finalize_pool
// ─────────────────────────────────────────────────────────────────────────────
//
// Permissionless. Anyone can call after claim_deadline passes.
//
// What it does:
//   1. Validates pool is in Claiming state and claim window has closed.
//   2. Guards against double-finalization via pool.finalized flag.
//   3. Computes redistribution_per_claimer and redistribution_dust.
//   4. Transfers all unclaimed funds (unclaimed stakes + dust) to GlobalState
//      rollover vault.
//   5. Sets pool.finalized = true and pool.status = Finalized.
//   6. Updates GlobalState.rollover_balance.
//   7. Emits PoolFinalized.
//
// Two paths:
//
//   A) claimed_count == 0 (nobody claimed):
//      — Entire penalty_vault_balance rolls over.
//      — Unclaimed stakes also roll over.
//      — redistribution_per_claimer = 0.
//      — No collect_redistribution calls possible.
//
//   B) claimed_count > 0 (some claimed):
//      — redistribution_per_claimer = floor(unclaimed_penalties / claimed_count)
//      — redistribution_dust = unclaimed_penalties % claimed_count
//      — unclaimed_stakes = STAKE_AMOUNT * (survivor_count - claimed_count)
//      — rolled_over = redistribution_dust + unclaimed_stakes
//      — Claimers can then call collect_redistribution.rs to pull their bonus.
//
// Vault accounting:
//   At finalize, vault holds:
//     (survivor_count * STAKE_AMOUNT) + penalty_vault_balance
//     - (claimed_count * (STAKE_AMOUNT + reward_per_survivor))   ← already paid out
//   What remains:
//     unclaimed_stakes + unclaimed_penalties
//   Of unclaimed_penalties:
//     redistribution_per_claimer * claimed_count → stays for collect_redistribution
//     redistribution_dust → rolled over
//   Of unclaimed_stakes:
//     → rolled over entirely
//
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]
//   GlobalState:  ["global"]

pub fn handler(ctx: Context<FinalizePool>) -> Result<()> {
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let rollover_vault_ai = ctx.accounts.rollover_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let global = &mut ctx.accounts.global_state;
    let now = Clock::get()?.unix_timestamp;

    // ── Guard 1: finalized flag — must be first ───────────────────────────────
    //
    // Checked before status to catch any edge case where status was manually
    // advanced but finalized was not set. Belt-and-suspenders.
    require!(
        !pool.finalized,
        ErrorCode::AlreadyFinalized
    );

    // ── Lazy transition: Active → Claiming ────────────────────────────────────
    //
    // Mirrors the same transition in claim.rs. Required for liveness in the
    // edge case where nobody calls claim() — e.g. all players exited early
    // (survivor_count = 0, reward_per_survivor = 0, Guard 6 in claim.rs blocks
    // everyone). Without this, the pool would sit in Active forever and
    // finalize() could never run, permanently stranding funds.
    //
    // claim.rs guards ensure an ineligible caller cannot trigger this transition
    // as a side effect — here in finalize(), the transition is always safe since
    // finalize() itself only proceeds if end_time has passed.
    if pool.status == PoolStatus::Active && now >= pool.end_time {
        pool.status = PoolStatus::Claiming;

        if pool.survivor_count > 0 {
            pool.reward_per_survivor = pool.penalty_vault_balance
                .checked_div(pool.survivor_count as u64)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            pool.reward_per_survivor = 0;
        }

        emit!(crate::events::ClaimWindowOpened {
            pool_id: pool.id,
            survivor_count: pool.survivor_count,
            penalty_vault_balance: pool.penalty_vault_balance,
            reward_per_survivor: pool.reward_per_survivor,
            claim_deadline: pool.claim_deadline,
        });
    }

    // ── Guard 2: Pool must be in Claiming state ───────────────────────────────
    require!(
        pool.status == PoolStatus::Claiming,
        ErrorCode::PoolNotClaiming
    );

    // ── Guard 3: Claim window must have closed ────────────────────────────────
    require!(
        pool.can_finalize(now),
        ErrorCode::ClaimWindowStillOpen
    );

    // ── Step 1: Compute redistribution amounts ────────────────────────────────
    let rolled_over: u64;

    if pool.claimed_count == 0 {
        // ── Path A: Nobody claimed ────────────────────────────────────────────
        //
        // Entire penalty vault rolls over.
        // All survivor stakes also roll over (nobody claimed them back).
        // redistribution_per_claimer stays 0 — no collect_redistribution possible.
        pool.redistribution_per_claimer = 0;
        pool.redistribution_dust = 0;

        let unclaimed_stakes = (pool.survivor_count as u64)
            .checked_mul(Pool::STAKE_AMOUNT)
            .ok_or(ErrorCode::MathOverflow)?;

        rolled_over = pool.penalty_vault_balance
            .checked_add(unclaimed_stakes)
            .ok_or(ErrorCode::MathOverflow)?
;

    } else {
        // ── Path B: Some survivors claimed ───────────────────────────────────
        //
        // already_distributed = claimed_count * reward_per_survivor
        //   (reward_per_survivor is the per-claimer penalty share, frozen at Active → Claiming)
        // unclaimed_penalties = penalty_vault_balance - already_distributed
        //   NOTE: Do NOT use claimed_total here. claimed_total accumulates penalty shares
        //   paid per claim, which equals claimed_count * reward_per_survivor — but the
        //   explicit formula is clearer and audit-safe. See claim.rs accounting comments.
        // redistribution_per_claimer = floor(unclaimed_penalties / claimed_count)
        // redistribution_dust = unclaimed_penalties % claimed_count
        // unclaimed_stakes = stakes of survivors who missed the claim window
        // rolled_over = dust + unclaimed_stakes
        let already_distributed = (pool.claimed_count as u64)
            .checked_mul(pool.reward_per_survivor)
            .ok_or(ErrorCode::MathOverflow)?;

        let unclaimed_penalties = pool.penalty_vault_balance
            .checked_sub(already_distributed)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.redistribution_per_claimer = unclaimed_penalties
            .checked_div(pool.claimed_count as u64)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.redistribution_dust = unclaimed_penalties
            .checked_rem(pool.claimed_count as u64)
            .ok_or(ErrorCode::MathOverflow)?;

        let unclaimed_survivor_count = (pool.survivor_count as u64)
            .checked_sub(pool.claimed_count as u64)
            .ok_or(ErrorCode::MathOverflow)?;

        let unclaimed_stakes = unclaimed_survivor_count
            .checked_mul(Pool::STAKE_AMOUNT)
            .ok_or(ErrorCode::MathOverflow)?;

        rolled_over = pool.redistribution_dust
            .checked_add(unclaimed_stakes)
            .ok_or(ErrorCode::MathOverflow)?
;
    }

    // ── Step 2: Transfer rolled_over amount to GlobalState rollover vault ─────
    //
    // Only transfer if there's something to roll over.
    // Pool PDA signs via signer seeds.
    if rolled_over > 0 {
        let pool_id_bytes = pool.id.to_le_bytes();
        let bump = pool.bump;
        let pool_seeds = &[b"pool".as_ref(), pool_id_bytes.as_ref(), &[bump]];
        let signer_seeds = &[&pool_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                token_program_ai.clone(),
                Transfer {
                    from: pool_vault_ai.clone(),
                    to: rollover_vault_ai.clone(),
                    authority: pool_ai.clone(),
                },
                signer_seeds,
            ),
            rolled_over,
        )?;

        // Update GlobalState rollover balance
        global.rollover_balance = global.rollover_balance
            .checked_add(rolled_over)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // ── Step 3: Finalize pool ─────────────────────────────────────────────────
    //
    // Set finalized flag AFTER transfer — if transfer fails, finalized stays false
    // and the instruction can be retried safely.
    pool.finalized = true;
    pool.status = PoolStatus::Finalized;

    // ── Step 4: Emit PoolFinalized ────────────────────────────────────────────
    emit!(PoolFinalized {
        pool_id: pool.id,
        claimed_count: pool.claimed_count,
        redistribution_per_claimer: pool.redistribution_per_claimer,
        redistribution_dust: pool.redistribution_dust,
        rolled_over,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct FinalizePool<'info> {
    /// Permissionless — any wallet can finalize after claim_deadline.
    pub caller: Signer<'info>,

    /// GlobalState — mutable to update rollover_balance.
    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// The pool being finalized.
    #[account(
        mut,
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Pool vault — source of the rollover transfer.
    #[account(
        mut,
        token::authority = pool,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Global rollover vault — destination of the rollover transfer.
    #[account(
        mut,
        token::authority = global_state,
        address = global_state.rollover_vault,
    )]
    pub rollover_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Pool has already been finalized.")]
    AlreadyFinalized,
    #[msg("Pool is not in Claiming state.")]
    PoolNotClaiming,
    #[msg("Claim window is still open. Cannot finalize yet.")]
    ClaimWindowStillOpen,
    #[msg("Math overflow or underflow.")]
    MathOverflow,
}
