import { networks, Network } from '@btc-vision/bitcoin';

export interface NetworkConfig {
    readonly name: string;
    readonly rpcUrl: string;
    readonly explorerUrl: string;
}

export const NETWORK_CONFIGS: Map<string, NetworkConfig> = new Map([
    ['mainnet', {
        name: 'Mainnet',
        rpcUrl: 'https://mainnet.opnet.org',
        explorerUrl: 'https://explorer.opnet.org',
    }],
    ['testnet', {
        name: 'OPNet Testnet',
        rpcUrl: 'https://testnet.opnet.org',
        explorerUrl: 'https://mempool.opnet.org/testnet4/tx/',
    }],
    ['regtest', {
        name: 'Regtest',
        rpcUrl: 'https://regtest.opnet.org',
        explorerUrl: 'https://regtest.opnet.org',
    }],
]);

/**
 * Resolve network identity from any Network-like object.
 * WalletConnectNetwork extends Network and adds `.network` string, `.bech32`, `.chainType`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNetworkId(network: any): string {
    if (!network) return 'unknown';

    // 1. Direct .network string (WalletConnectNetwork sets this)
    const netStr: unknown = network.network;
    if (typeof netStr === 'string') {
        const n = netStr.toLowerCase();
        if (n === 'mainnet' || n === 'livenet' || n === 'bitcoin') return 'mainnet';
        if (n === 'testnet' || n === 'signet') return 'testnet';
        if (n === 'regtest') return 'regtest';
    }

    // 2. chainType from WalletConnectNetwork (UnisatChainType enum)
    const chainType: unknown = network.chainType;
    if (typeof chainType === 'string') {
        const ct = chainType.toLowerCase();
        if (ct.includes('mainnet')) return 'mainnet';
        if (ct.includes('opnet') || ct.includes('testnet') || ct.includes('signet')) return 'testnet';
        if (ct.includes('regtest')) return 'regtest';
    }

    // 3. bech32 prefix
    const bech32: unknown = network.bech32;
    if (typeof bech32 === 'string') {
        if (bech32 === 'bc') return 'mainnet';
        if (bech32 === 'opt' || bech32 === 'tb') return 'testnet';
        if (bech32 === 'bcrt') return 'regtest';
    }

    // 4. pubKeyHash (mainnet=0x00, testnet/regtest/opnetTestnet=0x6f)
    const pkh: unknown = network.pubKeyHash;
    if (typeof pkh === 'number') {
        if (pkh === 0) return 'mainnet';
    }

    // 5. Strict reference equality (last resort)
    if (network === networks.bitcoin) return 'mainnet';
    if (network === networks.opnetTestnet) return 'testnet';
    if (network === networks.regtest) return 'regtest';

    console.warn('[EternalSentinel] Unknown network object:', JSON.stringify(network));
    return 'unknown';
}

export function getNetworkName(network: Network): string {
    const id = getNetworkId(network);
    const config = NETWORK_CONFIGS.get(id);
    return config?.name ?? id;
}

/** Maps a raw UnisatChainType string (from window.opnet chainChanged event) to a display name. */
export function getNetworkNameFromChainType(chainType: string): string {
    switch (chainType) {
        case 'OPNET_TESTNET': return 'OPNet Testnet';
        case 'BITCOIN_MAINNET': return 'Mainnet';
        case 'BITCOIN_REGTEST': return 'Regtest';
        case 'BITCOIN_TESTNET': return 'Testnet';
        case 'BITCOIN_TESTNET4': return 'Testnet4';
        case 'BITCOIN_SIGNET': return 'Signet';
        default: return chainType;
    }
}

export function getRpcUrl(network: Network): string {
    const id = getNetworkId(network);
    const config = NETWORK_CONFIGS.get(id);
    if (!config) {
        throw new Error(`Unsupported network: ${id}`);
    }
    return config.rpcUrl;
}
