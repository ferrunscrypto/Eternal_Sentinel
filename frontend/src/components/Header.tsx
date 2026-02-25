import { useEffect, useState } from 'react';
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { getNetworkName, getNetworkNameFromChainType } from '../config/networks';

function formatAddress(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

type OpnetWindow = { on: (e: string, fn: (info: { enum: string }) => void) => void; removeListener: (e: string, fn: (info: { enum: string }) => void) => void };

export function Header() {
    const { network, walletAddress, connectToWallet, openConnectModal, disconnect, connecting } = useWalletConnect();
    const baseNetworkName = network ? getNetworkName(network) : null;

    // Bypass walletconnect stale-closure bug: listen directly to window.opnet chainChanged
    const [liveNetworkName, setLiveNetworkName] = useState<string | null>(null);

    useEffect(() => {
        const opnet = (window as unknown as { opnet?: OpnetWindow }).opnet;
        if (!opnet) return;

        const handler = (chainInfo: { enum: string }) => {
            setLiveNetworkName(getNetworkNameFromChainType(chainInfo.enum));
        };

        opnet.on('chainChanged', handler);
        return () => { opnet.removeListener('chainChanged', handler); };
    }, []);

    // Reset live override when wallet disconnects
    useEffect(() => {
        if (!walletAddress) setLiveNetworkName(null);
    }, [walletAddress]);

    const networkName = liveNetworkName ?? baseNetworkName;

    return (
        <header className="header">
            <div className="header__inner">
                <div className="header__brand">
                    <svg className="header__icon" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="28" stroke="#ff4d6a" strokeWidth="1.5" opacity="0.2" />
                        <circle cx="32" cy="32" r="20" stroke="#ff4d6a" strokeWidth="1.5" opacity="0.3" />
                        <circle cx="32" cy="32" r="12" stroke="#555970" strokeWidth="2" opacity="0.5" />
                        <circle cx="32" cy="32" r="4" fill="#555970" />
                    </svg>
                    <div>
                        <div className="header__title">Eternal Sentinel</div>
                    </div>
                </div>
                <div className="header__wallet">
                    {networkName && <span className="header__network">{networkName}</span>}
                    {walletAddress ? (
                        <>
                            <span className="header__address">{formatAddress(walletAddress)}</span>
                            <button className="header__btn" onClick={disconnect}>Disconnect</button>
                        </>
                    ) : (
                        <>
                            <button className="header__btn header__btn--connect" onClick={() => connectToWallet(SupportedWallets.OP_WALLET)} disabled={connecting}>
                                {connecting ? 'Connecting...' : 'OP_WALLET'}
                            </button>
                            <button className="header__btn" onClick={openConnectModal} disabled={connecting}>Other</button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
