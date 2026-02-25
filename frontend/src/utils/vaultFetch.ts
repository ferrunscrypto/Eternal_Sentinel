import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { contractService } from '../services/ContractService';
import { providerService } from '../services/ProviderService';
import type { SentinelStatus } from '../types/sentinel';

export async function resolveAddress(bech32: string, network: Network): Promise<Address> {
    const provider = providerService.getProvider(network);
    const result = await provider.getPublicKeysInfoRaw(bech32);
    const keys = Object.keys(result);
    const firstKey = keys[0];
    if (!firstKey) throw new Error(`Empty response for address: ${bech32}`);
    const info = result[bech32] ?? result[firstKey];
    if (!info || 'error' in info) throw new Error(`Could not resolve address: ${bech32}`);
    const primaryKey = info.mldsaHashedPublicKey ?? info.tweakedPubkey;
    if (!primaryKey) throw new Error(`No public key data found for ${bech32}`);
    const legacyKey = info.originalPubKey ?? info.tweakedPubkey;
    return Address.fromString(primaryKey, legacyKey);
}

export interface VaultSummary {
    readonly hasVault: boolean;
    readonly status: SentinelStatus | null;
    readonly error: string | null;
}

export async function fetchVaultSummary(
    ownerBech32: string,
    network: Network,
): Promise<VaultSummary> {
    try {
        const contract = contractService.getSentinelContract(network);
        if (!contract) return { hasVault: false, status: null, error: 'Contract not deployed' };

        const addr = await resolveAddress(ownerBech32, network);

        const hasVaultResult = await contract._hasVault(addr as never);
        const hasVault: boolean = hasVaultResult.properties.exists;
        if (!hasVault) return { hasVault: false, status: null, error: null };

        const result = await contract._getStatus(addr as never);
        if ('error' in result && result.error) {
            return { hasVault: true, status: null, error: String(result.error) };
        }

        const p = result.properties;
        return {
            hasVault: true,
            status: {
                currentStatus: p.currentStatus,
                lastHeartbeatBlock: p.lastHeartbeatBlock,
                currentBlock: p.currentBlock,
                totalDeposited: p.totalDeposited,
                tier1Amount: p.tier1Amount,
                tier2Amount: p.tier2Amount,
                tier1BlocksRemaining: p.tier1BlocksRemaining,
                tier2BlocksRemaining: p.tier2BlocksRemaining,
            },
            error: null,
        };
    } catch (err) {
        return {
            hasVault: false,
            status: null,
            error: err instanceof Error ? err.message : 'Failed to fetch vault',
        };
    }
}

const STORAGE_KEY = 'es_tracked_vaults';

export function loadTrackedVaults(): string[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
    } catch {
        return [];
    }
}

export function saveTrackedVaults(vaults: string[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
}
