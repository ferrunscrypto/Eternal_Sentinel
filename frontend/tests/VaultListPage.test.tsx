/**
 * Tests for VaultListPage — verifies the page always shows content
 * under every combination of wallet/vault states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VaultListPage } from '../src/components/VaultListPage';

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../src/utils/vaultFetch', () => ({
    fetchVaultStatus: vi.fn(),
}));

import { fetchVaultStatus } from '../src/utils/vaultFetch';
const mockFetch = fetchVaultStatus as ReturnType<typeof vi.fn>;

// Minimal Network stub
const network = { bech32: 'opt' } as never;

const WALLET = 'opt1pabcdef1234567890abcdef1234567890';
const OWNER_U256 = BigInt('0x' + 'ab'.repeat(32));

const defaultProps = {
    network,
    walletAddress: WALLET,
    vaultIds: [1n],
    onSelectVault: vi.fn(),
    onCreateVault: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
        vaultId: 1n,
        status: {
            currentStatus: 1n,
            lastHeartbeatBlock: 1000n,
            currentBlock: 1100n,
            totalDeposited: 100_000n,
            tier1Amount: 10_000n,
            tier2Amount: 90_000n,
            tier1BlocksRemaining: 25_000n,
            tier2BlocksRemaining: 51_000n,
            owner: OWNER_U256,
        },
        error: null,
    });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VaultListPage — always shows content', () => {
    it('renders the "Vaults" heading immediately (before fetch completes)', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByRole('heading', { name: /vaults/i })).toBeInTheDocument();
    });

    it('shows a Loading card while fetch is in-flight', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(<VaultListPage {...defaultProps} />);

        expect(screen.getAllByText('Loading…').length).toBeGreaterThanOrEqual(1);
    });

    it('shows vault details after fetch resolves (vault exists)', async () => {
        render(<VaultListPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText('Open Vault →')).toBeInTheDocument();
        });
    });

    it('shows "Vault #1" as card title', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByText('Vault #1')).toBeInTheDocument();
    });

    it('shows error message in card when fetch errors (does not hide card)', async () => {
        mockFetch.mockResolvedValue({ vaultId: 1n, status: null, error: 'RPC timeout' });

        render(<VaultListPage {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText('RPC timeout')).toBeInTheDocument();
        });
    });

    it('shows fallback text when vaultIds is empty', () => {
        render(<VaultListPage {...defaultProps} vaultIds={[]} />);

        expect(screen.getByText(/no vaults yet/i)).toBeInTheDocument();
    });

    it('always shows "+ New Vault" button', () => {
        render(<VaultListPage {...defaultProps} />);

        expect(screen.getByRole('button', { name: /new vault/i })).toBeInTheDocument();
    });

    it('shows multiple vault cards when multiple IDs provided', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));
        render(<VaultListPage {...defaultProps} vaultIds={[1n, 2n, 5n]} />);

        expect(screen.getByText('Vault #1')).toBeInTheDocument();
        expect(screen.getByText('Vault #2')).toBeInTheDocument();
        expect(screen.getByText('Vault #5')).toBeInTheDocument();
    });
});
