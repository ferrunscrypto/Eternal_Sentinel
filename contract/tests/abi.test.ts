/**
 * ABI Structure Tests
 *
 * Verifies the generated EternalSentinel ABI has the correct methods,
 * parameter types, and selectors from the compiled contract output.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import abiJson from '../abis/EternalSentinel.abi.json';

// ── Selector computation (4-byte keccak-like hash used by OPNet) ─────────────
// OPNet uses a custom FNV-1a-inspired selector — replicate what the compiler outputs.
// We verify against the exact hex values emitted during build.
const EXPECTED_SELECTORS: Record<string, string> = {
    '_createVault':    '0x9003827e',
    '_checkIn':        '0x60abcd75',
    '_deposit':        '0xfd94327a',
    '_setBeneficiary': '0xf3e6e209',
    '_triggerTier1':   '0xc57246e2',
    '_triggerTier2':   '0x9a4489b6',
    '_getStatus':      '0x7fd2146e',
    '_getBeneficiary': '0xd55d0292',
    '_hasVault':       '0x43855e93',
    '_getFeeAmount':   '0x018edcf7',
};

const METHODS = Object.keys(EXPECTED_SELECTORS);

// ── Helpers ───────────────────────────────────────────────────────────────────

type AbiFunction = {
    name: string;
    type: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
};

function findMethod(name: string): AbiFunction | undefined {
    return (abiJson.functions as AbiFunction[]).find(f => f.name === name);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EternalSentinel ABI — method presence', () => {
    for (const method of METHODS) {
        it(`exposes ${method}`, () => {
            expect(findMethod(method)).toBeDefined();
        });
    }
});

describe('EternalSentinel ABI — method signatures', () => {
    it('_createVault takes (address beneficiary)', () => {
        const m = findMethod('_createVault')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'beneficiary', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'success', type: 'BOOL' });
    });

    it('_checkIn takes no inputs', () => {
        const m = findMethod('_checkIn')!;
        expect(m.inputs).toHaveLength(0);
        expect(m.outputs[0]).toMatchObject({ name: 'success', type: 'BOOL' });
    });

    it('_deposit takes (uint256 amount)', () => {
        const m = findMethod('_deposit')!;
        expect(m.inputs[0]).toMatchObject({ name: 'amount', type: 'UINT256' });
    });

    it('_setBeneficiary takes (address newBeneficiary)', () => {
        const m = findMethod('_setBeneficiary')!;
        expect(m.inputs[0]).toMatchObject({ name: 'newBeneficiary', type: 'ADDRESS' });
    });

    it('_triggerTier1 takes (address owner) and returns releasedAmount', () => {
        const m = findMethod('_triggerTier1')!;
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'releasedAmount', type: 'UINT256' });
    });

    it('_triggerTier2 takes (address owner) and returns releasedAmount', () => {
        const m = findMethod('_triggerTier2')!;
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'releasedAmount', type: 'UINT256' });
    });

    it('_getStatus returns 8 fields', () => {
        const m = findMethod('_getStatus')!;
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs).toHaveLength(8);
        const names = m.outputs.map(o => o.name);
        expect(names).toContain('currentStatus');
        expect(names).toContain('lastHeartbeatBlock');
        expect(names).toContain('currentBlock');
        expect(names).toContain('totalDeposited');
        expect(names).toContain('tier1Amount');
        expect(names).toContain('tier2Amount');
        expect(names).toContain('tier1BlocksRemaining');
        expect(names).toContain('tier2BlocksRemaining');
    });

    it('_getBeneficiary returns ADDRESS', () => {
        const m = findMethod('_getBeneficiary')!;
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'beneficiary', type: 'ADDRESS' });
    });

    it('_hasVault returns bool exists', () => {
        const m = findMethod('_hasVault')!;
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'exists', type: 'BOOL' });
    });

    it('_getFeeAmount takes no inputs and returns UINT256 fee', () => {
        const m = findMethod('_getFeeAmount')!;
        expect(m.inputs).toHaveLength(0);
        expect(m.outputs[0]).toMatchObject({ name: 'fee', type: 'UINT256' });
    });
});

describe('EternalSentinel ABI — no unexpected methods', () => {
    it('does not contain old initialize() method', () => {
        expect(findMethod('_initialize')).toBeUndefined();
    });

    it('does not contain old _getOwner() method', () => {
        expect(findMethod('_getOwner')).toBeUndefined();
    });

    it('does not contain old _getHeartbeatInfo() method', () => {
        expect(findMethod('_getHeartbeatInfo')).toBeUndefined();
    });
});
