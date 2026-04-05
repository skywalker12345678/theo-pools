use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};

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
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]
//   GlobalState:  ["global"]

pub fn handler(ctx: Context<FinalizePool>) -> Result<()> {
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let rollover_vault_ai = ctx.accounts.rollover_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let mint_ai = ctx.accounts.token_mint.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let global = &mut ctx.accounts.global_state;
    let now = Clock::get()?.unix_timestamp;

    // ── Guard 1: finalized flag ───────────────────────────────────────────────
    require!(!pool.finalized, ErrorCode::AlreadyFinalized);

    // ── Lazy transition: Active → Claiming ────────────────────────────────────
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
    require!(pool.status == PoolStatus::Claiming, ErrorCode::PoolNotClaiming);

    // ── Guard 3: Claim window must have closed ────────────────────────────────
    require!(pool.can_finalize(now), ErrorCode::ClaimWindowStillOpen);

    // ── Step 1: Compute redistribution amounts ────────────────────────────────
    let rolled_over: u64;

    if pool.claimed_count == 0 {
        pool.redistribution_per_claimer = 0;
        pool.redistribution_dust = 0;

        let unclaimed_stakes = (pool.survivor_count as u64)
            .checked_mul(Pool::STAKE_AMOUNT)
            .ok_or(ErrorCode::MathOverflow)?;

        rolled_over = pool.penalty_vault_balance
            .checked_add(unclaimed_stakes)
            .ok_or(ErrorCode::MathOverflow)?;

    } else {
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

        // FIX: Also rollover unclaimed rewards (penalty shares)
        let unclaimed_rewards = unclaimed_survivor_count
            .checked_mul(pool.reward_per_survivor)
            .ok_or(ErrorCode::MathOverflow)?;

        rolled_over = pool.redistribution_dust
            .checked_add(unclaimed_stakes)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(unclaimed_rewards)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // ── Step 2: Transfer rolled_over amount to GlobalState rollover vault ─────
    if rolled_over > 0 {
        let pool_id_bytes = pool.id.to_le_bytes();
        let bump = pool.bump;
        let pool_seeds = &[b"pool".as_ref(), pool_id_bytes.as_ref(), &[bump]];
        let signer_seeds = &[&pool_seeds[..]];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                token_program_ai.clone(),
                TransferChecked {
                    from: pool_vault_ai.clone(),
                    to: rollover_vault_ai.clone(),
                    authority: pool_ai.clone(),
                    mint: mint_ai.clone(),
                },
                signer_seeds,
            ),
            rolled_over,
            2,
        )?;

        global.rollover_balance = global.rollover_balance
            .checked_add(rolled_over)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // ── Step 3: Finalize pool ─────────────────────────────────────────────────
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

    /// Token mint — needed for transfer_checked.
    #[account(address = global_state.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// Pool vault — source of the rollover transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = pool,
        token::token_program = token_program,
        address = pool.vault,
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    /// Global rollover vault — destination of the rollover transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = global_state,
        token::token_program = token_program,
        address = global_state.rollover_vault,
    )]
    pub rollover_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
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
