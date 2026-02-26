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
    onCheckInAll?: () => void;
    checkInAllSubmitting?: boolean;
    checkInAllSubmitted?: boolean;
}

export function VaultListPage({
    network,
    walletAddress: _walletAddress,
    vaultIds,
    onSelectVault,
    onCreateVault,
    onCheckInAll,
    checkInAllSubmitting,
    checkInAllSubmitted,
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
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {onCheckInAll && (
                        <button
                            className="btn-checkin"
                            disabled={checkInAllSubmitting || checkInAllSubmitted}
                            onClick={onCheckInAll}
                        >
                            {checkInAllSubmitting ? (
                                <><span className="btn-trigger__spinner" />Sending…</>
                            ) : checkInAllSubmitted ? (
                                <>✓ Submitted</>
                            ) : (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.471.696l2.5 1a.75.75 0 00.557-1.392L8.5 7.742V4.75z" />
                                    </svg>
                                    Reset All Countdowns
                                </>
                            )}
                        </button>
                    )}
                    <button className="btn-new-vault" onClick={onCreateVault}>+ New Vault</button>
                </div>
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
