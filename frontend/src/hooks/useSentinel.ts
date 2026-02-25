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
    /** Create a new vault — returns the new vault ID or null on failure */
    readonly createVault: (beneficiary: string) => Promise<bigint | null>;
    readonly checkIn: () => Promise<boolean>;
    readonly triggerTier1: () => Promise<boolean>;
    readonly triggerTier2: () => Promise<boolean>;
    readonly setBeneficiary: (address: string) => Promise<boolean>;
    readonly deposit: (amount: bigint) => Promise<boolean>;
}

/**
 * vaultId: if provided, fetch and manage a specific vault by its ID.
 * Write operations use the connected wallet as tx.sender.
 */
export function useSentinel(vaultId?: bigint | null): UseSentinelReturn {
    const { network, walletAddress } = useWalletConnect();
    const [status, setStatus] = useState<SentinelStatus | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState<boolean>(false);

    // Cache the resolved Address for the CONNECTED WALLET (used as `from` in write simulations)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolvedSenderRef = useRef<any | null>(null);
    const resolvedSenderForRef = useRef<string | null>(null);

    // Cache the wallet address as u256 for ownership comparison
    const walletU256Ref = useRef<bigint | null>(null);
    const walletU256ForRef = useRef<string | null>(null);

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
            // Also cache the u256 representation while we have the address
            const hex = addr.toString().replace(/^0x/, '');
            walletU256Ref.current = BigInt('0x' + hex);
            walletU256ForRef.current = walletAddress;
            return addr;
        } catch {
            return null;
        }
    }, [walletAddress, network]);

    const refreshStatus = useCallback(async () => {
        if (!network || !connected || vaultId == null) return;

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
            const result = await contract._getStatus(vaultId);

            if ('error' in result && result.error) {
                setError(String(result.error));
                return;
            }

            const props = result.properties;

            // Check if vault exists (status != 0 means it exists)
            if (props.currentStatus === 0n) {
                setStatus(null);
                setIsOwner(false);
                return;
            }

            setStatus({
                currentStatus: props.currentStatus,
                lastHeartbeatBlock: props.lastHeartbeatBlock,
                currentBlock: props.currentBlock,
                totalDeposited: props.totalDeposited,
                tier1Amount: props.tier1Amount,
                tier2Amount: props.tier2Amount,
                tier1BlocksRemaining: props.tier1BlocksRemaining,
                tier2BlocksRemaining: props.tier2BlocksRemaining,
                owner: props.owner,
            });

            // isOwner if the connected wallet's address matches the vault owner
            // Resolve wallet u256 if not cached yet
            if (walletAddress && network && walletU256Ref.current === null) {
                try {
                    const addr = await resolveAddress(walletAddress, network);
                    const hex = addr.toString().replace(/^0x/, '');
                    walletU256Ref.current = BigInt('0x' + hex);
                    walletU256ForRef.current = walletAddress;
                } catch {
                    // leave as null
                }
            }
            const myU256 = walletU256Ref.current;
            setIsOwner(myU256 !== null && myU256 === props.owner);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch status';
            console.error('[ES] refreshStatus error:', err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [network, vaultId, walletAddress, connected]);

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
        async (beneficiary: string): Promise<bigint | null> => {
            if (!network || !walletAddress) {
                setError('Wallet not connected');
                return null;
            }

            setLoading(true);
            setError(null);

            try {
                const beneficiaryAddr = await resolveAddress(beneficiary, network);
                const senderAddr = await getSenderAddress();
                const contract = contractService.getSentinelContract(network, senderAddr ?? undefined);
                if (!contract) {
                    setError('Contract not available');
                    return null;
                }

                const simulation = await contract._createVault(beneficiaryAddr as never);

                if (simulation.revert) {
                    setError(`Transaction would fail: ${simulation.revert}`);
                    return null;
                }

                const newVaultId: bigint = simulation.properties.vaultId;

                const params: TransactionParameters = {
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    maximumAllowedSatToSpend: 100_000n,
                    feeRate: 10,
                    network,
                };

                await simulation.sendTransaction(params);
                return newVaultId;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to create vault';
                setError(message);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [network, walletAddress, getSenderAddress],
    );

    const checkIn = useCallback(async (): Promise<boolean> => {
        if (vaultId == null) return false;
        return sendTx((contract) => contract._checkIn(vaultId) as never);
    }, [vaultId, sendTx]);

    const triggerTier1 = useCallback(async (): Promise<boolean> => {
        if (vaultId == null) return false;
        return sendTx((contract) => contract._triggerTier1(vaultId) as never);
    }, [vaultId, sendTx]);

    const triggerTier2 = useCallback(async (): Promise<boolean> => {
        if (vaultId == null) return false;
        return sendTx((contract) => contract._triggerTier2(vaultId) as never);
    }, [vaultId, sendTx]);

    const setBeneficiary = useCallback(
        async (address: string): Promise<boolean> => {
            if (!network || vaultId == null) return false;

            try {
                const addr = await resolveAddress(address, network);
                return sendTx((contract) => contract._setBeneficiary(vaultId, addr as never) as never);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to resolve address';
                setError(message);
                return false;
            }
        },
        [network, vaultId, sendTx],
    );

    const depositFn = useCallback(
        async (amount: bigint): Promise<boolean> => {
            if (vaultId == null) return false;
            return sendTx((contract) => contract._deposit(vaultId, amount) as never);
        },
        [vaultId, sendTx],
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
