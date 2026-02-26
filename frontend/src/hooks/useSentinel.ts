import { useState, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { TransactionParameters } from 'opnet';
import { contractService } from '../services/ContractService';
import { providerService } from '../services/ProviderService';
import { SentinelStatus } from '../types/sentinel';
import { IEternalSentinelContract } from '../types/contracts';
import { getNetworkName } from '../config/networks';

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
    const { network, walletAddress, address: walletAddressObj } = useWalletConnect();
    const [status, setStatus] = useState<SentinelStatus | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState<boolean>(false);

    const connected = !!(walletAddress && network);
    const networkName = network ? getNetworkName(network) : 'Not connected';
    const contractDeployed = !!(network && contractService.getSentinelContract(network) !== null);

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

            // Use the wallet's Address directly — it's the 32-byte MLDSA hash
            // that the OPNet runtime uses as Blockchain.tx.sender.
            const myU256 = walletAddressObj?.toBigInt() ?? null;
            setIsOwner(myU256 !== null && myU256 === props.owner);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to fetch status';
            console.error('[ES] refreshStatus error:', err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [network, vaultId, walletAddress, connected, walletAddressObj]);

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
                // Use the wallet's Address directly as the simulation sender.
                // walletAddressObj is already the correct 32-byte MLDSA Address.
                const contract = contractService.getSentinelContract(network, walletAddressObj ?? undefined);
                if (!contract) {
                    setError('Contract not available');
                    return false;
                }
                const simulation = await simulate(contract);

                if (simulation.revert) {
                    setError(`Transaction would fail: ${simulation.revert}`);
                    return false;
                }

                // signer/mldsaSigner must be omitted — OP_WALLET now rejects them even as null.
                // Cast to bypass the outdated rc.11 type requirement.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const params = { refundTo: walletAddress, maximumAllowedSatToSpend: 100_000n, network } as unknown as TransactionParameters;

                providerService.getProvider(network).utxoManager.clean();
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
        [network, walletAddress, walletAddressObj, refreshStatus],
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
                // Use provider.getPublicKeyInfo() which always returns a 32-byte MLDSA
                // Address — never the 33-byte ECDSA tweakedPubkey that writeAddress rejects.
                const provider = providerService.getProvider(network);
                const beneficiaryAddr = await provider.getPublicKeyInfo(beneficiary.trim(), false);
                if (!beneficiaryAddr) {
                    setError(
                        'Could not find the public key for this address. ' +
                        'Make sure it has been used on-chain, or paste the 0x... MLDSA hash directly.',
                    );
                    return null;
                }

                // walletAddressObj is the correct simulation sender.
                const contract = contractService.getSentinelContract(network, walletAddressObj ?? undefined);
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

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const params = { refundTo: walletAddress, maximumAllowedSatToSpend: 100_000n, network } as unknown as TransactionParameters;

                // Clear pending UTXO cache before sending.
                providerService.getProvider(network).utxoManager.clean();

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
        [network, walletAddress, walletAddressObj],
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
                const provider = providerService.getProvider(network);
                const addr = await provider.getPublicKeyInfo(address.trim(), false);
                if (!addr) {
                    setError('Could not resolve beneficiary address. Use the 0x... MLDSA hash directly if the address is not on-chain.');
                    return false;
                }
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
