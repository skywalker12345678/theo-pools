export interface Pool {
  id: string;
  name: string;
  description: string;
  tvl: number; // Total Value Locked in XNT
  apr: number; // Annual Percentage Rate (%)
  minStake: number; // Minimum stake in XNT
  maxStake: number; // Maximum stake in XNT
  playerCount: number;
  isActive: boolean;
  createdAt: number; // Unix timestamp
  // On-chain fields (populated from getPoolState)
  poolAuthority?: string;
  rewardMint?: string;
  stakeMint?: string;
}

export interface UserPosition {
  poolId: string;
  poolName: string;
  stakedAmount: number; // in XNT
  claimableRewards: number; // in XNT
  entryTimestamp: number; // Unix timestamp
  lockupEnds?: number; // Unix timestamp, if applicable
}

export interface JoinPoolParams {
  poolId: string;
  amount: number; // in XNT
}
