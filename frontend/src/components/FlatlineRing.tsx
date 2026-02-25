import { SentinelStatus, TIER_1_BLOCKS } from '../types/sentinel';

interface FlatlineRingProps {
    readonly status: SentinelStatus;
}


export function FlatlineRing({ status }: FlatlineRingProps) {
    const isFinalized = status.currentStatus === 3n;
    const isActive = status.currentStatus === 1n;
    const isTier1Released = status.currentStatus === 2n;

    const radius = 95;
    const circumference = 2 * Math.PI * radius;

    let healthPct = 0;
    let strokeColor = '#555970';

    if (isActive) {
        healthPct = Number((status.tier1BlocksRemaining * 100n) / TIER_1_BLOCKS);
        if (healthPct > 50) strokeColor = '#00d4aa';
        else if (healthPct > 20) strokeColor = '#ffb020';
        else strokeColor = '#ff4d6a';
    } else if (isTier1Released) {
        healthPct = 8;
        strokeColor = '#ff4d6a';
    }

    const offset = circumference * (1 - healthPct / 100);

    // Center label
    let centerLabel = '';
    if (isFinalized) {
        centerLabel = 'FLATLINED';
    } else if (isTier1Released) {
        centerLabel = 'TIER 1';
    } else if (isActive) {
        centerLabel = `${Math.round(healthPct)}%`;
    }

    const isPulsing = isActive;

    return (
        <div className="flatline">
            <div className="flatline__ring-wrapper">
                <svg width="220" height="220" viewBox="0 0 220 220">
                    {/* Track */}
                    <circle
                        cx="110" cy="110" r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.04)"
                        strokeWidth="6"
                    />
                    {/* Progress arc */}
                    {!isFinalized && (
                        <circle
                            cx="110" cy="110" r={radius}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            transform="rotate(-90 110 110)"
                            opacity="0.85"
                            style={{ transition: 'stroke-dashoffset 1.2s ease, stroke 0.8s ease' }}
                        />
                    )}
                    {/* Inner ring */}
                    <circle
                        cx="110" cy="110" r="75"
                        fill="none"
                        stroke="rgba(255,255,255,0.02)"
                        strokeWidth="1"
                    />
                    {/* Pulse rings — only when active */}
                    {isPulsing && (
                        <>
                            <circle
                                cx="110" cy="110" r="12"
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="1.5"
                                opacity="0"
                                className="flatline__pulse-ring flatline__pulse-ring--1"
                            />
                            <circle
                                cx="110" cy="110" r="12"
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="1"
                                opacity="0"
                                className="flatline__pulse-ring flatline__pulse-ring--2"
                            />
                        </>
                    )}
                    {/* Center dot */}
                    <circle
                        cx="110" cy="110" r="4"
                        fill={isFinalized ? '#555970' : strokeColor}
                        opacity={isFinalized ? 0.3 : 1}
                        className={isPulsing ? 'flatline__center-dot--pulse' : ''}
                    />
                    {/* Flatline bar for finalized */}
                    {isFinalized && (
                        <line
                            x1="70" y1="110" x2="150" y2="110"
                            stroke="#555970"
                            strokeWidth="2"
                            opacity="0.3"
                        />
                    )}
                </svg>

                {/* Show FLATLINED / TIER 1 labels inside ring only for non-active states */}
                {!isActive && centerLabel && (
                    <div className="flatline__center">
                        <div className="flatline__pct">{centerLabel}</div>
                    </div>
                )}
            </div>

            <div className="flatline__status">
                <div className={`flatline__dot${isFinalized ? ' flatline__dot--finalized' : ''}${isPulsing ? ' flatline__dot--pulse' : ''}`} />
                {isFinalized
                    ? 'Vault Finalized'
                    : isTier1Released
                        ? 'Tier 1 Released'
                        : 'Heartbeat Active'}
                {isActive && (
                    <span className={`flatline__status-pct${healthPct <= 20 ? ' flatline__status-pct--danger' : ''}`}>
                        {Math.round(healthPct)}%
                    </span>
                )}
            </div>
        </div>
    );
}
