/**
 * ABI Structure Tests
 *
 * Verifies the generated EternalSentinel ABI has the correct methods,
 * parameter types, and selectors from the compiled contract output.
 *
 * NOTE: Selector hex values will need to be updated after the first contract
 * build with the new multi-vault method signatures.
 */
import { describe, it, expect } from 'vitest';
import abiJson from '../abis/EternalSentinel.abi.json';

// ── Expected methods ─────────────────────────────────────────────────────────
const EXPECTED_METHODS = [
    '_createVault',
    '_checkIn',
    '_deposit',
    '_setBeneficiary',
    '_triggerTier1',
    '_triggerTier2',
    '_getStatus',
    '_getBeneficiary',
    '_hasVault',
    '_getVaultCount',
    '_getVaultIdByIndex',
    '_getFeeAmount',
];

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
    for (const method of EXPECTED_METHODS) {
        it(`exposes ${method}`, () => {
            expect(findMethod(method)).toBeDefined();
        });
    }
});

describe('EternalSentinel ABI — method signatures', () => {
    it('_createVault takes (address beneficiary) and returns vaultId', () => {
        const m = findMethod('_createVault')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'beneficiary', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
    });

    it('_checkIn takes (uint256 vaultId)', () => {
        const m = findMethod('_checkIn')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'success', type: 'BOOL' });
    });

    it('_deposit takes (uint256 vaultId, uint256 amount)', () => {
        const m = findMethod('_deposit')!;
        expect(m.inputs).toHaveLength(2);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.inputs[1]).toMatchObject({ name: 'amount', type: 'UINT256' });
    });

    it('_setBeneficiary takes (uint256 vaultId, address newBeneficiary)', () => {
        const m = findMethod('_setBeneficiary')!;
        expect(m.inputs).toHaveLength(2);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.inputs[1]).toMatchObject({ name: 'newBeneficiary', type: 'ADDRESS' });
    });

    it('_triggerTier1 takes (uint256 vaultId) and returns releasedAmount', () => {
        const m = findMethod('_triggerTier1')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'releasedAmount', type: 'UINT256' });
    });

    it('_triggerTier2 takes (uint256 vaultId) and returns releasedAmount', () => {
        const m = findMethod('_triggerTier2')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'releasedAmount', type: 'UINT256' });
    });

    it('_getStatus takes vaultId and returns 9 fields (including owner)', () => {
        const m = findMethod('_getStatus')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs).toHaveLength(9);
        const names = m.outputs.map(o => o.name);
        expect(names).toContain('currentStatus');
        expect(names).toContain('lastHeartbeatBlock');
        expect(names).toContain('currentBlock');
        expect(names).toContain('totalDeposited');
        expect(names).toContain('tier1Amount');
        expect(names).toContain('tier2Amount');
        expect(names).toContain('tier1BlocksRemaining');
        expect(names).toContain('tier2BlocksRemaining');
        expect(names).toContain('owner');
    });

    it('_getBeneficiary takes vaultId and returns UINT256', () => {
        const m = findMethod('_getBeneficiary')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'beneficiary', type: 'UINT256' });
    });

    it('_hasVault takes vaultId and returns bool exists', () => {
        const m = findMethod('_hasVault')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'exists', type: 'BOOL' });
    });

    it('_getVaultCount takes (address owner) and returns count', () => {
        const m = findMethod('_getVaultCount')!;
        expect(m.inputs).toHaveLength(1);
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.outputs[0]).toMatchObject({ name: 'count', type: 'UINT256' });
    });

    it('_getVaultIdByIndex takes (address owner, uint256 index) and returns vaultId', () => {
        const m = findMethod('_getVaultIdByIndex')!;
        expect(m.inputs).toHaveLength(2);
        expect(m.inputs[0]).toMatchObject({ name: 'owner', type: 'ADDRESS' });
        expect(m.inputs[1]).toMatchObject({ name: 'index', type: 'UINT256' });
        expect(m.outputs[0]).toMatchObject({ name: 'vaultId', type: 'UINT256' });
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
