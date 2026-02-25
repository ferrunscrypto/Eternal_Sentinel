import { JSONRpcProvider } from 'opnet';
import { Network } from '@btc-vision/bitcoin';
import { getRpcUrl, getNetworkId } from '../config/networks';

class ProviderService {
    private static instance: ProviderService;
    private readonly providers: Map<string, JSONRpcProvider> = new Map();

    private constructor() {}

    public static getInstance(): ProviderService {
        if (!ProviderService.instance) {
            ProviderService.instance = new ProviderService();
        }
        return ProviderService.instance;
    }

    public getProvider(network: Network): JSONRpcProvider {
        const networkId = getNetworkId(network);

        if (!this.providers.has(networkId)) {
            const rpcUrl = getRpcUrl(network);
            const provider = new JSONRpcProvider({ url: rpcUrl, network });
            this.providers.set(networkId, provider);
        }

        return this.providers.get(networkId)!;
    }

    public clearProviders(): void {
        this.providers.clear();
    }
}

export const providerService = ProviderService.getInstance();
