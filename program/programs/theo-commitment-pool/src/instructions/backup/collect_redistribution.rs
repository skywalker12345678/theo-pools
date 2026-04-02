use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::{Pool, PoolStatus, UserPosition};
use crate::events::RedistributionCollected;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: collect_redistribution
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a survivor who already claimed their base reward, after the pool
// has been finalized. Pulls their share of the redistribution bonus.
//
// Background:
//   After the claim window closes, finalize.rs computes:
//     redistribution_per_claimer = floor(unclaimed_penalties / claimed_count)
//     redistribution_dust        = unclaimed_penalties % claimed_count  → rollover
//   The redistribution_per_claimer amount stays in the pool vault.
//   Each claimer must pull it individually via this instruction.
//
// What it does:
//   1. Validates pool is Finalized.
//   2. Validates pool.redistribution_per_claimer > 0 (nothing to collect otherwise).
//   3. Validates player claimed their base reward (position.claimed == true).
//   4. Validates player has not already collected redistribution.
//   5. Transfers redistribution_per_claimer from pool vault → player.
//   6. Sets position.redistribution_collected = true.
//   7. Emits RedistributionCollected.
//
// Why a separate instruction (not bundled into claim)?
//   claim.rs runs during the Claiming phase. redistribution_per_claimer is
//   not computed until finalize.rs runs after the claim window closes.
//   These are two separate phases -- bundling them is impossible.
//
// Guard ordering rationale:
//   Pool status and finalization checks come first -- cheapest and most likely
//   to fail for wrong-phase calls. Position eligibility checks follow.
//
// Note on vault balance:
//   At finalize time the vault holds:
//     redistribution_per_claimer * claimed_count  (for this instruction)
//     + redistribution_dust                        (already rolled over)
//     + unclaimed_stakes                           (already rolled over)
//   After all collect_redistribution calls, vault balance → 0.
//   No separate drain/close instruction needed -- vault empties naturally.
//
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   UserPosition: ["position", pool_id.to_le_bytes(), player.key()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]

pub fn handler(ctx: Context<CollectRedistribution>) -> Result<()> {
    let player_token_account_ai = ctx.accounts.player_token_account.to_account_info();
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let pool = &ctx.accounts.pool;
    let position = &mut ctx.accounts.user_position;

    // -- Guard 1: Pool must be Finalized --------------------------------------
    //
    // redistribution_per_claimer is only valid after finalize() runs.
    // Calling this during Claiming would read a zero/stale value.
    require!(
        pool.status == PoolStatus::Finalized,
        ErrorCode::PoolNotFinalized
    );

    // -- Guard 2: Pool must have finalized flag set (belt-and-suspenders) -----
    //
    // status == Finalized implies pool.finalized == true if finalize.rs is
    // correct, but we check both to guard against any future refactor that
    // sets status without setting the flag.
    // Distinct error from Guard 1 — if this fires, the status/flag invariant
    // has been broken and the two can be told apart in logs.
    require!(
        pool.finalized,
        ErrorCode::FinalizedFlagNotSet
    );

    // -- Guard 3: There must be a redistribution amount to collect ------------
    //
    // If claimed_count was 0 at finalize time, redistribution_per_claimer == 0
    // and there is nothing to collect. Fail early with a clear error.
    require!(
        pool.redistribution_per_claimer > 0,
        ErrorCode::NoRedistributionAvailable
    );

    // -- Guard 4: Player must have claimed their base reward ------------------
    //
    // Only survivors who claimed during the claim window are eligible.
    // Survivors who missed the window forfeited their stake -- they are not
    // claimers and have no redistribution entitlement.
    require!(
        position.claimed,
        ErrorCode::NotAClaimer
    );

    // -- Guard 5: Player must not have already collected redistribution -------
    require!(
        !position.redistribution_collected,
        ErrorCode::AlreadyCollected
    );

    // -- Step 1: Transfer redistribution_per_claimer from pool vault → player -
    //
    // Pool PDA signs the transfer via signer seeds.
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
        pool.redistribution_per_claimer,
    )?;

    // -- Step 2: Mark redistribution as collected -----------------------------
    //
    // Set AFTER transfer -- if CPI fails, flag stays false and caller can retry.
    position.redistribution_collected = true;

    // -- Step 3: Emit RedistributionCollected ---------------------------------
    emit!(RedistributionCollected {
        pool_id: pool.id,
        player: ctx.accounts.player.key(),
        amount: pool.redistribution_per_claimer,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CollectRedistribution<'info> {
    /// The claimer collecting their redistribution bonus.
    #[account(mut)]
    pub player: Signer<'info>,

    /// The Finalized pool. Read-only -- no state changes on pool itself.
    #[account(
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Player's position -- verified as claimer, marked redistribution_collected here.
    #[account(
        mut,
        seeds = [b"position", pool.id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == player.key() @ ErrorCode::Unauthorized,
        constraint = user_position.pool_id == pool.id @ ErrorCode::PositionPoolMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Player's token account -- destination of the redistribution transfer.
    #[account(
        mut,
        token::mint = pool_vault.mint,
        token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    /// Pool vault -- source of the redistribution transfer.
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
    #[msg("Pool is not in Finalized state.")]
    PoolNotFinalized,
    #[msg("Pool status is Finalized but finalized flag is not set — invariant violation.")]
    FinalizedFlagNotSet,
    #[msg("No redistribution available -- claimed_count was zero at finalize time.")]
    NoRedistributionAvailable,
    #[msg("Player did not claim during the claim window and is not eligible for redistribution.")]
    NotAClaimer,
    #[msg("Player has already collected their redistribution bonus.")]
    AlreadyCollected,
    #[msg("Signer is not the position owner.")]
    Unauthorized,
    #[msg("Position does not belong to this pool.")]
    PositionPoolMismatch,
}
