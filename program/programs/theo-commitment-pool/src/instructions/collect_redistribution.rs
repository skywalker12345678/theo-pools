use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};

use crate::state::{Pool, PoolStatus, UserPosition};
use crate::events::RedistributionCollected;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: collect_redistribution
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a survivor who already claimed their base reward, after the pool
// has been finalized. Pulls their share of the redistribution bonus.
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
    let mint_ai = ctx.accounts.token_mint.to_account_info();
    let pool = &ctx.accounts.pool;
    let position = &mut ctx.accounts.user_position;

    // -- Guard 1: Pool must be Finalized --------------------------------------
    require!(pool.status == PoolStatus::Finalized, ErrorCode::PoolNotFinalized);

    // -- Guard 2: Pool must have finalized flag set ---------------------------
    require!(pool.finalized, ErrorCode::FinalizedFlagNotSet);

    // -- Guard 3: There must be a redistribution amount to collect ------------
    require!(pool.redistribution_per_claimer > 0, ErrorCode::NoRedistributionAvailable);

    // -- Guard 4: Player must have claimed their base reward ------------------
    require!(position.claimed, ErrorCode::NotAClaimer);

    // -- Guard 5: Player must not have already collected redistribution -------
    require!(!position.redistribution_collected, ErrorCode::AlreadyCollected);

    // -- Step 1: Transfer redistribution_per_claimer from pool vault → player -
    let pool_id_bytes = pool.id.to_le_bytes();
    let bump = pool.bump;
    let pool_seeds = &[b"pool".as_ref(), pool_id_bytes.as_ref(), &[bump]];
    let signer_seeds = &[&pool_seeds[..]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program_ai.clone(),
            TransferChecked {
                from: pool_vault_ai.clone(),
                to: player_token_account_ai.clone(),
                authority: pool_ai.clone(),
                mint: mint_ai.clone(),
            },
            signer_seeds,
        ),
        pool.redistribution_per_claimer,
        2,
    )?;

    // -- Step 2: Mark redistribution as collected -----------------------------
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

    /// The Finalized pool.
    #[account(
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Player's position.
    #[account(
        mut,
        seeds = [b"position", pool.id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == player.key() @ ErrorCode::Unauthorized,
        constraint = user_position.pool_id == pool.id @ ErrorCode::PositionPoolMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Token mint — needed for transfer_checked.
    #[account(address = pool.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// Player's token account — destination of the redistribution transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = player,
        token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Pool vault — source of the redistribution transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = pool,
        token::token_program = token_program,
        address = pool.vault,
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
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
