import type { Address, PublicClient } from 'viem';
import { CORE_MODULE_ABI } from '../constants/abis.js';
import type {
  BaseFeeConfig,
  DynamicFeeConfig,
  FeeQuote,
  SwapContext,
} from '../types/index.js';

/**
 * Wrapper for core module contract interactions.
 * Provides methods for fee configuration and calculation.
 */
export class CoreModuleContract {
  private readonly client: PublicClient;
  private readonly address: Address;

  /**
   * Creates a new CoreModuleContract instance.
   *
   * @param client - Viem public client
   * @param address - Core module contract address
   */
  constructor(client: PublicClient, address: Address) {
    this.client = client;
    this.address = address;
  }

  /**
   * Gets the core module contract address.
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Gets the base fee configuration for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Base fee configuration
   */
  async getPoolBaseFeeConfig(poolAddress: Address): Promise<BaseFeeConfig> {
    const result = await this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'poolBaseFeeConfig',
      args: [poolAddress],
    });
    
    const [baseFee, wToken0, wToken1] = result as [number, number, number];
    return { baseFee, wToken0, wToken1 };
  }

  /**
   * Gets the default dynamic fee configuration.
   *
   * @returns Default dynamic fee config
   */
  async getDefaultDynamicConfig(): Promise<DynamicFeeConfig> {
    const result = await this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'defaultDynCfg',
    });
    
    const [maxCapBps, halfLife, enabled] = result as [number, number, boolean];
    return { maxCapBps, halfLife, enabled };
  }

  /**
   * Gets the dynamic fee configuration for a specific pool.
   *
   * @param poolAddress - Pool address
   * @returns Pool-specific dynamic fee config
   */
  async getPoolDynamicConfig(poolAddress: Address): Promise<DynamicFeeConfig> {
    const result = await this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'poolDynCfg',
      args: [poolAddress],
    });
    
    const [maxCapBps, halfLife, enabled] = result as [number, number, boolean];
    return { maxCapBps, halfLife, enabled };
  }

  /**
   * Checks if a pool has a custom dynamic fee config set.
   *
   * @param poolAddress - Pool address
   * @returns True if custom config is set
   */
  async hasPoolDynamicConfigSet(poolAddress: Address): Promise<boolean> {
    return this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'poolDynCfgSet',
      args: [poolAddress],
    }) as Promise<boolean>;
  }

  /**
   * Gets the effective dynamic fee configuration for a pool.
   * Returns pool-specific config if set, otherwise default config.
   *
   * @param poolAddress - Pool address
   * @returns Effective dynamic fee config
   */
  async getEffectiveDynamicConfig(poolAddress: Address): Promise<DynamicFeeConfig> {
    const hasCustomConfig = await this.hasPoolDynamicConfigSet(poolAddress);
    
    if (hasCustomConfig) {
      return this.getPoolDynamicConfig(poolAddress);
    }
    
    return this.getDefaultDynamicConfig();
  }

  /**
   * Gets the protocol share of fees in basis points.
   *
   * @returns Protocol share in bps (e.g., 1000 = 10%)
   */
  async getProtocolShareBps(): Promise<number> {
    return this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'protocolShareBps',
    }) as Promise<number>;
  }

  /**
   * Previews the fee quote for a swap.
   * This is the on-chain fee calculation.
   *
   * @param poolAddress - Pool address
   * @param context - Swap context
   * @returns Fee quote with input/output fees and protocol share
   */
  async previewFee(poolAddress: Address, context: SwapContext): Promise<FeeQuote> {
    const result = await this.client.readContract({
      address: this.address,
      abi: CORE_MODULE_ABI,
      functionName: 'previewFee',
      args: [
        poolAddress,
        {
          tokenIn: context.tokenIn,
          tokenOut: context.tokenOut,
          amountIn: context.amountIn,
          amountOut: context.amountOut,
          reserveIn: context.reserveIn,
          reserveOut: context.reserveOut,
          data: context.data ?? '0x',
        },
      ],
    });
    
    const { inBps, outBps, protocolShareBps } = result as {
      inBps: number;
      outBps: number;
      protocolShareBps: number;
    };
    
    return { inBps, outBps, protocolShareBps };
  }

  /**
   * Gets complete fee information for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Object with base fee, dynamic fee config, and protocol share
   */
  async getPoolFeeInfo(poolAddress: Address): Promise<{
    baseFeeConfig: BaseFeeConfig;
    dynamicFeeConfig: DynamicFeeConfig;
    protocolShareBps: number;
  }> {
    const [baseFeeConfig, dynamicFeeConfig, protocolShareBps] = await Promise.all([
      this.getPoolBaseFeeConfig(poolAddress),
      this.getEffectiveDynamicConfig(poolAddress),
      this.getProtocolShareBps(),
    ]);

    return {
      baseFeeConfig,
      dynamicFeeConfig,
      protocolShareBps,
    };
  }
}
