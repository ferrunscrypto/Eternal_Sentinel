import { useState, useEffect } from 'react';
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { Header } from './components/Header';
import { FlatlineRing } from './components/FlatlineRing';
import { VaultCompact } from './components/VaultCompact';
import { TierStepper } from './components/TierStepper';
import { VaultListPage } from './components/VaultListPage';
import { useSentinel } from './hooks/useSentinel';
import { fetchVaultSummary } from './utils/vaultFetch';

export function App() {
    const { network, walletAddress, connectToWallet, connecting } = useWalletConnect();

    // ── Vault list state ────────────────────────────────────────────────────────
    // Always derived from connected wallet only — no localStorage persistence needed
    const trackedVaults = walletAddress ? [walletAddress] : [];
    const [selectedOwner, setSelectedOwner] = useState<string | null>(null);

    // Whether the connected wallet already has a vault (for the list page CTA)
    const [walletHasVault, setWalletHasVault] = useState<boolean | null>(null);

    // Clear any stale localStorage entries from previous sessions
    useEffect(() => { localStorage.removeItem('es_tracked_vaults'); }, []);

    // Check if connected wallet has a vault
    useEffect(() => {
        if (!walletAddress || !network) return;
        void fetchVaultSummary(walletAddress, network).then(s => {
            // Only update if the call succeeded — errors leave state as null (unknown)
            if (!s.error) setWalletHasVault(s.hasVault);
        });
    }, [walletAddress, network]);

    // ── Vault creation state ────────────────────────────────────────────────────
    const [beneficiaryInput, setBeneficiaryInput] = useState('');
    const [vaultTxSubmitted, setVaultTxSubmitted] = useState(false);
    const [creatingVault, setCreatingVault] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // ── Deposit state ───────────────────────────────────────────────────────────
    const [depositInput, setDepositInput] = useState('');
    const [depositSubmitting, setDepositSubmitting] = useState(false);

    // ── Check-in state ──────────────────────────────────────────────────────────
    const [checkInSubmitting, setCheckInSubmitting] = useState(false);
    const [checkInSubmitted, setCheckInSubmitted] = useState(false);

    // ── useSentinel — scoped to selected owner ──────────────────────────────────
    const {
        status,
        loading,
        error,
        isOwner,
        connected,
        contractDeployed,
        triggerTier1,
        triggerTier2,
        createVault,
        checkIn,
        deposit,
    } = useSentinel(selectedOwner);

    // When vault is confirmed after creation, update walletHasVault flag
    useEffect(() => {
        if (status && walletAddress && selectedOwner === walletAddress) {
            setWalletHasVault(true);
        }
    }, [status, walletAddress, selectedOwner]);

    // Poll for vault confirmation after tx is submitted
    useEffect(() => {
        if (!vaultTxSubmitted || !walletAddress || !network) return;
        let cancelled = false;
        const poll = setInterval(() => {
            void fetchVaultSummary(walletAddress, network).then(s => {
                if (cancelled) return;
                if (s.hasVault) {
                    clearInterval(poll);
                    setVaultTxSubmitted(false);
                    setWalletHasVault(true);
                    handleSelectVault(walletAddress);
                }
            });
        }, 8_000);
        return () => { cancelled = true; clearInterval(poll); };
    }, [vaultTxSubmitted, walletAddress, network]);

    // ── Vault list handlers ─────────────────────────────────────────────────────
    const handleSelectVault = (addr: string) => {
        setSelectedOwner(addr);
        setShowCreateForm(false);
        setVaultTxSubmitted(false);
    };

    const handleBack = () => {
        setSelectedOwner(null);
        setShowCreateForm(false);
        setVaultTxSubmitted(false);
        // Refresh walletHasVault in case a vault was just created
        if (walletAddress && network) {
            void fetchVaultSummary(walletAddress, network).then(s => { if (!s.error) setWalletHasVault(s.hasVault); });
        }
    };

    // ── Early returns ───────────────────────────────────────────────────────────

    if (!connected) {
        return (
            <>
                <Header />
                <div className="empty-state">
                    <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                        <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1.5" />
                        <circle cx="32" cy="32" r="4" fill="#555970" />
                    </svg>
                    <h2 className="empty-state__title">Connect to View Vaults</h2>
                    <p className="empty-state__desc">
                        Connect your wallet to view and manage inheritance vaults.
                    </p>
                    <button className="btn-connect" onClick={() => connectToWallet(SupportedWallets.OP_WALLET)} disabled={connecting}>
                        {connecting ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                </div>
            </>
        );
    }

    if (!contractDeployed) {
        return (
            <>
                <Header />
                <div className="empty-state">
                    <svg className="empty-state__icon" viewBox="0 0 16 16" fill="#ffb020" style={{ opacity: 0.6 }}>
                        <path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6.5a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                    <h2 className="empty-state__title">Contract Not Deployed</h2>
                    <p className="empty-state__desc">The Eternal Sentinel contract is not deployed on this network.</p>
                </div>
            </>
        );
    }

    // ── No vault selected — show list / create page ─────────────────────────────

    if (!selectedOwner) {
        // If wallet has no vault, go straight to create form (skip the vault list)
        if (walletHasVault === false && !vaultTxSubmitted) {
            const canCreate = beneficiaryInput.trim().length > 10;
            return (
                <>
                    <Header />
                    <div className="empty-state">
                        <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.5 }}>
                            <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                            <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1" strokeDasharray="4 4" />
                            <circle cx="32" cy="32" r="4" fill="#555970" />
                        </svg>
                        <h2 className="empty-state__title">Create Your Vault</h2>
                        <p className="empty-state__desc">Enter the beneficiary address who will receive the funds.</p>
                        <div className="create-vault-form">
                            <input
                                className="create-vault-form__input"
                                type="text"
                                placeholder="Beneficiary address (opt1p…)"
                                value={beneficiaryInput}
                                onChange={e => setBeneficiaryInput(e.target.value)}
                                spellCheck={false}
                            />
                            <button
                                className="btn-connect"
                                onClick={() => {
                                    setCreatingVault(true);
                                    void createVault(beneficiaryInput.trim())
                                        .then(ok => {
                                            setCreatingVault(false);
                                            if (ok) setVaultTxSubmitted(true);
                                        })
                                        .catch(() => setCreatingVault(false));
                                }}
                                disabled={!canCreate || creatingVault}
                            >
                                {creatingVault ? 'Waiting for signature...' : 'Create Vault'}
                            </button>
                        </div>
                    </div>
                </>
            );
        }

        // Tx submitted — waiting for confirmation
        if (vaultTxSubmitted) {
            return (
                <>
                    <Header />
                    <div className="empty-state">
                        <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.5 }}>
                            <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                            <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1" strokeDasharray="4 4" />
                            <circle cx="32" cy="32" r="4" fill="#555970" />
                        </svg>
                        <h2 className="empty-state__title">Transaction Submitted</h2>
                        <p className="empty-state__desc">Vault creation transaction sent. Waiting for on-chain confirmation…</p>
                        <span className="btn-trigger__spinner" style={{ width: 24, height: 24, marginTop: '1rem' }} />
                    </div>
                </>
            );
        }

        // Show create vault form (triggered manually via "+ New Vault" from vault list)
        if (showCreateForm) {
            const canCreate = beneficiaryInput.trim().length > 10;
            return (
                <>
                    <Header />
                    <div className="empty-state">
                        <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.5 }}>
                            <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                            <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1" strokeDasharray="4 4" />
                            <circle cx="32" cy="32" r="4" fill="#555970" />
                        </svg>
                        <h2 className="empty-state__title">Create Your Vault</h2>
                        <p className="empty-state__desc">Enter the beneficiary address who will receive the funds.</p>
                        <div className="create-vault-form">
                            <input
                                className="create-vault-form__input"
                                type="text"
                                placeholder="Beneficiary address (opt1p…)"
                                value={beneficiaryInput}
                                onChange={e => setBeneficiaryInput(e.target.value)}
                                spellCheck={false}
                            />
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="btn-connect" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setShowCreateForm(false)}>
                                    Back
                                </button>
                                <button
                                    className="btn-connect"
                                    onClick={() => {
                                        setCreatingVault(true);
                                        void createVault(beneficiaryInput.trim())
                                            .then(ok => {
                                                setCreatingVault(false);
                                                if (ok) {
                                                    setShowCreateForm(false);
                                                    setVaultTxSubmitted(true);
                                                }
                                            })
                                            .catch(() => setCreatingVault(false));
                                    }}
                                    disabled={!canCreate || creatingVault}
                                >
                                    {creatingVault ? 'Waiting for signature...' : 'Create Vault'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            );
        }

        return (
            <>
                <Header />
                <VaultListPage
                    network={network!}
                    walletAddress={walletAddress!}
                    trackedVaults={trackedVaults}
                    onSelectVault={handleSelectVault}
                    onCreateVault={() => setShowCreateForm(true)}
                    connectedWalletHasVault={walletHasVault}
                />
            </>
        );
    }

    // ── Vault detail view ───────────────────────────────────────────────────────

    if (!status && loading) {
        return (
            <>
                <Header />
                <div className="empty-state">
                    <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.4 }}>
                        <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                        <circle cx="32" cy="32" r="4" fill="#555970" />
                    </svg>
                    <h2 className="empty-state__title">Loading Vault…</h2>
                    <p className="empty-state__desc">Fetching vault data from OPNet.</p>
                </div>
            </>
        );
    }

    if (!status && !loading) {
        return (
            <>
                <Header />
                <div className="empty-state">
                    <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.5 }}>
                        <circle cx="32" cy="32" r="28" stroke="#555970" strokeWidth="1.5" />
                        <circle cx="32" cy="32" r="20" stroke="#555970" strokeWidth="1" strokeDasharray="4 4" />
                        <circle cx="32" cy="32" r="4" fill="#555970" />
                    </svg>
                    <h2 className="empty-state__title">No Vault Found</h2>
                    <p className="empty-state__desc">No vault exists for this address.</p>
                    <button className="btn-connect" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', marginTop: '0' }} onClick={handleBack}>
                        ← Back to Vaults
                    </button>
                </div>
            </>
        );
    }

    const s = status!;
    const isFinalized = s.currentStatus === 3n;

    return (
        <>
            <Header />
            <div className="legacy">
                {/* Back navigation */}
                <button className="vault-detail__back" onClick={handleBack}>
                    ← All Vaults
                </button>

                {/* Viewing notice — show when looking at another address's vault */}
                {selectedOwner !== walletAddress && (
                    <div className="readonly-notice">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0114.25 14H1.75A1.75 1.75 0 010 12.25v-8.5C0 2.784.784 2 1.75 2zM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V5.809L8.38 9.397a.75.75 0 01-.76 0L1.5 5.809v6.442zm13-8.181L8 7.88 1.5 4.07V3.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v.32z" />
                        </svg>
                        Viewing vault for: {selectedOwner.slice(0, 10)}…{selectedOwner.slice(-8)}
                    </div>
                )}

                {error && (
                    <div className="alert alert--error">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 10.5a.75.75 0 100-1.5.75.75 0 000 1.5zM8 4a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 4z" />
                        </svg>
                        {error}
                    </div>
                )}

                {!isOwner && selectedOwner === walletAddress && !isFinalized && (
                    <div className="readonly-notice">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4 4v2h-.25A1.75 1.75 0 002 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 13.25v-5.5A1.75 1.75 0 0012.25 6H12V4a4 4 0 00-8 0zm6 2V4a2 2 0 00-4 0v2h4z" />
                        </svg>
                        Read-only mode — connect the owner wallet to manage this vault
                    </div>
                )}

                <div className="legacy__split">
                    <div className="legacy__left">
                        <FlatlineRing status={s} />
                        <VaultCompact status={s} />
                    </div>
                    <div>
                        <TierStepper
                            status={s}
                            loading={loading}
                            onTriggerTier1={() => triggerTier1(selectedOwner ?? undefined)}
                            onTriggerTier2={() => triggerTier2(selectedOwner ?? undefined)}
                        />
                    </div>
                </div>

                {/* Heartbeat check-in — owner only, active status only */}
                {isOwner && s.currentStatus === 1n && (
                    <div className="checkin-section">
                        <div className="checkin-section__left">
                            <div className="checkin-section__title">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.471.696l2.5 1a.75.75 0 00.557-1.392L8.5 7.742V4.75z" />
                                </svg>
                                I'm Alive
                            </div>
                            <div className="checkin-section__desc">
                                Resets the countdown timer — proves you are still in control of this vault.
                            </div>
                        </div>
                        <button
                            className="btn-checkin"
                            disabled={checkInSubmitting || checkInSubmitted}
                            onClick={() => {
                                setCheckInSubmitting(true);
                                setCheckInSubmitted(false);
                                void checkIn().then((ok) => {
                                    setCheckInSubmitting(false);
                                    if (ok) {
                                        setCheckInSubmitted(true);
                                        setTimeout(() => setCheckInSubmitted(false), 20_000);
                                    }
                                }).catch(() => setCheckInSubmitting(false));
                            }}
                        >
                            {checkInSubmitting ? (
                                <><span className="btn-trigger__spinner" />Sending…</>
                            ) : checkInSubmitted ? (
                                <>✓ Submitted</>
                            ) : (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5H2.75a.75.75 0 010-1.5h4.5V2.75A.75.75 0 018 2z" />
                                    </svg>
                                    Reset Countdown
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Deposit — owner only, not finalized */}
                {isOwner && !isFinalized && (
                    <div className="deposit-section">
                        <div className="deposit-section__title">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1a.75.75 0 01.75.75V7h5.25a.75.75 0 010 1.5H8.75v5.25a.75.75 0 01-1.5 0V8.5H2a.75.75 0 010-1.5h5.25V1.75A.75.75 0 018 1z" />
                            </svg>
                            Deposit BTC
                        </div>
                        <div className="deposit-section__row">
                            <input
                                className="deposit-section__input"
                                type="number"
                                min="0"
                                step="0.00001"
                                placeholder="Amount in BTC"
                                value={depositInput}
                                onChange={e => setDepositInput(e.target.value)}
                                disabled={depositSubmitting}
                                spellCheck={false}
                            />
                            <button
                                className="btn-deposit"
                                disabled={depositSubmitting || !depositInput || Number(depositInput) <= 0}
                                onClick={() => {
                                    const sats = BigInt(Math.round(Number(depositInput) * 1e8));
                                    setDepositSubmitting(true);
                                    void deposit(sats).finally(() => {
                                        setDepositSubmitting(false);
                                        setDepositInput('');
                                    });
                                }}
                            >
                                {depositSubmitting ? (
                                    <><span className="btn-trigger__spinner" />Depositing…</>
                                ) : 'Deposit'}
                            </button>
                        </div>
                    </div>
                )}

                {isFinalized && (
                    <div className="finalized-banner">
                        <div className="finalized-banner__badge">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1a3.5 3.5 0 00-3.5 3.5V7H3.75A1.75 1.75 0 002 8.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 14.25v-5.5A1.75 1.75 0 0012.25 7H11.5V4.5A3.5 3.5 0 008 1z" />
                            </svg>
                            VAULT FINALIZED &amp; EMPTIED
                        </div>
                        <div className="finalized-banner__sub">
                            All funds have been released to the beneficiary. This contract is permanently closed.
                        </div>
                    </div>
                )}

                <div className="footer">
                    Eternal Sentinel &mdash; Sovereign Trust on Bitcoin L1 &nbsp;&bull;&nbsp; Powered by <span>OPNet</span>
                </div>
            </div>
        </>
    );
}
