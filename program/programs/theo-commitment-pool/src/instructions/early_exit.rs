use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};

use crate::state::{Pool, PoolStatus, UserPosition};
use crate::events::EarlyExit;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: early_exit
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a player who wants to exit during the Active phase.
// Penalized exit — 0.10 THEO returned, 0.10 THEO forfeited to penalty vault.
//
// What it does:
//   1. Validates pool is Active and lock window has not expired.
//   2. Validates player has not already exited.
//   3. Transfers EARLY_EXIT_RETURN (0.10 THEO) from pool vault → player.
//   4. Adds EARLY_EXIT_PENALTY (0.10 THEO) to pool.penalty_vault_balance.
//   5. Decrements pool.survivor_count.
//   6. Sets position.exited_early = true.
//   7. Emits EarlyExit.
//
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   UserPosition: ["position", pool_id.to_le_bytes(), player.key()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]

pub fn handler(ctx: Context<EarlyExitCtx>) -> Result<()> {
    let player_token_account_ai = ctx.accounts.player_token_account.to_account_info();
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let mint_ai = ctx.accounts.token_mint.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let position = &mut ctx.accounts.user_position;
    let now = Clock::get()?.unix_timestamp;

    // ── Guard 1: Pool must be Active ──────────────────────────────────────────
    require!(
        pool.status == PoolStatus::Active,
        ErrorCode::PoolNotActive
    );

    // ── Guard 2: Lock window must not have expired ────────────────────────────
    require!(
        now < pool.end_time,
        ErrorCode::LockExpired
    );

    // ── Guard 3: Player must not have already exited ──────────────────────────
    require!(
        !position.exited_early,
        ErrorCode::AlreadyExited
    );

    // ── Guard 4: Player must not have withdrawn during Filling ────────────────
    require!(
        !position.withdrew_filling,
        ErrorCode::AlreadyWithdrawn
    );

    // ── Guard 5: Defensive — player must not have already claimed ─────────────
    require!(
        !position.claimed,
        ErrorCode::AlreadyClaimed
    );

    // ── Step 1: Transfer EARLY_EXIT_RETURN from pool vault → player ───────────
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
        Pool::EARLY_EXIT_RETURN,
        2,
    )?;

    // ── Step 2: Add penalty to pool penalty vault balance ─────────────────────
    pool.penalty_vault_balance = pool.penalty_vault_balance
        .checked_add(Pool::EARLY_EXIT_PENALTY)
        .ok_or(ErrorCode::MathOverflow)?;

    // ── Step 3: Decrement survivor count ──────────────────────────────────────
    pool.survivor_count = pool.survivor_count
        .checked_sub(1)
        .ok_or(ErrorCode::CountUnderflow)?;

    // ── Step 4: Mark position as exited ───────────────────────────────────────
    position.exited_early = true;
    position.amount = 0;

    // ── Step 5: Emit EarlyExit ────────────────────────────────────────────────
    emit!(EarlyExit {
        pool_id: pool.id,
        player: ctx.accounts.player.key(),
        returned: Pool::EARLY_EXIT_RETURN,
        penalized: Pool::EARLY_EXIT_PENALTY,
        penalty_vault_total: pool.penalty_vault_balance,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct EarlyExitCtx<'info> {
    /// The player exiting early. Must be the position owner.
    #[account(mut)]
    pub player: Signer<'info>,

    /// The Active pool the player is exiting from.
    #[account(
        mut,
        seeds = [b"pool", pool.id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Player's position in this pool.
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

    /// Player's token account — destination of the EARLY_EXIT_RETURN transfer.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = player,
        token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Pool vault — source of the EARLY_EXIT_RETURN transfer.
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
    #[msg("Pool is not in Active state.")]
    PoolNotActive,
    #[msg("Lock window has expired. Early exit is no longer available.")]
    LockExpired,
    #[msg("Player has already exited early.")]
    AlreadyExited,
    #[msg("Player already withdrew during Filling phase.")]
    AlreadyWithdrawn,
    #[msg("Player has already claimed their reward.")]
    AlreadyClaimed,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Count underflow.")]
    CountUnderflow,
    #[msg("Signer is not the position owner.")]
    Unauthorized,
    #[msg("Position does not belong to this pool.")]
    PositionPoolMismatch,
}
