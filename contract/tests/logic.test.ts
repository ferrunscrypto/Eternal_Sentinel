/**
 * Business Logic Tests
 *
 * Tests the pure arithmetic used by the contract (tier splits,
 * block countdown, status transitions). These mirror the AssemblyScript
 * logic so that regressions are caught before deploying a new WASM build.
 */
import { describe, it, expect } from 'vitest';

// ── Constants (mirror contract) ──────────────────────────────────────────────
const TIER_1_BLOCKS = 26_280n;   // ~6 months
const TIER_2_BLOCKS = 52_560n;   // ~12 months
const TIER_1_BPS = 1_000n;       // 10%
const BPS_DENOM = 10_000n;

const STATUS_UNINITIALIZED = 0n;
const STATUS_ACTIVE = 1n;
const STATUS_TIER1_RELEASED = 2n;
const STATUS_FINALIZED = 3n;

const DEFAULT_FEE = 10_000n; // sats

// ── Pure logic helpers (TS mirrors of AssemblyScript functions) ───────────────

function calcTier1(totalDeposited: bigint): bigint {
    return (totalDeposited * TIER_1_BPS) / BPS_DENOM;
}

function calcTier2(totalDeposited: bigint): bigint {
    return totalDeposited - calcTier1(totalDeposited);
}

function tier1Remaining(lastBeat: bigint, currentBlock: bigint): bigint {
    const elapsed = currentBlock >= lastBeat ? currentBlock - lastBeat : 0n;
    return elapsed < TIER_1_BLOCKS ? TIER_1_BLOCKS - elapsed : 0n;
}

function tier2Remaining(lastBeat: bigint, currentBlock: bigint): bigint {
    const elapsed = currentBlock >= lastBeat ? currentBlock - lastBeat : 0n;
    return elapsed < TIER_2_BLOCKS ? TIER_2_BLOCKS - elapsed : 0n;
}

function canTriggerTier1(lastBeat: bigint, currentBlock: bigint): boolean {
    const elapsed = currentBlock >= lastBeat ? currentBlock - lastBeat : 0n;
    return elapsed >= TIER_1_BLOCKS;
}

function canTriggerTier2(lastBeat: bigint, currentBlock: bigint): boolean {
    const elapsed = currentBlock >= lastBeat ? currentBlock - lastBeat : 0n;
    return elapsed >= TIER_2_BLOCKS;
}

// ── Tier Split ────────────────────────────────────────────────────────────────

describe('Tier split calculations', () => {
    it('tier1 is exactly 10% of total deposited', () => {
        expect(calcTier1(1_000_000n)).toBe(100_000n);
        expect(calcTier1(100_000_000n)).toBe(10_000_000n);
        expect(calcTier1(21_000_000_00000000n)).toBe(2_100_000_00000000n);
    });

    it('tier2 is exactly 90% of total deposited', () => {
        expect(calcTier2(1_000_000n)).toBe(900_000n);
        expect(calcTier2(100_000_000n)).toBe(90_000_000n);
    });

    it('tier1 + tier2 always equals total deposited', () => {
        const amounts = [1n, 99n, 100n, 1337n, 10_000_000n, 2_100_000_00000000n];
        for (const amt of amounts) {
            expect(calcTier1(amt) + calcTier2(amt)).toBe(amt);
        }
    });

    it('handles zero deposit', () => {
        expect(calcTier1(0n)).toBe(0n);
        expect(calcTier2(0n)).toBe(0n);
    });

    it('tier1 truncates (floors) on indivisible amounts', () => {
        // 1 sat total → tier1 = floor(1 * 1000 / 10000) = 0
        expect(calcTier1(1n)).toBe(0n);
        expect(calcTier2(1n)).toBe(1n);
        // 9 sats → tier1 = floor(9000 / 10000) = 0
        expect(calcTier1(9n)).toBe(0n);
        // 10 sats → tier1 = 1
        expect(calcTier1(10n)).toBe(1n);
    });
});

// ── Block Countdown ───────────────────────────────────────────────────────────

describe('Block countdown calculations', () => {
    it('full remaining when no blocks elapsed', () => {
        expect(tier1Remaining(100n, 100n)).toBe(TIER_1_BLOCKS);
        expect(tier2Remaining(100n, 100n)).toBe(TIER_2_BLOCKS);
    });

    it('reduces correctly as blocks pass', () => {
        const last = 1000n;
        const current = 1000n + 5000n;
        expect(tier1Remaining(last, current)).toBe(TIER_1_BLOCKS - 5000n);
        expect(tier2Remaining(last, current)).toBe(TIER_2_BLOCKS - 5000n);
    });

    it('returns 0 when timeout exceeded', () => {
        const last = 0n;
        const current = TIER_1_BLOCKS + 1n;
        expect(tier1Remaining(last, current)).toBe(0n);
    });

    it('handles edge case where currentBlock equals lastBeat + TIER_1_BLOCKS', () => {
        expect(tier1Remaining(0n, TIER_1_BLOCKS)).toBe(0n);
    });

    it('handles bad block state (currentBlock < lastBeat) gracefully', () => {
        expect(tier1Remaining(500n, 100n)).toBe(TIER_1_BLOCKS);
    });

    it('tier2 countdown is independent from tier1', () => {
        const last = 0n;
        const afterTier1 = TIER_1_BLOCKS;
        expect(tier2Remaining(last, afterTier1)).toBe(TIER_2_BLOCKS - TIER_1_BLOCKS);
    });
});

// ── Trigger Eligibility ───────────────────────────────────────────────────────

describe('Trigger eligibility', () => {
    it('tier1 not triggerable before timeout', () => {
        expect(canTriggerTier1(0n, TIER_1_BLOCKS - 1n)).toBe(false);
    });

    it('tier1 triggerable exactly at timeout', () => {
        expect(canTriggerTier1(0n, TIER_1_BLOCKS)).toBe(true);
    });

    it('tier2 not triggerable before timeout', () => {
        expect(canTriggerTier2(0n, TIER_2_BLOCKS - 1n)).toBe(false);
    });

    it('tier2 triggerable exactly at timeout', () => {
        expect(canTriggerTier2(0n, TIER_2_BLOCKS)).toBe(true);
    });

    it('tier2 also triggerable if tier1 already elapsed', () => {
        expect(canTriggerTier2(0n, TIER_2_BLOCKS + 100n)).toBe(true);
    });

    it('check-in resets the clock — restarted vault is not triggerable', () => {
        // Simulate: vault started at block 0, owner checks in at block 26_000
        // After check-in, lastBeat = 26_000. At block 52_000, elapsed = 26_000 < TIER_1_BLOCKS
        const lastBeat = 26_000n;
        const currentBlock = 52_000n;
        expect(canTriggerTier1(lastBeat, currentBlock)).toBe(false);
    });

    it('check-in does not help after tier1 is already released', () => {
        // After tier1 is released (status=2), the remaining clock is for tier2.
        // Elapsed from lastBeat (the frozen heartbeat) must reach TIER_2_BLOCKS.
        // Even if owner tried to check in, contract only allows it in status=1.
        // This is a state-machine constraint, not a math constraint — verify timing only.
        const lastBeat = 0n;
        expect(canTriggerTier2(lastBeat, TIER_2_BLOCKS)).toBe(true);
    });
});

// ── Status Transitions ────────────────────────────────────────────────────────

describe('Status code constants', () => {
    it('status codes are sequential starting at 0', () => {
        expect(STATUS_UNINITIALIZED).toBe(0n);
        expect(STATUS_ACTIVE).toBe(1n);
        expect(STATUS_TIER1_RELEASED).toBe(2n);
        expect(STATUS_FINALIZED).toBe(3n);
    });

    it('only active vaults can be checked into (status === 1)', () => {
        const canCheckIn = (status: bigint) => status === STATUS_ACTIVE;
        expect(canCheckIn(STATUS_UNINITIALIZED)).toBe(false);
        expect(canCheckIn(STATUS_ACTIVE)).toBe(true);
        expect(canCheckIn(STATUS_TIER1_RELEASED)).toBe(false);
        expect(canCheckIn(STATUS_FINALIZED)).toBe(false);
    });

    it('tier1 can only be triggered from active status', () => {
        const canTrigger1 = (status: bigint) => status === STATUS_ACTIVE;
        expect(canTrigger1(STATUS_UNINITIALIZED)).toBe(false);
        expect(canTrigger1(STATUS_ACTIVE)).toBe(true);
        expect(canTrigger1(STATUS_TIER1_RELEASED)).toBe(false);
    });

    it('tier2 can only be triggered after tier1 is released', () => {
        const canTrigger2 = (status: bigint) => status === STATUS_TIER1_RELEASED;
        expect(canTrigger2(STATUS_ACTIVE)).toBe(false);
        expect(canTrigger2(STATUS_TIER1_RELEASED)).toBe(true);
        expect(canTrigger2(STATUS_FINALIZED)).toBe(false);
    });
});

// ── Fee ───────────────────────────────────────────────────────────────────────

describe('Platform fee', () => {
    it('default fee is 10 000 sats', () => {
        expect(DEFAULT_FEE).toBe(10_000n);
    });

    it('default fee is less than 0.001 BTC', () => {
        const ONE_BTC_SATS = 100_000_000n;
        expect(DEFAULT_FEE < ONE_BTC_SATS / 1000n).toBe(true);
    });
});

// ── Multi-vault isolation ─────────────────────────────────────────────────────

describe('Multi-vault isolation (conceptual)', () => {
    type Vault = {
        status: bigint;
        lastBeat: bigint;
        deposited: bigint;
        tier1: bigint;
        tier2: bigint;
    };

    function createVault(currentBlock: bigint, depositAmount: bigint): Vault {
        return {
            status: STATUS_ACTIVE,
            lastBeat: currentBlock,
            deposited: depositAmount,
            tier1: calcTier1(depositAmount),
            tier2: calcTier2(depositAmount),
        };
    }

    it('two vaults with different creation blocks have independent countdowns', () => {
        const vaultA = createVault(0n, 1_000_000n);
        const vaultB = createVault(5_000n, 1_000_000n);
        // Use currentBlock=15_000 so neither vault has exceeded TIER_1_BLOCKS (26_280)
        const currentBlock = 15_000n;

        const remainingA = tier1Remaining(vaultA.lastBeat, currentBlock); // elapsed=15_000
        const remainingB = tier1Remaining(vaultB.lastBeat, currentBlock); // elapsed=10_000

        expect(remainingA).toBe(TIER_1_BLOCKS - 15_000n);
        expect(remainingB).toBe(TIER_1_BLOCKS - 10_000n);
        expect(remainingA).not.toBe(remainingB);
        expect(remainingA).toBeLessThan(remainingB); // A started earlier → less time left
    });

    it('two vaults have independent tier amounts', () => {
        const vaultA = createVault(0n, 500_000n);
        const vaultB = createVault(0n, 2_000_000n);

        expect(vaultA.tier1).toBe(50_000n);
        expect(vaultB.tier1).toBe(200_000n);
        expect(vaultA.tier2).toBe(450_000n);
        expect(vaultB.tier2).toBe(1_800_000n);
    });

    it('triggering one vault does not affect the other', () => {
        // State mutation is isolated by owner key — verified at the logic level:
        // each vault's canTrigger is evaluated independently
        const vaultA = createVault(0n, 1_000_000n);
        const vaultB = createVault(0n, 1_000_000n);
        const currentBlock = TIER_1_BLOCKS + 1n;

        // Trigger vaultA
        const vaultATriggered = { ...vaultA, status: STATUS_TIER1_RELEASED };

        // vaultB is unaffected
        expect(vaultB.status).toBe(STATUS_ACTIVE);
        expect(vaultATriggered.status).toBe(STATUS_TIER1_RELEASED);
        expect(canTriggerTier1(vaultB.lastBeat, currentBlock)).toBe(true);
    });
});
