import { SentinelStatus, BLOCKS_PER_DAY, BLOCKS_PER_HOUR } from '../types/sentinel';

interface TierStepperProps {
    readonly status: SentinelStatus;
    readonly loading: boolean;
    readonly onTriggerTier1: () => Promise<boolean>;
    readonly onTriggerTier2: () => Promise<boolean>;
}

function formatBtc(sats: bigint): string {
    if (sats === 0n) return '0.00000000';
    const whole = sats / 100_000_000n;
    const frac = (sats % 100_000_000n).toString().padStart(8, '0');
    return `${whole}.${frac}`;
}

function blocksToTime(blocks: bigint): string {
    if (blocks <= 0n) return 'Now';
    const days = blocks / BLOCKS_PER_DAY;
    const hours = (blocks % BLOCKS_PER_DAY) / BLOCKS_PER_HOUR;
    const parts: string[] = [];
    if (days > 0n) parts.push(`~${days}d`);
    if (hours > 0n) parts.push(`${hours}h`);
    return parts.length > 0 ? parts.join(' ') : `${blocks} blocks`;
}

type TierState = 'pending' | 'ready' | 'done';

function getTier1State(status: SentinelStatus): TierState {
    if (status.currentStatus >= 2n) return 'done';
    if (status.tier1BlocksRemaining === 0n && status.currentStatus === 1n) return 'ready';
    return 'pending';
}

function getTier2State(status: SentinelStatus): TierState {
    if (status.currentStatus === 3n) return 'done';
    if (status.tier2BlocksRemaining === 0n && status.currentStatus === 2n) return 'ready';
    return 'pending';
}

export function TierStepper({ status, loading, onTriggerTier1, onTriggerTier2 }: TierStepperProps) {
    const tier1 = getTier1State(status);
    const tier2 = getTier2State(status);

    return (
        <div className="stepper">
            {/* Tier 1 Node */}
            <div className={`stepper__node stepper__node--${tier1}`}>
                <div className={`stepper__dot stepper__dot--${tier1}`}>
                    {tier1 === 'done' && (
                        <svg viewBox="0 0 16 16" fill="#00d4aa">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                        </svg>
                    )}
                </div>

                <div className="stepper__header">
                    <span className="stepper__title">Tier 1 -- Immediate Relief</span>
                    <span className={`stepper__badge stepper__badge--${tier1}`}>
                        {tier1 === 'done' ? 'Released' : tier1 === 'ready' ? 'Ready' : `${status.tier1BlocksRemaining.toString()} blocks`}
                    </span>
                </div>

                <div className="stepper__desc">
                    Releases 10% of the vault to the beneficiary after 6 months (~26,280 blocks) of owner inactivity.
                </div>

                <div className="stepper__meta">
                    <div className="stepper__meta-item">
                        Amount: <span className="stepper__meta-value">{formatBtc(status.tier1Amount)} BTC</span>
                    </div>
                    <div className="stepper__meta-item">
                        Duration: <span className="stepper__meta-value">~6 months</span>
                    </div>
                </div>

                {tier1 === 'pending' && status.tier1BlocksRemaining > 0n && (
                    <div className="stepper__countdown">
                        <svg className="stepper__countdown-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 3.5a.5.5 0 00-1 0V8a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 7.71V3.5z" />
                            <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z" />
                        </svg>
                        {blocksToTime(status.tier1BlocksRemaining)} remaining ({status.tier1BlocksRemaining.toString()} blocks)
                    </div>
                )}

                {tier1 === 'ready' && (
                    <button
                        className="btn-trigger btn-trigger--tier1"
                        onClick={() => void onTriggerTier1()}
                        disabled={loading}
                    >
                        {loading ? <><span className="btn-trigger__spinner" />Processing...</> : 'Trigger Tier 1 Release'}
                    </button>
                )}
            </div>

            {/* Tier 2 Node */}
            <div className={`stepper__node stepper__node--${tier2}`}>
                <div className={`stepper__dot stepper__dot--${tier2}`}>
                    {tier2 === 'done' && (
                        <svg viewBox="0 0 16 16" fill="#00d4aa">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                        </svg>
                    )}
                </div>

                <div className="stepper__header">
                    <span className="stepper__title">Tier 2 -- Full Inheritance</span>
                    <span className={`stepper__badge stepper__badge--${tier2}`}>
                        {tier2 === 'done' ? 'Finalized' : tier2 === 'ready' ? 'Ready' : `${status.tier2BlocksRemaining.toString()} blocks`}
                    </span>
                </div>

                <div className="stepper__desc">
                    Releases the remaining 90% and permanently finalizes the contract after 12 months (~52,560 blocks).
                </div>

                <div className="stepper__meta">
                    <div className="stepper__meta-item">
                        Amount: <span className="stepper__meta-value">{formatBtc(status.tier2Amount)} BTC</span>
                    </div>
                    <div className="stepper__meta-item">
                        Duration: <span className="stepper__meta-value">~12 months</span>
                    </div>
                </div>

                {tier2 === 'pending' && status.tier2BlocksRemaining > 0n && (
                    <div className="stepper__countdown">
                        <svg className="stepper__countdown-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 3.5a.5.5 0 00-1 0V8a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 7.71V3.5z" />
                            <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z" />
                        </svg>
                        {blocksToTime(status.tier2BlocksRemaining)} remaining ({status.tier2BlocksRemaining.toString()} blocks)
                    </div>
                )}

                {tier2 === 'ready' && (
                    <button
                        className="btn-trigger btn-trigger--tier2"
                        onClick={() => void onTriggerTier2()}
                        disabled={loading}
                    >
                        {loading ? <><span className="btn-trigger__spinner" />Processing...</> : 'Trigger Final Release'}
                    </button>
                )}
            </div>
        </div>
    );
}
