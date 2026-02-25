import { useEffect, useState } from 'react';
import { Network } from '@btc-vision/bitcoin';
import { fetchVaultSummary, VaultSummary } from '../utils/vaultFetch';
import { STATUS_LABELS } from '../types/sentinel';

interface VaultCardProps {
    ownerAddress: string;
    network: Network;
    isConnectedWallet: boolean;
    onOpen: () => void;
    onCreateVault: () => void;
}

function satsToBtc(sats: bigint): string {
    return (Number(sats) / 1e8).toFixed(8);
}

function abbrev(addr: string): string {
    if (addr.length <= 20) return addr;
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function statusColor(status: bigint): string {
    if (status === 1n) return '#00d4aa';
    if (status === 2n) return '#ffb020';
    if (status === 3n) return '#555970';
    return '#555970';
}

function VaultCard({ ownerAddress, network, isConnectedWallet, onOpen, onCreateVault }: VaultCardProps) {
    const [summary, setSummary] = useState<VaultSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        setSummary(null);
        void fetchVaultSummary(ownerAddress, network).then(s => {
            setSummary(s);
            setLoading(false);
        });
    }, [ownerAddress, network]);

    const hasVault = summary?.hasVault === true;
    const noVault = summary?.hasVault === false && !summary?.error;

    const statusLabel = summary?.status
        ? (STATUS_LABELS[String(summary.status.currentStatus)] ?? 'Unknown')
        : noVault ? 'No vault yet' : loading ? '—' : '—';

    const color = summary?.status ? statusColor(summary.status.currentStatus) : 'var(--text-dim)';

    return (
        <div className={`vault-card${noVault ? ' vault-card--empty' : ''}`}>
            <div className="vault-card__top">
                <div className="vault-card__addr">
                    <span className="vault-card__addr-text">{abbrev(ownerAddress)}</span>
                    {isConnectedWallet && <span className="vault-card__you-badge">You</span>}
                </div>
            </div>

            {loading ? (
                <div className="vault-card__loading">Loading…</div>
            ) : (
                <>
                    {noVault ? (
                        <div className="vault-card__no-vault">
                            <svg width="28" height="28" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.3 }}>
                                <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                                <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1" strokeDasharray="4 4" />
                                <circle cx="32" cy="32" r="4" fill="#555970" />
                            </svg>
                            <span>No vault created yet</span>
                        </div>
                    ) : (
                        <>
                            <div className="vault-card__row">
                                <span className="vault-card__label">Status</span>
                                <span className="vault-card__value" style={{ color }}>{statusLabel}</span>
                            </div>
                            {summary?.status && (
                                <>
                                    <div className="vault-card__row">
                                        <span className="vault-card__label">Deposited</span>
                                        <span className="vault-card__value">{satsToBtc(summary.status.totalDeposited)} BTC</span>
                                    </div>
                                    <div className="vault-card__row">
                                        <span className="vault-card__label">Last heartbeat</span>
                                        <span className="vault-card__value">Block {summary.status.lastHeartbeatBlock.toString()}</span>
                                    </div>
                                </>
                            )}
                            {summary?.error && (
                                <div className="vault-card__error">{summary.error}</div>
                            )}
                        </>
                    )}
                </>
            )}

            {noVault ? (
                <button className="vault-card__open vault-card__open--create" onClick={onCreateVault}>
                    Create Vault →
                </button>
            ) : (
                <button className="vault-card__open" onClick={onOpen} disabled={loading || (!hasVault && !summary?.error)}>
                    {loading ? 'Loading…' : 'Open Vault →'}
                </button>
            )}
        </div>
    );
}

interface VaultListPageProps {
    network: Network;
    walletAddress: string;
    trackedVaults: string[];
    onSelectVault: (ownerAddress: string) => void;
    onCreateVault: () => void;
    connectedWalletHasVault: boolean | null;
}

export function VaultListPage({
    network,
    walletAddress,
    trackedVaults,
    onSelectVault,
    onCreateVault,
    connectedWalletHasVault,
}: VaultListPageProps) {
    return (
        <div className="vault-list-page">
            <div className="vault-list-page__header">
                <div>
                    <h1 className="vault-list-page__title">Vaults</h1>
                    <p className="vault-list-page__sub">
                        Select a vault to manage, or create a new one.
                    </p>
                </div>
                {connectedWalletHasVault === true && (
                    <button className="btn-new-vault" onClick={onCreateVault}>+ New Vault</button>
                )}
            </div>

            {trackedVaults.length === 0 ? (
                <div className="vault-list-empty">Connect your wallet to view vaults.</div>
            ) : (
                <div className="vault-list-grid">
                    {trackedVaults.map(addr => (
                        <VaultCard
                            key={addr}
                            ownerAddress={addr}
                            network={network}
                            isConnectedWallet={addr === walletAddress}
                            onOpen={() => onSelectVault(addr)}
                            onCreateVault={onCreateVault}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
