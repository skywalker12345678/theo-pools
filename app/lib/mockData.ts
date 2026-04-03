import { Pool, UserPosition } from "./types";

export const MOCK_POOLS: Pool[] = [
  {
    id: "pool_alpha",
    name: "Alpha Pool",
    description:
      "The flagship THEO staking pool. Earn steady rewards with a low minimum stake. Ideal for newcomers to the X1 ecosystem.",
    tvl: 142500,
    apr: 18.5,
    minStake: 10,
    maxStake: 50000,
    playerCount: 312,
    isActive: true,
    createdAt: 1712000000,
    poolAuthority: "AuTHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    rewardMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
    stakeMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
  },
  {
    id: "pool_genesis",
    name: "Genesis Pool",
    description:
      "High-yield pool for committed holders. Higher minimum stake, higher rewards. Built for the THEO OGs.",
    tvl: 380000,
    apr: 34.2,
    minStake: 500,
    maxStake: 250000,
    playerCount: 88,
    isActive: true,
    createdAt: 1712100000,
    poolAuthority: "AuTH2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    rewardMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
    stakeMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
  },
  {
    id: "pool_prime",
    name: "Prime Pool",
    description:
      "Balanced risk/reward with a 30-day lockup period. Earn boosted APR by committing your stake long-term.",
    tvl: 215000,
    apr: 24.0,
    minStake: 100,
    maxStake: 100000,
    playerCount: 154,
    isActive: true,
    createdAt: 1712200000,
    poolAuthority: "AuTH3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    rewardMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
    stakeMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
  },
  {
    id: "pool_testnet",
    name: "Testnet Pool",
    description:
      "Experimental pool running on X1 Testnet. For developers and early testers. Rewards are test tokens only.",
    tvl: 8200,
    apr: 99.0,
    minStake: 1,
    maxStake: 1000,
    playerCount: 47,
    isActive: true,
    createdAt: 1712300000,
    poolAuthority: "AuTH4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    rewardMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
    stakeMint: "5aXz3n196NK41nSRiM9kS5NGCftmF7vnQFiY8AVFmkkS",
  },
];

export const MOCK_USER_POSITIONS: UserPosition[] = [
  {
    poolId: "pool_alpha",
    poolName: "Alpha Pool",
    stakedAmount: 250,
    claimableRewards: 12.4,
    entryTimestamp: 1713000000,
  },
  {
    poolId: "pool_prime",
    poolName: "Prime Pool",
    stakedAmount: 1000,
    claimableRewards: 67.8,
    entryTimestamp: 1712500000,
    lockupEnds: 1716000000,
  },
];
