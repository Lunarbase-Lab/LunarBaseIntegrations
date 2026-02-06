import {
  type Address,
  type PublicClient,
  parseAbiItem,
} from 'viem';
import { FACTORY_ABI } from '../constants/abis.js';
import type { BaseFeeConfig, PairCreatedEvent, PoolInfo } from '../types/index.js';
import { FEE_CONSTANTS } from '../types/index.js';

/**
 * Wrapper for factory contract interactions.
 * Provides methods for pool discovery and address computation.
 */
export class FactoryContract {
  private readonly client: PublicClient;
  private readonly address: Address;

  /**
   * Creates a new FactoryContract instance.
   *
   * @param client - Viem public client
   * @param address - Factory contract address
   */
  constructor(client: PublicClient, address: Address) {
    this.client = client;
    this.address = address;
  }

  /**
   * Gets the factory contract address.
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Gets the total number of pools created.
   */
  async getPairCount(): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: FACTORY_ABI,
      functionName: 'pairCount',
    }) as Promise<bigint>;
  }

  /**
   * Gets the core module address.
   */
  async getCoreModule(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: FACTORY_ABI,
      functionName: 'coreModule',
    }) as Promise<Address>;
  }

  /**
   * Gets a pool address by its parameters.
   *
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param userModule - User module address (or zero address)
   * @param moduleMask - Module mask flags
   * @param baseFeeConfig - Base fee configuration
   * @returns Pool address or zero address if not found
   */
  async getPair(
    tokenA: Address,
    tokenB: Address,
    userModule: Address = FEE_CONSTANTS.ZERO_ADDRESS,
    moduleMask = FEE_CONSTANTS.DEFAULT_MODULE_MASK,
    baseFeeConfig: BaseFeeConfig = {
      baseFee: 3_000_000, // 0.3%
      wToken0: 500_000_000,
      wToken1: 500_000_000,
    }
  ): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB, userModule, moduleMask, baseFeeConfig],
    }) as Promise<Address>;
  }

  /**
   * Computes the deterministic pool address without querying the contract.
   *
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @param userModule - User module address
   * @param moduleMask - Module mask flags
   * @param baseFeeConfig - Base fee configuration
   * @returns Predicted pool address
   */
  async computePoolAddress(
    tokenA: Address,
    tokenB: Address,
    userModule: Address = FEE_CONSTANTS.ZERO_ADDRESS,
    moduleMask = FEE_CONSTANTS.DEFAULT_MODULE_MASK,
    baseFeeConfig: BaseFeeConfig = {
      baseFee: 3_000_000,
      wToken0: 500_000_000,
      wToken1: 500_000_000,
    }
  ): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: FACTORY_ABI,
      functionName: 'computePoolAddress',
      args: [tokenA, tokenB, userModule, moduleMask, baseFeeConfig],
    }) as Promise<Address>;
  }

  /**
   * Gets PairCreated events in a block range.
   *
   * @param fromBlock - Start block
   * @param toBlock - End block (default: latest)
   * @returns Array of PairCreated events with metadata
   */
  async getPairCreatedEvents(
    fromBlock: bigint,
    toBlock?: bigint
  ): Promise<PoolInfo[]> {
    const logs = await this.client.getLogs({
      address: this.address,
      event: parseAbiItem(
        'event PairCreated(address indexed token0, address indexed token1, address indexed module, address pair, uint256 pairCount, uint8 moduleMask, (uint32 baseFee, uint32 wToken0, uint32 wToken1) baseFeeConfig)'
      ),
      fromBlock,
      toBlock: toBlock ?? 'latest',
    });

    return logs.map((log) => ({
      address: log.args.pair as Address,
      token0: log.args.token0 as Address,
      token1: log.args.token1 as Address,
      userModule: log.args.module as Address,
      moduleMask: log.args.moduleMask as number,
      baseFeeConfig: {
        baseFee: (log.args.baseFeeConfig as { baseFee: number }).baseFee,
        wToken0: (log.args.baseFeeConfig as { wToken0: number }).wToken0,
        wToken1: (log.args.baseFeeConfig as { wToken1: number }).wToken1,
      },
      pairIndex: log.args.pairCount as bigint,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    }));
  }

  /**
   * Watches for new PairCreated events in real-time.
   *
   * @param callback - Function to call when a new pair is created
   * @returns Unwatch function to stop listening
   */
  watchPairCreated(
    callback: (event: PairCreatedEvent, blockNumber: bigint, transactionHash: string) => void
  ): () => void {
    return this.client.watchEvent({
      address: this.address,
      event: parseAbiItem(
        'event PairCreated(address indexed token0, address indexed token1, address indexed module, address pair, uint256 pairCount, uint8 moduleMask, (uint32 baseFee, uint32 wToken0, uint32 wToken1) baseFeeConfig)'
      ),
      onLogs: (logs) => {
        for (const log of logs) {
          callback(
            {
              token0: log.args.token0 as Address,
              token1: log.args.token1 as Address,
              module: log.args.module as Address,
              pair: log.args.pair as Address,
              pairCount: log.args.pairCount as bigint,
              moduleMask: log.args.moduleMask as number,
              baseFeeConfig: {
                baseFee: (log.args.baseFeeConfig as { baseFee: number }).baseFee,
                wToken0: (log.args.baseFeeConfig as { wToken0: number }).wToken0,
                wToken1: (log.args.baseFeeConfig as { wToken1: number }).wToken1,
              },
            },
            log.blockNumber,
            log.transactionHash
          );
        }
      },
    });
  }
}
