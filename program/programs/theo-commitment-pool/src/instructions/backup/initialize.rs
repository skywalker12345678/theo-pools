use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::GlobalState;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION: initialize
// ─────────────────────────────────────────────────────────────────────────────
//
// Runs once at deployment. Sets up the GlobalState singleton and the global
// rollover vault token account.
//
// One-time only — enforced by Anchor's `init` constraint on GlobalState.
// If GlobalState already exists, this instruction fails with AccountAlreadyInitialized.
//
// What it does:
//   1. Creates GlobalState PDA at seeds = ["global"]
//   2. Sets canonical token_mint for the entire protocol
//   3. Creates rollover_vault token account owned by GlobalState PDA
//   4. Sets rollover_balance = 0, pool_count = 0, active_filling_pool = None
//   5. Records authority (deployer) for future admin operations
//
// Authority:
//   Caller is the authority. Permissioned — only the deployer should call this.
//   Authority is stored in GlobalState for future use (e.g. emergency pause).
//   Protocol remains permissionless for all game operations — authority has no
//   power over active pools, funds, or game mechanics.
//
// PDA seeds:
//   GlobalState:   ["global"]
//   RolloverVault: ["rollover_vault"]

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let global = &mut ctx.accounts.global_state;

    // ── Set all GlobalState fields ────────────────────────────────────────────

    global.authority = ctx.accounts.authority.key();
    global.token_mint = ctx.accounts.token_mint.key();
    global.rollover_vault = ctx.accounts.rollover_vault.key();
    global.rollover_balance = 0;
    global.pool_count = 0;
    global.active_filling_pool = None;
    global.bump = ctx.bumps.global_state;
    global._reserved = [0u8; 23];

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Deployer / authority. Pays for account initialization.
    /// Stored in GlobalState — has no power over game mechanics.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// GlobalState singleton PDA. Init enforces one-time-only execution.
    /// If this account already exists, Anchor rejects the instruction.
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global"],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// The canonical THEO token mint for this deployment.
    /// Stored in GlobalState — all pools and deposits validated against this.
    pub token_mint: Account<'info, Mint>,

    /// Global rollover vault token account.
    /// Owned by GlobalState PDA — only program CPIs can move funds.
    /// Initialized here with zero balance.
    /// Must exist before any pool creation — create_pool validates this account.
    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = global_state,
        seeds = [b"rollover_vault"],
        bump,
    )]
    pub rollover_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
