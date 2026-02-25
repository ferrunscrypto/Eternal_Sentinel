import { Network } from '@btc-vision/bitcoin';
import { getNetworkId } from './networks';

export interface ContractAddresses {
    readonly sentinel: string;
}

const CONTRACT_ADDRESSES: Map<string, ContractAddresses> = new Map([
    ['regtest', {
        sentinel: 'opr1sqp533uq2wu5khzwmh5m76kxguln5h64kqyy2hc86',
    }],
    ['testnet', {
        sentinel: 'opt1sqzxtax4v98vkplet6ue8kuky4gdv0t3f359xgx24',
    }],
    ['mainnet', {
        sentinel: 'YOUR_MAINNET_CONTRACT_ADDRESS',
    }],
]);

/**
 * Returns the contract address or null if not configured / not deployed yet.
 */
export function getContractAddress(
    contract: keyof ContractAddresses,
    network: Network,
): string | null {
    const key = getNetworkId(network);
    const addresses = CONTRACT_ADDRESSES.get(key);
    if (!addresses) return null;

    const address = addresses[contract];
    if (!address || address.startsWith('YOUR_')) return null;

    return address;
}
