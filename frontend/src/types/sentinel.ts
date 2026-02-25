export interface SentinelStatus {
    readonly currentStatus: bigint;
    readonly lastHeartbeatBlock: bigint;
    readonly currentBlock: bigint;
    readonly totalDeposited: bigint;
    readonly tier1Amount: bigint;
    readonly tier2Amount: bigint;
    readonly tier1BlocksRemaining: bigint;
    readonly tier2BlocksRemaining: bigint;
    readonly owner: bigint;
}

export interface HeartbeatInfo {
    readonly lastHeartbeatBlock: bigint;
    readonly currentBlock: bigint;
    readonly blocksElapsed: bigint;
    readonly isAlive: boolean;
}

export const STATUS_LABELS: Record<string, string> = {
    '0': 'Uninitialized',
    '1': 'Active',
    '2': 'Tier 1 Released',
    '3': 'Finalized',
};

export const TIER_1_BLOCKS = 26_280n;
export const TIER_2_BLOCKS = 52_560n;

export const BLOCKS_PER_DAY = 144n;
export const BLOCKS_PER_HOUR = 6n;
