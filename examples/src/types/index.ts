import type { Address } from 'viem';

/**
 * Base fee configuration for a pool.
 * Fee is split between token0 and token1 based on weights.
 *
 * @property baseFee - Total fee in bps (1_000_000_000 = 100%)
 * @property wToken0 - Weight for token0 fee portion (bps)
 * @property wToken1 - Weight for token1 fee portion (bps)
 *
 * Note: wToken0 + wToken1 must equal 1_000_000_000
 */
export interface BaseFeeConfig {
  baseFee: number;
  wToken0: number;
  wToken1: number;
}

/**
 * Dynamic fee configuration for a pool.
 * Allows fees to adjust based on trading activity.
 *
 * @property maxCapBps - Maximum dynamic fee cap in bps
 * @property halfLife - Half-life for fee decay (seconds)
 * @property enabled - Whether dynamic fees are enabled
 */
export interface DynamicFeeConfig {
  maxCapBps: number;
  halfLife: number;
  enabled: boolean;
}

/**
 * Dynamic fee state for a pool.
 * Tracks current activity level and fee.
 */
export interface DynamicFeeState {
  dynBps: number;
  activity: bigint;
  lastUpdate: number;
}

/**
 * Fee quote returned by the core module.
 *
 * @property inBps - Fee on input amount (bps)
 * @property outBps - Fee on output amount (bps)
 * @property protocolShareBps - Protocol's share of total fee (bps)
 */
export interface FeeQuote {
  inBps: number;
  outBps: number;
  protocolShareBps: number;
}

/**
 * Pool information discovered from PairCreated event.
 */
export interface PoolInfo {
  /** Pool contract address */
  address: Address;
  /** First token address (sorted) */
  token0: Address;
  /** Second token address (sorted) */
  token1: Address;
  /** User module address (zero if none) */
  userModule: Address;
  /** Module mask (bit flags) */
  moduleMask: number;
  /** Base fee configuration */
  baseFeeConfig: BaseFeeConfig;
  /** Total number of pools when this was created */
  pairIndex: bigint;
  /** Block number when pool was created */
  blockNumber: bigint;
  /** Transaction hash of pool creation */
  transactionHash: string;
}

/**
 * Extended pool information with token details.
 */
export interface PoolInfoExtended extends PoolInfo {
  token0Symbol?: string;
  token0Decimals?: number;
  token1Symbol?: string;
  token1Decimals?: number;
}

/**
 * Pool state at a point in time.
 */
export interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  fees0: bigint;
  fees1: bigint;
  totalSupply: bigint;
}

/**
 * Context for swap fee calculation.
 */
export interface SwapContext {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  data?: `0x${string}`;
}

/**
 * Result of a swap simulation.
 */
export interface SwapSimulationResult {
  /** Input amount */
  amountIn: bigint;
  /** Output amount after fees */
  amountOut: bigint;
  /** Output amount before fees (theoretical) */
  amountOutBeforeFees: bigint;
  /** Total fee amount (in output token terms) */
  feeAmount: bigint;
  /** Effective fee rate in bps */
  effectiveFeeBps: number;
  /** Price impact in bps */
  priceImpactBps: number;
  /** Execution price (output per input) */
  executionPrice: number;
  /** Spot price before swap */
  spotPrice: number;
}

/**
 * Parameters for exact input swap.
 */
export interface ExactInputParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  userModule?: Address;
  moduleMask?: number;
  baseFeeConfig?: BaseFeeConfig;
}

/**
 * Parameters for exact output swap.
 */
export interface ExactOutputParams {
  tokenIn: Address;
  tokenOut: Address;
  amountOut: bigint;
  userModule?: Address;
  moduleMask?: number;
  baseFeeConfig?: BaseFeeConfig;
}

/**
 * PairCreated event data.
 */
export interface PairCreatedEvent {
  token0: Address;
  token1: Address;
  module: Address;
  pair: Address;
  pairCount: bigint;
  moduleMask: number;
  baseFeeConfig: BaseFeeConfig;
}

/**
 * DynamicFeeUpdated event data.
 */
export interface DynamicFeeUpdatedEvent {
  pair: Address;
  dynBps: number;
  activity: bigint;
  lastUpdate: number;
  pulse: bigint;
}

/**
 * Swap event data.
 */
export interface SwapEvent {
  sender: Address;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  to: Address;
}

/**
 * Options for pool discovery.
 */
export interface PoolDiscoveryOptions {
  /** Start block for historical scan */
  fromBlock?: bigint;
  /** End block for historical scan */
  toBlock?: bigint;
  /** Filter by token address */
  tokenFilter?: Address;
  /** Include token metadata */
  includeTokenInfo?: boolean;
}

/**
 * Fee calculation result with breakdown.
 */
export interface FeeCalculationResult {
  /** Pool address */
  poolAddress: Address;
  /** Base fee configuration */
  baseFeeConfig: BaseFeeConfig;
  /** Effective base fee in bps (considering direction) */
  effectiveBaseFee: number;
  /** Dynamic fee configuration */
  dynamicFeeConfig: DynamicFeeConfig;
  /** Current dynamic fee in bps */
  currentDynamicFee: number;
  /** Total effective fee in bps */
  totalFeeBps: number;
  /** Protocol share in bps */
  protocolShareBps: number;
  /** LP fee (total - protocol) in bps */
  lpFeeBps: number;
}

/**
 * Constants for fee calculations.
 */
export const FEE_CONSTANTS = {
  /** 100% in the protocol's bps format */
  BPS_DENOMINATOR: 1_000_000_000,
  /** Standard weight sum for fee distribution */
  WEIGHT_SUM: 1_000_000_000,
  /** Default module mask (core module only) */
  DEFAULT_MODULE_MASK: 1,
  /** Zero address */
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000' as Address,
} as const;

/**
 * Module mask bit flags.
 */
export const MODULE_FLAGS = {
  CORE: 1 << 0,      // 1 - Core module (always set)
  SWAP: 1 << 1,      // 2 - Swap hooks
  LIQUIDITY: 1 << 2, // 4 - Liquidity hooks
  ACCESS: 1 << 3,    // 8 - Access hooks
  INITIALIZE: 1 << 4, // 16 - Initialize hooks
} as const;
