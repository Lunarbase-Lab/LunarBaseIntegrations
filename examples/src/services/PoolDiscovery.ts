import type { Address, PublicClient } from 'viem';
import { FactoryContract } from '../core/FactoryContract.js';
import { ERC20_ABI } from '../constants/abis.js';
import type {
  PoolInfo,
  PoolInfoExtended,
  PoolDiscoveryOptions,
} from '../types/index.js';

/**
 * Service for discovering and tracking pools.
 * Provides methods for historical scanning and real-time monitoring.
 *
 * @example
 * ```typescript
 * const discovery = new PoolDiscovery(client, factoryAddress);
 *
 * // Scan historical pools
 * const pools = await discovery.scanPools({ fromBlock: 1000000n });
 *
 * // Watch for new pools
 * const unwatch = discovery.watchNewPools((pool) => {
 *   console.log('New pool created:', pool.address);
 * });
 * ```
 */
export class PoolDiscovery {
  private readonly client: PublicClient;
  private readonly factory: FactoryContract;

  /** In-memory cache of discovered pools */
  private pools: Map<Address, PoolInfo> = new Map();

  /**
   * Creates a new PoolDiscovery instance.
   *
   * @param client - Viem public client
   * @param factoryAddress - Factory contract address
   */
  constructor(client: PublicClient, factoryAddress: Address) {
    this.client = client;
    this.factory = new FactoryContract(client, factoryAddress);
  }

  /**
   * Gets the factory contract wrapper.
   */
  getFactory(): FactoryContract {
    return this.factory;
  }

  /**
   * Gets the total number of pools.
   */
  async getTotalPoolCount(): Promise<bigint> {
    return this.factory.getPairCount();
  }

  /**
   * Scans for pools in a block range.
   * Results are cached for subsequent queries.
   *
   * @param options - Discovery options
   * @returns Array of discovered pools
   */
  async scanPools(options: PoolDiscoveryOptions = {}): Promise<PoolInfo[]> {
    const currentBlock = await this.client.getBlockNumber();
    const fromBlock = options.fromBlock ?? currentBlock - 10000n;
    const toBlock = options.toBlock ?? currentBlock;

    // Scan in chunks to avoid RPC limits
    const chunkSize = 2000n;
    const pools: PoolInfo[] = [];

    let startBlock = fromBlock;
    while (startBlock <= toBlock) {
      const endBlock = startBlock + chunkSize > toBlock ? toBlock : startBlock + chunkSize;

      const chunkPools = await this.factory.getPairCreatedEvents(startBlock, endBlock);

      // Filter by token if specified
      const filteredPools = options.tokenFilter
        ? chunkPools.filter(
            (p) =>
              p.token0.toLowerCase() === options.tokenFilter!.toLowerCase() ||
              p.token1.toLowerCase() === options.tokenFilter!.toLowerCase()
          )
        : chunkPools;

      // Cache and collect
      for (const pool of filteredPools) {
        this.pools.set(pool.address, pool);
        pools.push(pool);
      }

      startBlock = endBlock + 1n;
    }

    return pools;
  }

  /**
   * Scans for pools and includes token metadata.
   *
   * @param options - Discovery options
   * @returns Array of pools with extended token information
   */
  async scanPoolsExtended(options: PoolDiscoveryOptions = {}): Promise<PoolInfoExtended[]> {
    const pools = await this.scanPools(options);
    return this.enrichPoolsWithTokenInfo(pools);
  }

  /**
   * Enriches pool information with token details.
   *
   * @param pools - Array of basic pool info
   * @returns Array of pools with token metadata
   */
  async enrichPoolsWithTokenInfo(pools: PoolInfo[]): Promise<PoolInfoExtended[]> {
    // Collect unique tokens
    const tokenAddresses = new Set<Address>();
    for (const pool of pools) {
      tokenAddresses.add(pool.token0);
      tokenAddresses.add(pool.token1);
    }

    // Fetch token info in parallel
    const tokenInfoMap = new Map<
      Address,
      { symbol: string; decimals: number }
    >();

    const tokenInfoPromises = Array.from(tokenAddresses).map(async (address) => {
      try {
        const [symbol, decimals] = await Promise.all([
          this.client.readContract({
            address,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }),
          this.client.readContract({
            address,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }),
        ]);
        tokenInfoMap.set(address, {
          symbol: symbol as string,
          decimals: decimals as number,
        });
      } catch {
        // Token might not be ERC20 compliant (e.g., native currency)
        tokenInfoMap.set(address, { symbol: 'UNKNOWN', decimals: 18 });
      }
    });

    await Promise.all(tokenInfoPromises);

    // Enrich pools
    return pools.map((pool) => {
      const token0Info = tokenInfoMap.get(pool.token0);
      const token1Info = tokenInfoMap.get(pool.token1);

      return {
        ...pool,
        token0Symbol: token0Info?.symbol,
        token0Decimals: token0Info?.decimals,
        token1Symbol: token1Info?.symbol,
        token1Decimals: token1Info?.decimals,
      };
    });
  }

  /**
   * Watches for new pool creation events.
   *
   * @param callback - Function to call when a new pool is created
   * @returns Unwatch function
   */
  watchNewPools(
    callback: (pool: PoolInfo) => void
  ): () => void {
    return this.factory.watchPairCreated((event, blockNumber, transactionHash) => {
      const pool: PoolInfo = {
        address: event.pair,
        token0: event.token0,
        token1: event.token1,
        userModule: event.module,
        moduleMask: event.moduleMask,
        baseFeeConfig: event.baseFeeConfig,
        pairIndex: event.pairCount,
        blockNumber,
        transactionHash,
      };

      // Cache the pool
      this.pools.set(pool.address, pool);

      callback(pool);
    });
  }

  /**
   * Gets a pool by address from cache.
   *
   * @param address - Pool address
   * @returns Pool info if cached, undefined otherwise
   */
  getCachedPool(address: Address): PoolInfo | undefined {
    return this.pools.get(address);
  }

  /**
   * Gets all cached pools.
   */
  getCachedPools(): PoolInfo[] {
    return Array.from(this.pools.values());
  }

  /**
   * Clears the pool cache.
   */
  clearCache(): void {
    this.pools.clear();
  }

  /**
   * Finds pools by token.
   *
   * @param tokenAddress - Token address to search for
   * @returns Pools containing the token
   */
  findPoolsByToken(tokenAddress: Address): PoolInfo[] {
    const normalizedAddress = tokenAddress.toLowerCase();
    return this.getCachedPools().filter(
      (p) =>
        p.token0.toLowerCase() === normalizedAddress ||
        p.token1.toLowerCase() === normalizedAddress
    );
  }

  /**
   * Finds a pool by token pair.
   *
   * @param tokenA - First token
   * @param tokenB - Second token
   * @returns Pool if found
   */
  findPoolByPair(tokenA: Address, tokenB: Address): PoolInfo | undefined {
    const [token0, token1] =
      tokenA.toLowerCase() < tokenB.toLowerCase()
        ? [tokenA.toLowerCase(), tokenB.toLowerCase()]
        : [tokenB.toLowerCase(), tokenA.toLowerCase()];

    return this.getCachedPools().find(
      (p) =>
        p.token0.toLowerCase() === token0 && p.token1.toLowerCase() === token1
    );
  }

  /**
   * Groups pools by base fee configuration.
   *
   * @returns Map of fee tier to pools
   */
  groupByFeeTier(): Map<number, PoolInfo[]> {
    const groups = new Map<number, PoolInfo[]>();

    for (const pool of this.getCachedPools()) {
      const fee = pool.baseFeeConfig.baseFee;
      const existing = groups.get(fee) ?? [];
      existing.push(pool);
      groups.set(fee, existing);
    }

    return groups;
  }

  /**
   * Gets statistics about discovered pools.
   */
  getStats(): {
    totalPools: number;
    uniqueTokens: number;
    poolsByFeeTier: Record<string, number>;
  } {
    const pools = this.getCachedPools();
    const tokens = new Set<string>();
    const feeTiers: Record<string, number> = {};

    for (const pool of pools) {
      tokens.add(pool.token0.toLowerCase());
      tokens.add(pool.token1.toLowerCase());

      const feeKey = `${pool.baseFeeConfig.baseFee}`;
      feeTiers[feeKey] = (feeTiers[feeKey] ?? 0) + 1;
    }

    return {
      totalPools: pools.length,
      uniqueTokens: tokens.size,
      poolsByFeeTier: feeTiers,
    };
  }
}
