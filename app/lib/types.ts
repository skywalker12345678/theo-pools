export type PoolStatus = "Filling" | "Active" | "Claiming" | "Finalized" | "Closed";

export interface Pool {
  id: string;          // numeric pool id as string e.g. "3"
  name: string;
  description: string;
  tvl: number;         // raw units / 100 for display
  apr: number;
  minStake: number;    // 0.20 THEO
  maxStake: number;
  playerCount: number;
  survivorCount: number;
  penaltyVaultBalance: number;
  isActive: boolean;
  status: PoolStatus;
  createdAt: number;
  startTime: number;
  endTime: number;
  claimDeadline: number;
  fillDeadline: number;
  rewardPerSurvivor: number;
  poolAuthority?: string;
  stakeMint?: string;
}

export interface UserPosition {
  poolId: string;
  poolName: string;
  stakedAmount: number;
  claimableRewards: number;
  entryTimestamp: number;
  exitedEarly: boolean;
  claimed: boolean;
  redistributionCollected: boolean;
  lockupEnds?: number;
}

export interface JoinPoolParams {
  poolId: string;
  amount: number;
}
