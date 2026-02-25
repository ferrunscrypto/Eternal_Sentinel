import { useEffect, useState } from 'react';
import { Network } from '@btc-vision/bitcoin';
import { fetchVaultStatus, VaultSummary } from '../utils/vaultFetch';
import { STATUS_LABELS } from '../types/sentinel';

interface VaultCardProps {
    vaultId: bigint;
    network: Network;
    onOpen: () => void;
}

function satsToBtc(sats: bigint): string {
    return (Number(sats) / 1e8).toFixed(8);
}

function statusColor(status: bigint): string {
    if (status === 1n) return '#00d4aa';
    if (status === 2n) return '#ffb020';
    if (status === 3n) return '#555970';
    return '#555970';
}

function VaultCard({ vaultId, network, onOpen }: VaultCardProps) {
    const [summary, setSummary] = useState<VaultSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        setSummary(null);
        void fetchVaultStatus(vaultId, network).then(s => {
            setSummary(s);
            setLoading(false);
        });
    }, [vaultId, network]);

    const statusLabel = summary?.status
        ? (STATUS_LABELS[String(summary.status.currentStatus)] ?? 'Unknown')
        : loading ? '—' : '—';

    const color = summary?.status ? statusColor(summary.status.currentStatus) : 'var(--text-dim)';

    return (
        <div className="vault-card">
            <div className="vault-card__top">
                <div className="vault-card__addr">
                    <span className="vault-card__addr-text">Vault #{vaultId.toString()}</span>
                </div>
            </div>

            {loading ? (
                <div className="vault-card__loading">Loading…</div>
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

            <button className="vault-card__open" onClick={onOpen} disabled={loading}>
                {loading ? 'Loading…' : 'Open Vault →'}
            </button>
        </div>
    );
}

interface VaultListPageProps {
    network: Network;
    walletAddress: string;
    vaultIds: bigint[];
    onSelectVault: (vaultId: bigint) => void;
    onCreateVault: () => void;
}

export function VaultListPage({
    network,
    walletAddress: _walletAddress,
    vaultIds,
    onSelectVault,
    onCreateVault,
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
                <button className="btn-new-vault" onClick={onCreateVault}>+ New Vault</button>
            </div>

            {vaultIds.length === 0 ? (
                <div className="vault-list-empty">No vaults yet. Create your first vault to get started.</div>
            ) : (
                <div className="vault-list-grid">
                    {vaultIds.map(id => (
                        <VaultCard
                            key={id.toString()}
                            vaultId={id}
                            network={network}
                            onOpen={() => onSelectVault(id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
