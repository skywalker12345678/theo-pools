use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::{GlobalState, Pool, PoolStatus};
use crate::events::PoolCreated;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: create_pool
// ─────────────────────────────────────────────────────────────────────────────
//
// Permissionless. Anyone can call this.
//
// What it does:
//   1. Derives the next pool PDA using GlobalState.pool_count as the id.
//   2. Initializes the Pool account with default state (Filling).
//   3. Atomically transfers the entire GlobalState rollover balance into
//      the new pool's vault (the rollover seed).
//   4. Resets GlobalState.rollover_balance to zero.
//   5. Increments GlobalState.pool_count.
//   6. Emits PoolCreated event.
//
// Guards:
//   - Pool must not already exist (enforced by init constraint).
//   - GlobalState rollover_balance may be zero — a zero seed is valid.
//     The pool still initializes correctly; rollover_seed will just be 0.
//
// PDA seeds:
//   Pool:  ["pool", pool_id.to_le_bytes()]
//   Vault: ["vault", pool_id.to_le_bytes()]

pub fn handler(ctx: Context<CreatePool>) -> Result<()> {
    let global_state_ai = ctx.accounts.global_state.to_account_info();
    let pool_vault_ai = ctx.accounts.pool_vault.to_account_info();
    let rollover_vault_ai = ctx.accounts.rollover_vault.to_account_info();
    let token_program_ai = ctx.accounts.token_program.to_account_info();
    let global = &mut ctx.accounts.global_state;
    let pool = &mut ctx.accounts.pool;

    // ── Guard: enforce single filling pool invariant ──────────────────────────
    //
    // This is a protocol invariant enforced on-chain.
    // Only one Filling pool may exist at any time.
    // If a Filling pool already exists, reject pool creation entirely.
    require!(
        global.active_filling_pool.is_none(),
        ErrorCode::FillingPoolExists
    );

    // ── Step 1: Assign pool identity ─────────────────────────────────────────

    let pool_id = global.pool_count;
    pool.id = pool_id;
    pool.bump = ctx.bumps.pool;
    pool.status = PoolStatus::Filling;

    // ── Step 2: Record token mint and vault ──────────────────────────────────

    pool.token_mint = ctx.accounts.token_mint.key();
    pool.vault = ctx.accounts.pool_vault.key();

    // ── Step 3: Initialize player/survivor tracking ──────────────────────────

    pool.player_count = 0;
    pool.survivor_count = 0;
    pool.penalty_vault_balance = 0;

    // ── Step 4: Initialize timestamps (zeroed until first join) ──────────────

    pool.fill_deadline = 0; // set on first deposit
    pool.start_time = 0;
    pool.end_time = 0;
    pool.claim_deadline = 0;

    // ── Step 5: Initialize claim tracking ────────────────────────────────────

    pool.reward_per_survivor = 0;
    pool.claimed_count = 0;
    pool.claimed_total = 0;
    pool.redistribution_per_claimer = 0;
    pool.redistribution_dust = 0;
    pool.finalized = false;

    // ── Step 6: Atomic rollover seed transfer ────────────────────────────────
    //
    // Transfer the entire GlobalState rollover balance into this pool's vault.
    // This is a protocol invariant: pool creation and seed transfer are atomic.
    // A pool must never exist in a state where the seed is "pending transfer."

    let seed_amount = global.rollover_balance;
    pool.rollover_seed = seed_amount;
    pool.penalty_vault_balance = seed_amount;

    if seed_amount > 0 {
        let bump = global.bump;
        let global_seeds = &[b"global".as_ref(), &[bump]];
        let signer_seeds = &[&global_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                token_program_ai.clone(),
                Transfer {
                    from: rollover_vault_ai.clone(),
                    to: pool_vault_ai.clone(),
                    authority: global_state_ai.clone(),
                },
                signer_seeds,
            ),
            seed_amount,
        )?;

        // Reset global rollover balance to zero after transfer
        global.rollover_balance = 0;
    }

    // ── Step 7: Increment pool counter ───────────────────────────────────────

    global.pool_count = global.pool_count.checked_add(1)
        .ok_or(ErrorCode::PoolCountOverflow)?;

    // ── Step 8: Register this pool as the active filling pool ─────────────────
    //
    // Cleared in deposit.rs when pool transitions to Active.
    // Cleared in withdraw.rs when stalled pool is closed on last withdrawal.

    global.active_filling_pool = Some(pool_id);

    // ── Step 9: Emit event ───────────────────────────────────────────────────

    emit!(PoolCreated {
        pool_id,
        rollover_seed: seed_amount,
        fill_deadline: 0, // not yet started; set on first deposit
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreatePool<'info> {
    /// Permissionless — any wallet can create a pool.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// GlobalState singleton. Holds rollover balance and pool counter.
    /// Mutable because we decrement rollover_balance and increment pool_count.
    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// The new pool PDA. Initialized here.
    /// Seeds use the current pool_count as the id (before increment).
    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", global_state.pool_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    /// The THEO token mint. Validated against GlobalState.token_mint to prevent
    /// wrong-mint pool creation. Locks the protocol to a single canonical token.
    #[account(address = global_state.token_mint)]
    pub token_mint: Account<'info, Mint>,

    /// Global rollover vault — source of the seed transfer.
    /// Owned by GlobalState PDA.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = global_state,
        address = global_state.rollover_vault,
    )]
    pub rollover_vault: Account<'info, TokenAccount>,

    /// This pool's token vault. Initialized here.
    /// Owned by the pool PDA so only program CPIs can move funds.
    #[account(
        init,
        payer = creator,
        token::mint = token_mint,
        token::authority = pool,
        seeds = [b"vault", global_state.pool_count.to_le_bytes().as_ref()],
        bump,
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
    #[msg("A Filling pool already exists. Only one Filling pool is allowed at a time.")]
    FillingPoolExists,
    #[msg("Pool count overflowed u64. This should never happen.")]
    PoolCountOverflow,
}
