import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { TransactionParameters } from 'opnet';
import { contractService } from '../services/ContractService';
import { SentinelStatus } from '../types/sentinel';
import { IEternalSentinelContract } from '../types/contracts';
import { getNetworkName } from '../config/networks';
import { resolveAddress } from '../utils/vaultFetch';

interface UseSentinelReturn {
    readonly status: SentinelStatus | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly isOwner: boolean;
    readonly connected: boolean;
    readonly networkName: string;
    readonly walletAddress: string | null;
    readonly contractDeployed: boolean;
    readonly refreshStatus: () => Promise<void>;
    /** Create a new vault — sender becomes owner automatically */
    readonly createVault: (beneficiary: string) => Promise<boolean>;
    readonly checkIn: () => Promise<boolean>;
    /** Pass the vault owner's bech32 address to trigger on their behalf */
    readonly triggerTier1: (ownerBech32?: string) => Promise<boolean>;
    readonly triggerTier2: (ownerBech32?: string) => Promise<boolean>;
    readonly setBeneficiary: (address: string) => Promise<boolean>;
    readonly deposit: (amount: bigint) => Promise<boolean>;
}

/**
 * ownerOverride: if provided, fetch vault data for this address instead of the
 * connected wallet. Write operations (createVault, deposit, etc.) always act on
 * the connected wallet since the contract uses tx.sender.
 */
export function useSentinel(ownerOverride?: string | null): UseSentinelReturn {
    const { network, walletAddress } = useWalletConnect();
    const effectiveOwner = (ownerOverride != null ? ownerOverride : walletAddress);
    const [status, setStatus] = useState<SentinelStatus | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState<boolean>(false);

    // Cache the resolved Address for the vault target (effectiveOwner)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolvedAddrRef = useRef<any | null>(null);
    const resolvedForRef = useRef<string | null>(null);

    // Cache the resolved Address for the CONNECTED WALLET (used as `from` in write simulations)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolvedSenderRef = useRef<any | null>(null);
    const resolvedSenderForRef = useRef<string | null>(null);

    const connected = !!(walletAddress && network);
    const networkName = network ? getNetworkName(network) : 'Not connected';
    const contractDeployed = !!(network && contractService.getSentinelContract(network) !== null);

    /** Get (and cache) the resolved Address for the connected wallet (tx.sender for writes) */
    const getSenderAddress = useCallback(async () => {
        if (!walletAddress || !network) return null;
        if (resolvedSenderRef.current && resolvedSenderForRef.current === walletAddress) {
            return resolvedSenderRef.current;
        }
        try {
            const addr = await resolveAddress(walletAddress, network);
            resolvedSenderRef.current = addr;
            resolvedSenderForRef.current = walletAddress;
            return addr;
        } catch {
            return null;
        }
    }, [walletAddress, network]);

    /** Get (and cache) the resolved Address for the vault target (effectiveOwner) */
    const getMyAddress = useCallback(async () => {
        if (!effectiveOwner || !network) return null;
        if (resolvedAddrRef.current && resolvedForRef.current === effectiveOwner) {
            return resolvedAddrRef.current;
        }
        try {
            const addr = await resolveAddress(effectiveOwner, network);
            resolvedAddrRef.current = addr;
            resolvedForRef.current = effectiveOwner;
            return addr;
        } catch {
            return null;
        }
    }, [effectiveOwner, network]);

    // Invalidate cache when effective owner changes
    useEffect(() => {
        resolvedAddrRef.current = null;
        resolvedForRef.current = null;
    }, [effectiveOwner]);

    const refreshStatus = useCallback(async () => {
        if (!network || !connected) return;

        const contract = contractService.getSentinelContract(network);
        if (!contract) {
            setStatus(null);
            setIsOwner(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const myAddr = await getMyAddress();
            if (!myAddr) {
                setStatus(null);
                setIsOwner(false);
                return;
            }

            // Check whether this wallet has a vault
            const hasVaultResult = await contract._hasVault(myAddr as never);
            const hasVault: boolean = hasVaultResult.properties.exists;

            if (!hasVault) {
                setStatus(null);
                setIsOwner(false);
                return;
            }

            // Fetch full status for this wallet's vault
            const result = await contract._getStatus(myAddr as never);

            if ('error' in result && result.error) {
                setError(String(result.error));
                return;
            }

            const props = result.properties;
            setStatus({
                currentStatus: props.currentStatus,
                lastHeartbeatBlock: props.lastHeartbeatBlock,
                currentBlock: props.currentBlock,
                totalDeposited: props.totalDeposited,
                tier1Amount: props.tier1Amount,
                tier2Amount: props.tier2Amount,
                tier1BlocksRemaining: props.tier1BlocksRemaining,
                tier2BlocksRemaining: props.tier2BlocksRemaining,
            });

            // isOwner only if the connected wallet IS the vault owner
            setIsOwner(!!(walletAddress && effectiveOwner && walletAddress === effectiveOwner));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch status';
            console.error('[ES] refreshStatus error:', err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [network, walletAddress, effectiveOwner, connected, getMyAddress]);

    useEffect(() => {
        void refreshStatus();

        // Poll every 10 s when no vault yet (waiting for confirmation), 60 s otherwise
        const interval = setInterval(() => void refreshStatus(), status === null ? 10_000 : 60_000);
        return () => clearInterval(interval);
    }, [refreshStatus, status]);

    const sendTx = useCallback(
        async (
            simulate: (contract: IEternalSentinelContract) => Promise<{
                revert?: string;
                sendTransaction: (params: TransactionParameters) => Promise<unknown>;
            }>,
        ) => {
            if (!network || !walletAddress) {
                setError('Wallet not connected');
                return false;
            }

            setLoading(true);
            setError(null);

            try {
                // Resolve sender address so simulation uses correct tx.sender
                const senderAddr = await getSenderAddress();
                const contract = contractService.getSentinelContract(network, senderAddr ?? undefined);
                if (!contract) {
                    setError('Contract not available');
                    return false;
                }
                const simulation = await simulate(contract);

                if (simulation.revert) {
                    setError(`Transaction would fail: ${simulation.revert}`);
                    return false;
                }

                const params: TransactionParameters = {
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    maximumAllowedSatToSpend: 100_000n,
                    feeRate: 10,
                    network,
                };

                await simulation.sendTransaction(params);
                await refreshStatus();
                return true;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Transaction failed';
                setError(message);
                return false;
            } finally {
                setLoading(false);
            }
        },
        [network, walletAddress, refreshStatus, getSenderAddress],
    );

    const createVault = useCallback(
        async (beneficiary: string): Promise<boolean> => {
            if (!network) return false;

            try {
                const beneficiaryAddr = await resolveAddress(beneficiary, network);
                return sendTx((contract) => contract._createVault(beneficiaryAddr as never) as never);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to resolve beneficiary address';
                setError(message);
                return false;
            }
        },
        [network, sendTx],
    );

    const checkIn = useCallback(async (): Promise<boolean> => {
        return sendTx((contract) => contract._checkIn() as never);
    }, [sendTx]);

    /**
     * Trigger Tier 1 for a vault.
     * If ownerBech32 is omitted, defaults to the connected wallet's own vault.
     */
    const triggerTier1 = useCallback(
        async (ownerBech32?: string): Promise<boolean> => {
            if (!network) return false;

            try {
                const target = ownerBech32 ?? walletAddress;
                if (!target) { setError('No vault owner address'); return false; }
                const ownerAddr = ownerBech32
                    ? await resolveAddress(ownerBech32, network)
                    : await getMyAddress();
                if (!ownerAddr) { setError('Could not resolve owner address'); return false; }
                return sendTx((contract) => contract._triggerTier1(ownerAddr as never) as never);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to resolve owner';
                setError(message);
                return false;
            }
        },
        [network, walletAddress, sendTx, getMyAddress],
    );

    const triggerTier2 = useCallback(
        async (ownerBech32?: string): Promise<boolean> => {
            if (!network) return false;

            try {
                const target = ownerBech32 ?? walletAddress;
                if (!target) { setError('No vault owner address'); return false; }
                const ownerAddr = ownerBech32
                    ? await resolveAddress(ownerBech32, network)
                    : await getMyAddress();
                if (!ownerAddr) { setError('Could not resolve owner address'); return false; }
                return sendTx((contract) => contract._triggerTier2(ownerAddr as never) as never);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to resolve owner';
                setError(message);
                return false;
            }
        },
        [network, walletAddress, sendTx, getMyAddress],
    );

    const setBeneficiary = useCallback(
        async (address: string): Promise<boolean> => {
            if (!network) return false;

            try {
                const addr = await resolveAddress(address, network);
                return sendTx((contract) => contract._setBeneficiary(addr as never) as never);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to resolve address';
                setError(message);
                return false;
            }
        },
        [network, sendTx],
    );

    const depositFn = useCallback(
        async (amount: bigint): Promise<boolean> => {
            return sendTx((contract) => contract._deposit(amount) as never);
        },
        [sendTx],
    );

    return {
        status,
        loading,
        error,
        isOwner,
        connected,
        networkName,
        walletAddress: walletAddress ?? null,
        contractDeployed,
        refreshStatus,
        createVault,
        checkIn,
        triggerTier1,
        triggerTier2,
        setBeneficiary,
        deposit: depositFn,
    };
}
