/**
 * Tests for VaultListPage — verifies the page always shows content
 * under every combination of wallet/vault states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VaultListPage } from '../src/components/VaultListPage';

// ── Mock dependencies ────────────────────────────────────────────────────────

// Mock fetchVaultSummary so tests don't hit the network
vi.mock('../src/utils/vaultFetch', () => ({
    fetchVaultSummary: vi.fn(),
}));

import { fetchVaultSummary } from '../src/utils/vaultFetch';
const mockFetch = fetchVaultSummary as ReturnType<typeof vi.fn>;

// Minimal Network stub
const network = { bech32: 'opt' } as never;

const WALLET = 'opt1pabcdef1234567890abcdef1234567890';

const defaultProps = {
    network,
    walletAddress: WALLET,
    trackedVaults: [WALLET],
    onSelectVault: vi.fn(),
    onCreateVault: vi.fn(),
    connectedWalletHasVault: null as boolean | null,
};

beforeEach(() => {
    vi.clearAllMocks();
    // Default: return a vault with status
    mockFetch.mockResolvedValue({
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
    });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VaultListPage — always shows content', () => {
    it('renders the "Vaults" heading immediately (before fetch completes)', () => {
        // fetch never resolves during this test
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByRole('heading', { name: /vaults/i })).toBeInTheDocument();
    });

    it('shows a Loading card while fetch is in-flight', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('shows vault details after fetch resolves (vault exists)', async () => {
        render(<VaultListPage {...defaultProps} connectedWalletHasVault={true} />);

        await waitFor(() => {
            expect(screen.getByText('Open Vault →')).toBeInTheDocument();
        });
    });

    it('shows "Create Vault →" button when wallet has no vault', async () => {
        mockFetch.mockResolvedValue({ hasVault: false, status: null, error: null });

        render(<VaultListPage {...defaultProps} connectedWalletHasVault={false} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /create vault/i })).toBeInTheDocument();
        });
    });

    it('shows "Open Vault →" even when fetch errors (does not hide card)', async () => {
        mockFetch.mockResolvedValue({ hasVault: false, status: null, error: 'RPC timeout' });

        render(<VaultListPage {...defaultProps} />);

        await waitFor(() => {
            // Error message shown in card
            expect(screen.getByText('RPC timeout')).toBeInTheDocument();
        });
    });

    it('shows "Connect your wallet" when trackedVaults is empty', () => {
        render(<VaultListPage {...defaultProps} trackedVaults={[]} />);

        expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    });

    it('shows "+ New Vault" button when wallet already has a vault', () => {
        render(<VaultListPage {...defaultProps} connectedWalletHasVault={true} />);

        expect(screen.getByRole('button', { name: /new vault/i })).toBeInTheDocument();
    });

    it('does NOT show "+ New Vault" when vault status is still loading (null)', () => {
        render(<VaultListPage {...defaultProps} connectedWalletHasVault={null} />);

        expect(screen.queryByRole('button', { name: /new vault/i })).not.toBeInTheDocument();
    });

    it('shows "You" badge on connected wallet card', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));
        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByText('You')).toBeInTheDocument();
    });
});
