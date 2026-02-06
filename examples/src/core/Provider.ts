import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
  defineChain,
} from 'viem';

/**
 * Base Mainnet chain definition
 */
export const base = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://base-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://basescan.org' },
  },
});

/**
 * Base Sepolia testnet chain definition
 */
export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://base-sepolia-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
});

/**
 * Network type for provider configuration.
 */
export type NetworkType = 'mainnet' | 'testnet';

/**
 * Configuration options for the Provider.
 */
export interface ProviderConfig {
  /** RPC URL for the network */
  rpcUrl: string;
  /** Network type (mainnet or testnet) */
  network?: NetworkType;
  /** Optional custom chain configuration */
  chain?: Chain;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retries for failed requests */
  retries?: number;
}

/**
 * Provider wrapper for blockchain interactions.
 * Provides a configured viem public client for read operations.
 */
export class Provider {
  private readonly client: PublicClient;
  private readonly config: ProviderConfig;

  /**
   * Creates a new Provider instance.
   *
   * @param config - Provider configuration options
   *
   * @example
   * ```typescript
   * const provider = new Provider({
   *   rpcUrl: process.env.RPC_URL_MAINNET || 'https://base-rpc.publicnode.com',
   *   network: 'mainnet',
   * });
   * ```
   */
  constructor(config: ProviderConfig) {
    this.config = {
      timeout: 30_000,
      retries: 3,
      network: 'mainnet',
      ...config,
    };

    // Select chain based on network type
    const chain = config.chain ?? (this.config.network === 'testnet' ? baseSepolia : base);

    this.client = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl, {
        timeout: this.config.timeout,
        retryCount: this.config.retries,
      }),
    });
  }

  /**
   * Gets the underlying viem public client.
   * Use this for direct contract interactions.
   */
  getClient(): PublicClient {
    return this.client;
  }

  /**
   * Gets the current block number.
   */
  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  /**
   * Gets the chain ID.
   */
  async getChainId(): Promise<number> {
    return this.client.getChainId();
  }

  /**
   * Checks if the RPC connection is healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a provider from environment variables.
   * Reads NETWORK, RPC_URL_MAINNET, and RPC_URL_TESTNET from process.env.
   *
   * @returns Configured Provider instance
   * @throws Error if required RPC URL is not set
   */
  static fromEnv(): Provider {
    const network = (process.env.NETWORK ?? 'mainnet') as NetworkType;
    const rpcUrl = network === 'testnet'
      ? process.env.RPC_URL_TESTNET
      : process.env.RPC_URL_MAINNET;

    if (!rpcUrl) {
      throw new Error(
        `RPC_URL_${network.toUpperCase()} environment variable is not set`
      );
    }

    return new Provider({ rpcUrl, network });
  }

  /**
   * Gets the current network type.
   */
  getNetwork(): NetworkType {
    return this.config.network ?? 'mainnet';
  }
}
