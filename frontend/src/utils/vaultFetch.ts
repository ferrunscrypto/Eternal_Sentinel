import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { contractService } from '../services/ContractService';
import { providerService } from '../services/ProviderService';
import type { SentinelStatus } from '../types/sentinel';

/**
 * Resolve a bech32 or hex address to a 32-byte MLDSA Address object.
 *
 * Uses provider.getPublicKeyInfo() which always returns the 32-byte MLDSA hash —
 * never falls back to the 33-byte ECDSA tweakedPubkey (which would fail writeAddress).
 */
export async function resolveAddress(bech32OrHex: string, network: Network): Promise<Address> {
    const provider = providerService.getProvider(network);
    const addr = await provider.getPublicKeyInfo(bech32OrHex, false);
    if (!addr) throw new Error(`Could not resolve public key for: ${bech32OrHex}`);
    return addr;
}

export interface VaultSummary {
    readonly vaultId: bigint;
    readonly status: SentinelStatus | null;
    readonly error: string | null;
}

/**
 * Fetch all vault IDs owned by the given Address.
 *
 * Accepts a pre-resolved Address (from the wallet context) to avoid any
 * network lookups for the owner — use the wallet's own address directly.
 */
export async function fetchVaultIdsForOwner(
    ownerAddress: Address,
    network: Network,
): Promise<bigint[]> {
    const contract = contractService.getSentinelContract(network);
    if (!contract) return [];

    // ownerAddress is already a 32-byte MLDSA Address from the wallet context.
    // The SDK's encodeInput(ADDRESS) requires an Address object with an `equals` method.
    const countResult = await contract._getVaultCount(ownerAddress as never);
    const count: bigint = countResult.properties.count;

    if (count === 0n) return [];

    const ids: bigint[] = [];
    for (let i = 0n; i < count; i++) {
        const idResult = await contract._getVaultIdByIndex(ownerAddress as never, i);
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
