import { SentinelStatus, STATUS_LABELS } from '../types/sentinel';

interface VaultCompactProps {
    readonly status: SentinelStatus;
}

function formatBtc(sats: bigint): string {
    if (sats === 0n) return '0.00000000';
    const whole = sats / 100_000_000n;
    const frac = (sats % 100_000_000n).toString().padStart(8, '0');
    return `${whole}.${frac}`;
}

export function VaultCompact({ status }: VaultCompactProps) {
    return (
        <div className="vault-compact">
            <div className="vault-compact__title">Vault Overview</div>
            <div className="vault-compact__grid">
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Status</div>
                    <div className="vault-compact__value">
                        {STATUS_LABELS[status.currentStatus.toString()] ?? 'Unknown'}
                    </div>
                </div>
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Total Deposited</div>
                    <div className="vault-compact__value">
                        {formatBtc(status.totalDeposited)} BTC
                    </div>
                </div>
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Tier 1 (10%)</div>
                    <div className="vault-compact__value vault-compact__value--gold">
                        {formatBtc(status.tier1Amount)} BTC
                    </div>
                </div>
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Tier 2 (90%)</div>
                    <div className="vault-compact__value vault-compact__value--gold">
                        {formatBtc(status.tier2Amount)} BTC
                    </div>
                </div>
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Last Heartbeat</div>
                    <div className="vault-compact__value">
                        Block {status.lastHeartbeatBlock.toString()}
                    </div>
                </div>
                <div className="vault-compact__item">
                    <div className="vault-compact__label">Current Block</div>
                    <div className="vault-compact__value">
                        {status.currentBlock.toString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
