use anchor_lang::prelude::*;

pub mod events;
pub mod state;
pub mod instructions;

use instructions::initialize::*;
use instructions::create_pool::*;
use instructions::deposit::*;
use instructions::withdraw::*;
use instructions::early_exit::*;
use instructions::claim::*;
use instructions::finalize::*;
use instructions::collect_redistribution::*;
use instructions::close_stalled_pool::*;

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM ID
// ─────────────────────────────────────────────────────────────────────────────

declare_id!("9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J");

// ─────────────────────────────────────────────────────────────────────────────
// THEO COMMITMENT POOL PROGRAM
// ─────────────────────────────────────────────────────────────────────────────
//
// Instruction summary:
//
//   initialize            — One-time setup. Creates GlobalState and rollover vault.
//   create_pool           — Permissionless. Creates a new Filling pool. Seeds it
//                           from GlobalState rollover vault atomically.
//   deposit               — Join a Filling pool. Transfers STAKE_AMOUNT (0.20 THEO).
//                           Transitions pool to Active when MAX_PLAYERS reached.
//   withdraw              — Exit a Filling or Closed pool. Full stake returned.
//                           Auto-closes pool and returns rollover seed on last withdrawal.
//   early_exit            — Exit an Active pool with penalty. Returns 0.10 THEO,
//                           forfeits 0.10 THEO to penalty vault.
//   claim                 — Claim base reward during Claiming phase (Days 90–95).
//                           Lazy transition: triggers Active → Claiming on first call.
//   finalize              — Permissionless. Closes claim window, computes redistribution,
//                           rolls unclaimed funds to GlobalState. callable after Day 95.
//   collect_redistribution — Pull redistribution bonus after finalization.
//                           Only callable by survivors who claimed during claim window.
//   close_stalled_pool    — Permissionless escape hatch. Closes a Filling pool whose
//                           fill timer expired with players still inside. Unblocks
//                           protocol so new pools can be created.
//
// Lifecycle:
//   initialize → [create_pool → deposit(x10) → early_exit* → claim* →
//                 finalize → collect_redistribution*] → repeats forever
//
// All funds stay in the system. Zero protocol fees. Zero extraction.

#[program]
pub mod theo_commitment_pool {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        instructions::create_pool::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        instructions::deposit::handler(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    pub fn early_exit(ctx: Context<EarlyExitCtx>) -> Result<()> {
        instructions::early_exit::handler(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    pub fn finalize(ctx: Context<FinalizePool>) -> Result<()> {
        instructions::finalize::handler(ctx)
    }

    pub fn collect_redistribution(ctx: Context<CollectRedistribution>) -> Result<()> {
        instructions::collect_redistribution::handler(ctx)
    }

    pub fn close_stalled_pool(ctx: Context<CloseStalledPool>) -> Result<()> {
        instructions::close_stalled_pool::handler(ctx)
    }
}
