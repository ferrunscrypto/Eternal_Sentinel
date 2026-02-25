import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { providerService } from './ProviderService';
import { ETERNAL_SENTINEL_ABI } from '../abi/EternalSentinelABI';
import { IEternalSentinelContract } from '../types/contracts';
import { getContractAddress } from '../config/contracts';

class ContractService {
    private static instance: ContractService;
    private readonly contracts: Map<string, IEternalSentinelContract> = new Map();

    private constructor() {}

    public static getInstance(): ContractService {
        if (!ContractService.instance) {
            ContractService.instance = new ContractService();
        }
        return ContractService.instance;
    }

    /**
     * Returns the contract instance for the given network and optional caller Address.
     * Pass `from` (resolved Address) for write methods that check Blockchain.tx.sender
     * (checkIn, deposit, etc.) so simulations use the correct sender.
     */
    public getSentinelContract(
        network: Network,
        from?: Address,
    ): IEternalSentinelContract | null {
        const address = getContractAddress('sentinel', network);
        if (!address) return null;

        // Cache key includes caller address so each wallet gets its own simulation context
        const key = `sentinel:${address}:${from?.toString() ?? ''}`;

        if (!this.contracts.has(key)) {
            const provider = providerService.getProvider(network);
            const contract = getContract<IEternalSentinelContract>(
                address,
                ETERNAL_SENTINEL_ABI,
                provider,
                network,
                from,
            );
            this.contracts.set(key, contract);
        }

        return this.contracts.get(key)!;
    }

    public clearCache(): void {
        this.contracts.clear();
    }
}

export const contractService = ContractService.getInstance();
