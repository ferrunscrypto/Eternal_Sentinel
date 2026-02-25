/**
 * useSentinel Hook Tests
 *
 * Tests hook state management using mocked wallet connection and contract service.
 * vi.hoisted() is used to declare mocks before vi.mock() factory hoisting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── Hoisted mocks (must be declared before vi.mock calls) ─────────────────────
const {
    mockGetStatus,
    mockCreateVault,
    mockCheckIn,
    mockTriggerTier1,
    mockTriggerTier2,
    mockSetBeneficiary,
    mockDeposit,
    mockGetSentinelContract,
    mockGetPublicKeysInfoRaw,
} = vi.hoisted(() => {
    const mockGetStatus = vi.fn();
    const mockCreateVault = vi.fn();
    const mockCheckIn = vi.fn();
    const mockTriggerTier1 = vi.fn();
    const mockTriggerTier2 = vi.fn();
    const mockSetBeneficiary = vi.fn();
    const mockDeposit = vi.fn();

    const mockContract = {
        _getStatus: mockGetStatus,
        _createVault: mockCreateVault,
        _checkIn: mockCheckIn,
        _triggerTier1: mockTriggerTier1,
        _triggerTier2: mockTriggerTier2,
        _setBeneficiary: mockSetBeneficiary,
        _deposit: mockDeposit,
    };

    const mockGetSentinelContract = vi.fn().mockReturnValue(mockContract);
    const mockGetPublicKeysInfoRaw = vi.fn().mockResolvedValue({
        'opt1ptest': {
            mldsaHashedPublicKey: '0x' + 'ab'.repeat(32),
            tweakedPubkey: '0x' + 'ab'.repeat(32),
            originalPubKey: '0x' + 'ab'.repeat(32),
        },
    });

    return {
        mockGetStatus,
        mockCreateVault,
        mockCheckIn,
        mockTriggerTier1,
        mockTriggerTier2,
        mockSetBeneficiary,
        mockDeposit,
        mockGetSentinelContract,
        mockGetPublicKeysInfoRaw,
    };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/services/ContractService', () => ({
    contractService: {
        getSentinelContract: mockGetSentinelContract,
    },
}));

vi.mock('../src/services/ProviderService', () => ({
    providerService: {
        getProvider: vi.fn().mockReturnValue({
            getPublicKeysInfoRaw: mockGetPublicKeysInfoRaw,
        }),
    },
}));

vi.mock('../src/config/networks', () => ({
    getNetworkName: vi.fn().mockReturnValue('OPNet Testnet'),
}));

vi.mock('@btc-vision/walletconnect', () => ({
    useWalletConnect: vi.fn().mockReturnValue({
        network: { bech32: 'opt', network: 'opnetTestnet' },
        walletAddress: 'opt1ptest',
    }),
    SupportedWallets: { OP_WALLET: 'op_wallet' },
}));

vi.mock('@btc-vision/transaction', () => ({
    Address: {
        fromString: vi.fn().mockReturnValue({ toString: () => '0x' + 'ab'.repeat(32) }),
    },
}));

// ── Import hook after mocks are declared ──────────────────────────────────────
import { useSentinel } from '../src/hooks/useSentinel';

// ── Helpers ───────────────────────────────────────────────────────────────────

// The owner u256 value that corresponds to address '0x' + 'ab'.repeat(32)
const OWNER_U256 = BigInt('0x' + 'ab'.repeat(32));

const STATUS_PROPS = {
    currentStatus: 1n,
    lastHeartbeatBlock: 100n,
    currentBlock: 200n,
    totalDeposited: 10_000_000n,
    tier1Amount: 1_000_000n,
    tier2Amount: 9_000_000n,
    tier1BlocksRemaining: 25_000n,
    tier2BlocksRemaining: 51_000n,
    owner: OWNER_U256,
};

function mockActiveVault() {
    mockGetStatus.mockResolvedValue({ properties: STATUS_PROPS });
}

function mockNoVault() {
    mockGetStatus.mockResolvedValue({
        properties: {
            currentStatus: 0n,
            lastHeartbeatBlock: 0n,
            currentBlock: 0n,
            totalDeposited: 0n,
            tier1Amount: 0n,
            tier2Amount: 0n,
            tier1BlocksRemaining: 0n,
            tier2BlocksRemaining: 0n,
            owner: 0n,
        },
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSentinel — initial state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns connected=true when wallet and network are present', () => {
        mockNoVault();
        const { result } = renderHook(() => useSentinel(1n));
        expect(result.current.connected).toBe(true);
    });

    it('returns correct network name', () => {
        mockNoVault();
        const { result } = renderHook(() => useSentinel(1n));
        expect(result.current.networkName).toBe('OPNet Testnet');
    });

    it('returns walletAddress from hook', () => {
        mockNoVault();
        const { result } = renderHook(() => useSentinel(1n));
        expect(result.current.walletAddress).toBe('opt1ptest');
    });

    it('returns contractDeployed=true when contract is found', () => {
        mockNoVault();
        const { result } = renderHook(() => useSentinel(1n));
        expect(result.current.contractDeployed).toBe(true);
    });
});

describe('useSentinel — vault loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sets status after loading an active vault', async () => {
        mockActiveVault();
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.status?.currentStatus).toBe(1n);
        expect(result.current.status?.totalDeposited).toBe(10_000_000n);
        expect(result.current.status?.owner).toBe(OWNER_U256);
    });

    it('isOwner is true when status.owner matches connected wallet', async () => {
        mockActiveVault();
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.isOwner).toBe(true);
    });

    it('isOwner is false when status.owner differs from connected wallet', async () => {
        mockGetStatus.mockResolvedValue({
            properties: {
                ...STATUS_PROPS,
                owner: 999n, // different owner
            },
        });
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.isOwner).toBe(false);
    });

    it('returns null status when vault does not exist (status=0)', async () => {
        mockNoVault();
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

        expect(result.current.status).toBeNull();
        expect(result.current.isOwner).toBe(false);
    });

    it('sets error on getStatus failure', async () => {
        mockGetStatus.mockRejectedValue(new Error('RPC timeout'));

        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 3000 });

        expect(result.current.error).toContain('RPC timeout');
    });

    it('sets error when getStatus returns error property', async () => {
        mockGetStatus.mockResolvedValue({ error: 'Contract call failed', properties: {} });

        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 3000 });

        expect(result.current.error).toContain('Contract call failed');
    });
});

describe('useSentinel — tier status interpretation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('tier1Amount and tier2Amount are populated from status', async () => {
        mockActiveVault();
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.status?.tier1Amount).toBe(1_000_000n);
        expect(result.current.status?.tier2Amount).toBe(9_000_000n);
    });

    it('tier1BlocksRemaining is populated', async () => {
        mockActiveVault();
        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.status?.tier1BlocksRemaining).toBe(25_000n);
    });

    it('finalized status (3n) is reflected correctly', async () => {
        mockGetStatus.mockResolvedValue({
            properties: {
                ...STATUS_PROPS,
                currentStatus: 3n,
                tier1BlocksRemaining: 0n,
                tier2BlocksRemaining: 0n,
            },
        });

        const { result } = renderHook(() => useSentinel(1n));

        await waitFor(() => expect(result.current.status).not.toBeNull(), { timeout: 3000 });

        expect(result.current.status?.currentStatus).toBe(3n);
    });
});

describe('useSentinel — contractDeployed=false when contract is null', () => {
    it('returns false when getSentinelContract persistently returns null', () => {
        mockGetSentinelContract.mockReturnValue(null);
        const { result } = renderHook(() => useSentinel(1n));
        expect(result.current.contractDeployed).toBe(false);
        // Restore default so other tests aren't affected
        mockGetSentinelContract.mockReturnValue({ _getStatus: mockGetStatus });
    });
});
