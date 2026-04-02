use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenInterface, TokenAccount, TransferChecked};

use crate::state::{GlobalState, Pool, PoolStatus, UserPosition};
use crate::events::{FillingWithdraw, PoolClosed};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: withdraw
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by a player who wants to exit during the Filling phase.
// No penalty — full STAKE_AMOUNT returned.
//
// What it does:
//   1. Validates pool is in Filling state.
//   2. Validates player has an active position in this pool.
//   3. Transfers STAKE_AMOUNT from pool vault → player token account.
//   4. Marks position as withdrawn (withdrew_filling = true, amount = 0).
//   5. Decrements pool.player_count and pool.survivor_count.
//   6. If player_count hits 0:
//      — Pool is stalled and empty. Auto-close it.
//      — Transfer rollover_seed back to GlobalState rollover vault.
//      — Update GlobalState.rollover_balance.
//      — Set pool.status = Closed.
//      — Clear GlobalState.active_filling_pool.
//      — Emit PoolClosed.
//   7. Emits FillingWithdraw.
//
// PDA seeds:
//   Pool:         ["pool", pool_id.to_le_bytes()]
//   UserPosition: ["position", pool_id.to_le_bytes(), player.key()]
//   PoolVault:    ["vault", pool_id.to_le_bytes()]

pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let player_token_account_ai = ctx.accounts.player_token_account.to_account_info();
    let pool_ai = ctx.accounts.pool.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let rollover_vault_ai = ctx.accounts.rollover_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let mint_ai = ctx.accounts.token_mint.to_account_info();
    let pool = &mut ctx.accounts.pool;
    let global = &mut ctx.accounts.global_state;
    let position = &mut ctx.accounts.user_position;

    // ── Guard 1: Pool must be Filling or Closed ───────────────────────────────
    require!(
        pool.status == PoolStatus::Filling || pool.status == PoolStatus::Closed,
        ErrorCode::PoolNotWithdrawable
    );

    // ── Guard 2: Active filling pool check (Filling phase only) ──────────────
    if pool.status == PoolStatus::Filling {
        require!(
            global.active_filling_pool == Some(pool.id),
            ErrorCode::NotActiveFillingPool
        );
    }

    // ── Guard 3: Player must have an active position ──────────────────────────
    require!(
        !position.withdrew_filling,
        ErrorCode::AlreadyWithdrawn
    );

    // ── Step 1: Transfer STAKE_AMOUNT from pool vault → player ───────────────
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
        Pool::STAKE_AMOUNT,
        2,
    )?;

    // ── Step 2: Mark position as withdrawn ────────────────────────────────────
    position.withdrew_filling = true;
    position.amount = 0;

    // ── Step 3: Decrement pool counts ─────────────────────────────────────────
    pool.player_count = pool.player_count.checked_sub(1)
        .ok_or(ErrorCode::CountUnderflow)?;
    pool.survivor_count = pool.survivor_count.checked_sub(1)
        .ok_or(ErrorCode::CountUnderflow)?;

    // ── Step 4: Check if pool is now empty → auto-close ──────────────────────
    let pool_closed = pool.player_count == 0;

    if pool_closed {
        let rollover_seed = pool.rollover_seed;

        if rollover_seed > 0 {
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
                rollover_seed,
                2,
            )?;

            global.rollover_balance = global.rollover_balance
                .checked_add(rollover_seed)
                .ok_or(ErrorCode::MathOverflow)?;

            pool.rollover_seed = 0;
        }

        if pool.status == PoolStatus::Filling {
            pool.status = PoolStatus::Closed;
            global.active_filling_pool = None;
        }

        emit!(PoolClosed {
            pool_id: pool.id,
            rollover_returned: rollover_seed,
        });
    }

    // ── Step 5: Emit FillingWithdraw ──────────────────────────────────────────
    emit!(FillingWithdraw {
        pool_id: pool.id,
        player: ctx.accounts.player.key(),
        amount: Pool::STAKE_AMOUNT,
        pool_closed,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// The player withdrawing their stake.
    #[account(mut)]
    pub player: Signer<'info>,

    /// GlobalState — mutable to clear active_filling_pool and update rollover_balance.
    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// The Filling pool the player is withdrawing from.
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
    #[account(address = global_state.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// Player's token account — destination of the returned stake.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = player,
        token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Pool vault — source of the stake return.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = pool,
        token::token_program = token_program,
        address = pool.vault,
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    /// Global rollover vault — receives rollover_seed if pool auto-closes.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = global_state,
        token::token_program = token_program,
        address = global_state.rollover_vault,
    )]
    pub rollover_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Pool is not in a withdrawable state (must be Filling or Closed).")]
    PoolNotWithdrawable,
    #[msg("This pool is not the active filling pool.")]
    NotActiveFillingPool,
    #[msg("Position has already been withdrawn.")]
    AlreadyWithdrawn,
    #[msg("Player count underflowed.")]
    CountUnderflow,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Signer is not the position owner.")]
    Unauthorized,
    #[msg("Position does not belong to this pool.")]
    PositionPoolMismatch,
}
