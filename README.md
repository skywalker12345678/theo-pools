# THEO Pools

A Solana staking game currently deployed on X1 testnet, with mainnet launch coming soon. Players stake THEO tokens into commitment pools. Survivors (those who don't exit early) split the penalty pot at the end.

## How It Works

1. **Join a pool** — stake 0.20 THEO to enter
2. **Hold** — survive the full game duration to earn a share of penalties
3. **Exit early** — get 50% back, your penalty goes to survivors
4. **Claim** — survivors split the penalty pot at game end

## Repo Structure
```
theo-pools/
├── program/    ← Anchor smart contract (Rust) — deployed on X1 testnet
├── bot/        ← Telegram announcement bot (TypeScript)
└── app/        ← Next.js web app (coming soon)
```

## Key Addresses (X1 Testnet)

| | |
|---|---|
| Program ID | `9ApgY5PU4canp14F1s14vosTSgxKiQeZfvweJGcbEQ6J` |
| THEO Mint | `8Ehmo8CuTZ11i7AspWzk8pZ16AR6gnW6GJnc654c32iQ` |
| GlobalState | `4gMN5x1tQpGeEPk6pmD84JWvxYaZtpJ7UD79ueuCmp8x` |
| RPC | `https://rpc.testnet.x1.xyz` |
| Explorer | `https://explorer.x1.xyz` |

## Tech Stack

- **Smart Contract** — Anchor (Rust), Token-2022, X1 testnet → Solana mainnet soon
- **Frontend** — Next.js, Tailwind, Solana wallet-adapter
- **Bot** — Telegraf, TypeScript

## Status

🟡 Testnet live — mainnet coming soon
