/**
 * Component Tests — TierStepper, FlatlineRing, VaultCompact, VaultListPage
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TierStepper } from '../src/components/TierStepper';
import { FlatlineRing } from '../src/components/FlatlineRing';
import { VaultCompact } from '../src/components/VaultCompact';
import type { SentinelStatus } from '../src/types/sentinel';

// ── VaultListPage mocks (must be before import) ────────────────────────────
vi.mock('../src/utils/vaultFetch', () => ({
    fetchVaultSummary: vi.fn(),
    resolveAddress: vi.fn(),
}));
vi.mock('../src/services/ContractService', () => ({
    contractService: { getSentinelContract: vi.fn(() => null) },
}));
vi.mock('../src/services/ProviderService', () => ({
    providerService: { getProvider: vi.fn() },
}));

import { VaultListPage } from '../src/components/VaultListPage';
import { fetchVaultSummary } from '../src/utils/vaultFetch';
const mockFetch = fetchVaultSummary as ReturnType<typeof vi.fn>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUS: SentinelStatus = {
    currentStatus: 1n,
    lastHeartbeatBlock: 100n,
    currentBlock: 1100n,
    totalDeposited: 10_000_000n,
    tier1Amount: 1_000_000n,
    tier2Amount: 9_000_000n,
    tier1BlocksRemaining: 25_280n, // well before timeout
    tier2BlocksRemaining: 51_560n,
};

const TIER1_READY_STATUS: SentinelStatus = {
    ...ACTIVE_STATUS,
    currentStatus: 1n,
    tier1BlocksRemaining: 0n,    // timeout hit — ready to trigger
    tier2BlocksRemaining: 26_280n,
};

const TIER1_RELEASED_STATUS: SentinelStatus = {
    ...ACTIVE_STATUS,
    currentStatus: 2n,
    tier1BlocksRemaining: 0n,
    tier2BlocksRemaining: 26_280n,
};

const TIER2_READY_STATUS: SentinelStatus = {
    ...ACTIVE_STATUS,
    currentStatus: 2n,
    tier1BlocksRemaining: 0n,
    tier2BlocksRemaining: 0n,
};

const FINALIZED_STATUS: SentinelStatus = {
    ...ACTIVE_STATUS,
    currentStatus: 3n,
    tier1BlocksRemaining: 0n,
    tier2BlocksRemaining: 0n,
};

// ── TierStepper ───────────────────────────────────────────────────────────────

describe('TierStepper', () => {
    it('renders both tier nodes', () => {
        render(
            <TierStepper
                status={ACTIVE_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByText(/Tier 1/)).toBeInTheDocument();
        expect(screen.getByText(/Tier 2/)).toBeInTheDocument();
    });

    it('shows countdown when tier 1 is pending', () => {
        render(
            <TierStepper
                status={ACTIVE_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        // Block count appears in both badge and countdown — just verify at least one exists
        const matches = screen.getAllByText(/25280 blocks/);
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows Trigger Tier 1 button when tier 1 is ready', () => {
        render(
            <TierStepper
                status={TIER1_READY_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: /Trigger Tier 1/i })).toBeInTheDocument();
    });

    it('calls onTriggerTier1 when button is clicked', () => {
        const mockTrigger = vi.fn().mockResolvedValue(true);
        render(
            <TierStepper
                status={TIER1_READY_STATUS}
                loading={false}
                onTriggerTier1={mockTrigger}
                onTriggerTier2={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Trigger Tier 1/i }));
        expect(mockTrigger).toHaveBeenCalledTimes(1);
    });

    it('disables trigger button while loading', () => {
        render(
            <TierStepper
                status={TIER1_READY_STATUS}
                loading={true}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: /Processing/i })).toBeDisabled();
    });

    it('shows Released badge when tier 1 is done', () => {
        render(
            <TierStepper
                status={TIER1_RELEASED_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByText('Released')).toBeInTheDocument();
    });

    it('shows Trigger Final Release button when tier 2 is ready', () => {
        render(
            <TierStepper
                status={TIER2_READY_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: /Trigger Final Release/i })).toBeInTheDocument();
    });

    it('calls onTriggerTier2 when final release button is clicked', () => {
        const mockTrigger = vi.fn().mockResolvedValue(true);
        render(
            <TierStepper
                status={TIER2_READY_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={mockTrigger}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Trigger Final Release/i }));
        expect(mockTrigger).toHaveBeenCalledTimes(1);
    });

    it('shows Finalized badge when vault is fully released', () => {
        render(
            <TierStepper
                status={FINALIZED_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        expect(screen.getByText('Finalized')).toBeInTheDocument();
    });

    it('displays BTC amounts with correct format', () => {
        render(
            <TierStepper
                status={ACTIVE_STATUS}
                loading={false}
                onTriggerTier1={vi.fn()}
                onTriggerTier2={vi.fn()}
            />,
        );
        // tier1Amount = 1_000_000 sats = 0.01000000 BTC
        expect(screen.getByText(/0\.01000000 BTC/)).toBeInTheDocument();
        // tier2Amount = 9_000_000 sats = 0.09000000 BTC
        expect(screen.getByText(/0\.09000000 BTC/)).toBeInTheDocument();
    });
});

// ── FlatlineRing ──────────────────────────────────────────────────────────────

describe('FlatlineRing', () => {
    it('renders without crashing', () => {
        const { container } = render(<FlatlineRing status={ACTIVE_STATUS} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders SVG element', () => {
        const { container } = render(<FlatlineRing status={ACTIVE_STATUS} />);
        expect(container.querySelector('svg')).toBeTruthy();
    });

    it('shows flatline for finalized status', () => {
        const { container } = render(<FlatlineRing status={FINALIZED_STATUS} />);
        // Flatline uses an SVG <line> element and shows "FLATLINED" label
        expect(container.querySelector('line')).toBeTruthy();
        expect(screen.getByText('FLATLINED')).toBeInTheDocument();
    });

    it('shows percentage label for active status', () => {
        render(<FlatlineRing status={ACTIVE_STATUS} />);
        // Shows health percentage (e.g. "95%") — not "DIMINISHED" any more
        expect(screen.getByText(/\d+%/)).toBeInTheDocument();
    });
});

// ── VaultCompact ──────────────────────────────────────────────────────────────

describe('VaultCompact', () => {
    it('renders without crashing', () => {
        const { container } = render(<VaultCompact status={ACTIVE_STATUS} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('displays total deposited amount', () => {
        render(<VaultCompact status={ACTIVE_STATUS} />);
        expect(screen.getByText(/0\.10000000/)).toBeInTheDocument();
    });

    it('displays status label', () => {
        render(<VaultCompact status={ACTIVE_STATUS} />);
        expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });

    it('displays Finalized label for finalized status', () => {
        render(<VaultCompact status={FINALIZED_STATUS} />);
        expect(screen.getByText(/Finalized/i)).toBeInTheDocument();
    });

    it('shows last heartbeat block', () => {
        render(<VaultCompact status={ACTIVE_STATUS} />);
        // "Block 100" is the exact text rendered (lastHeartbeatBlock=100n)
        expect(screen.getByText(/Block 100/)).toBeInTheDocument();
    });
});

// ── VaultListPage ─────────────────────────────────────────────────────────────

const NETWORK = { bech32: 'opt' } as never;
const WALLET = 'opt1pabcdef1234567890abcdef1234567890';

const LIST_PROPS = {
    network: NETWORK,
    walletAddress: WALLET,
    trackedVaults: [WALLET],
    onSelectVault: vi.fn(),
    onCreateVault: vi.fn(),
    connectedWalletHasVault: null as boolean | null,
};

const VAULT_STATUS_RESPONSE = {
    hasVault: true,
    status: {
        currentStatus: 1n,
        lastHeartbeatBlock: 1000n,
        currentBlock: 1100n,
        totalDeposited: 100_000n,
        tier1Amount: 10_000n,
        tier2Amount: 90_000n,
        tier1BlocksRemaining: 25_000n,
        tier2BlocksRemaining: 51_000n,
    },
    error: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(VAULT_STATUS_RESPONSE);
});

describe('VaultListPage — always shows content', () => {
    it('shows "Vaults" heading immediately before fetch completes', () => {
        mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
        render(<VaultListPage {...LIST_PROPS} />);
        expect(screen.getByRole('heading', { name: /vaults/i })).toBeInTheDocument();
    });

    it('shows Loading card while fetch is in-flight', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));
        render(<VaultListPage {...LIST_PROPS} />);
        // "Loading…" appears in both the card body and button — getAllByText confirms at least one
        expect(screen.getAllByText('Loading…').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "You" badge on connected wallet card', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));
        render(<VaultListPage {...LIST_PROPS} />);
        expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('shows "Open Vault →" after fetch resolves with vault', async () => {
        render(<VaultListPage {...LIST_PROPS} connectedWalletHasVault={true} />);
        await waitFor(() => {
            expect(screen.getByText('Open Vault →')).toBeInTheDocument();
        });
    });

    it('shows "Create Vault →" when wallet has no vault', async () => {
        mockFetch.mockResolvedValue({ hasVault: false, status: null, error: null });
        render(<VaultListPage {...LIST_PROPS} connectedWalletHasVault={false} />);
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /create vault/i })).toBeInTheDocument();
        });
    });

    it('shows error message in card when fetch fails (does not hide card)', async () => {
        mockFetch.mockResolvedValue({ hasVault: false, status: null, error: 'RPC timeout' });
        render(<VaultListPage {...LIST_PROPS} />);
        await waitFor(() => {
            expect(screen.getByText('RPC timeout')).toBeInTheDocument();
        });
    });

    it('shows fallback text when trackedVaults is empty', () => {
        render(<VaultListPage {...LIST_PROPS} trackedVaults={[]} />);
        expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    });

    it('shows "+ New Vault" button when wallet has vault', () => {
        render(<VaultListPage {...LIST_PROPS} connectedWalletHasVault={true} />);
        expect(screen.getByRole('button', { name: /new vault/i })).toBeInTheDocument();
    });

    it('does NOT show "+ New Vault" while vault status is unknown (null)', () => {
        render(<VaultListPage {...LIST_PROPS} connectedWalletHasVault={null} />);
        expect(screen.queryByRole('button', { name: /new vault/i })).not.toBeInTheDocument();
    });
});
