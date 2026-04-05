# THEO Pools

A conviction staking game on X1. Stake THEO tokens, survive the full duration, and split the penalty pot with other survivors. Quitters fund winners.

🧪 Testnet live now — Mainnet coming soon
👉 https://theo-pools.vercel.app
💬 Telegram: https://t.me/THEOthGreat

## How It Works

### 1. Filling Phase
A new pool opens and players deposit THEO to join. If the pool does not fill in time it becomes stalled and players can withdraw with no penalty.

Testnet: 5 players, 15 min fill window
Mainnet: 10 players, 5 day fill window

### 2. Active Phase
Once the pool fills the game begins. Hold your position for the full duration or exit early and pay a penalty.

Testnet: 10 minute game, 0.10 THEO early exit penalty
Mainnet: 90 day game, 50% of stake early exit penalty

### 3. Claiming Phase
When the timer expires survivors claim their original stake back plus an equal share of all penalty tokens collected.

Testnet: 20 minute claim window
Mainnet: 5 day claim window

### 4. Finalized
After the claim window closes anyone can finalize the pool. Unclaimed dust rolls into the next pool vault forever.

## Reward Formula

Your reward = Your stake + (Total penalties / Number of survivors)

Example on mainnet:
- 10 players stake 1 THEO each = 10 THEO in vault
- 3 exit early forfeiting 0.50 THEO each = 1.50 THEO in penalties
- 7 survivors split 1.50 THEO = 0.21 THEO each
- Survivors get back 1.21 THEO for every 1 THEO staked

The more people exit early the more survivors earn. Diamond hands win.

## Early Exit

Testnet: stake 0.20 THEO, penalty 0.10 THEO, you get back 0.10 THEO
Mainnet: stake TBD, penalty 50% of stake, you get back 50% of stake

## The Rules

Commit. Stake your THEO and lock it in for the game duration.
Survive. Do not exit early. Every player who breaks earns you more.
Claim. When the game ends survivors split the penalty pot equally.
Do not miss your claim window. After it closes unclaimed tokens roll to the next pool permanently.
Your keys your THEO. We never custody your tokens. Code is law.
No admins no exceptions. Fully permissionless. No one can pause it or change the rules.

## Repo Structure

program/ - Anchor smart contract in Rust
bot/     - Telegram announcement bot in TypeScript
app/     - Next.js web app at https://theo-pools.vercel.app

## Key Addresses on X1 Testnet

Program ID:   9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J
THEO Mint:    8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ
GlobalState:  4gMN5x1tQpGeEPk6pmD84JWvxYaZtpJ7UD79ueuCmp8x
RPC:          https://rpc.testnet.x1.xyz
Explorer:     https://explorer.x1.xyz

## Tech Stack

Smart Contract - Anchor Rust Token-2022 X1 testnet to Solana mainnet soon
Frontend - Next.js Tailwind Solana wallet-adapter
Bot - Telegraf TypeScript

## Protocol Philosophy

Mints nothing. Takes no fees. Routes nothing to the developer. Extracts zero value. All value remains inside the system.

Stake. Survive. Claim. Quitters and the inattentive pay the attentive.

Status: Testnet live - mainnet coming soon
