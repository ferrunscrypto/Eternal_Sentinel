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
    readonly vaultId: bigint;
    readonly status: SentinelStatus | null;
    readonly error: string | null;
}

/**
 * Fetch all vault IDs owned by a given bech32 address.
 */
export async function fetchVaultIdsForOwner(
    ownerBech32: string,
    network: Network,
): Promise<bigint[]> {
    const contract = contractService.getSentinelContract(network);
    if (!contract) return [];

    const addr = await resolveAddress(ownerBech32, network);

    const countResult = await contract._getVaultCount(addr as never);
    const count: bigint = countResult.properties.count;

    if (count === 0n) return [];

    const ids: bigint[] = [];
    for (let i = 0n; i < count; i++) {
        const idResult = await contract._getVaultIdByIndex(addr as never, i);
        ids.push(idResult.properties.vaultId);
    }

    return ids;
}

/**
 * Fetch full status for a specific vault by its ID.
 */
export async function fetchVaultStatus(
    vaultId: bigint,
    network: Network,
): Promise<VaultSummary> {
    try {
        const contract = contractService.getSentinelContract(network);
        if (!contract) return { vaultId, status: null, error: 'Contract not deployed' };

        const result = await contract._getStatus(vaultId);
        if ('error' in result && result.error) {
            return { vaultId, status: null, error: String(result.error) };
        }

        const p = result.properties;
        return {
            vaultId,
            status: {
                currentStatus: p.currentStatus,
                lastHeartbeatBlock: p.lastHeartbeatBlock,
                currentBlock: p.currentBlock,
                totalDeposited: p.totalDeposited,
                tier1Amount: p.tier1Amount,
                tier2Amount: p.tier2Amount,
                tier1BlocksRemaining: p.tier1BlocksRemaining,
                tier2BlocksRemaining: p.tier2BlocksRemaining,
                owner: p.owner,
            },
            error: null,
        };
    } catch (err) {
        return {
            vaultId,
            status: null,
            error: err instanceof Error ? err.message : 'Failed to fetch vault',
        };
    }
}
