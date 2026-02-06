import type { Address, PublicClient } from 'viem';
import { CoreModuleContract } from '../core/CoreModuleContract.js';
import type {
  BaseFeeConfig,
  DynamicFeeConfig,
  FeeCalculationResult,
  FeeQuote,
  SwapContext,
} from '../types/index.js';
import { FEE_CONSTANTS } from '../types/index.js';

/**
 * Service for calculating and extracting pool fees.
 * Provides methods to understand fee structure and calculate effective fees.
 *
 * @example
 * ```typescript
 * const calculator = new FeeCalculator(client, coreModuleAddress);
 *
 * // Get complete fee breakdown
 * const fees = await calculator.getPoolFees(poolAddress);
 * console.log(`Base fee: ${fees.effectiveBaseFee / 10_000_000}%`);
 * console.log(`Dynamic fee: ${fees.currentDynamicFee / 10_000_000}%`);
 * ```
 */
export class FeeCalculator {
  private readonly coreModule: CoreModuleContract;

  /**
   * Creates a new FeeCalculator instance.
   *
   * @param client - Viem public client
   * @param coreModuleAddress - Core module contract address
   */
  constructor(client: PublicClient, coreModuleAddress: Address) {
    this.coreModule = new CoreModuleContract(client, coreModuleAddress);
  }

  /**
   * Gets the core module contract wrapper.
   */
  getCoreModule(): CoreModuleContract {
    return this.coreModule;
  }

  /**
   * Gets the base fee configuration for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Base fee configuration
   */
  async getBaseFeeConfig(poolAddress: Address): Promise<BaseFeeConfig> {
    return this.coreModule.getPoolBaseFeeConfig(poolAddress);
  }

  /**
   * Gets the dynamic fee configuration for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Dynamic fee configuration
   */
  async getDynamicFeeConfig(poolAddress: Address): Promise<DynamicFeeConfig> {
    return this.coreModule.getEffectiveDynamicConfig(poolAddress);
  }

  /**
   * Calculates the effective base fee for a swap direction.
   *
   * The fee is weighted based on which token is being swapped.
   * If swapping token0 -> token1, the fee weight is wToken0.
   * If swapping token1 -> token0, the fee weight is wToken1.
   *
   * @param config - Base fee configuration
   * @param isToken0In - Whether token0 is the input
   * @returns Effective fee in bps (1_000_000_000 scale)
   */
  calculateEffectiveBaseFee(config: BaseFeeConfig, isToken0In: boolean): number {
    // Base fee is split according to weights
    // The weight determines how much of the fee is charged on input token
    const weight = isToken0In ? config.wToken0 : config.wToken1;

    // Fee = baseFee * weight / WEIGHT_SUM
    return Math.floor(
      (config.baseFee * weight) / FEE_CONSTANTS.WEIGHT_SUM
    );
  }

  /**
   * Converts fee from protocol bps (1_000_000_000 = 100%) to percentage.
   *
   * @param feeBps - Fee in protocol basis points
   * @returns Fee as percentage (e.g., 0.3 for 0.3%)
   */
  feeToPercent(feeBps: number): number {
    return (feeBps / FEE_CONSTANTS.BPS_DENOMINATOR) * 100;
  }

  /**
   * Converts percentage to protocol bps.
   *
   * @param percent - Fee percentage (e.g., 0.3 for 0.3%)
   * @returns Fee in protocol basis points
   */
  percentToFee(percent: number): number {
    return Math.floor((percent / 100) * FEE_CONSTANTS.BPS_DENOMINATOR);
  }

  /**
   * Gets the protocol share of fees.
   *
   * @returns Protocol share in bps (10000 = 100%)
   */
  async getProtocolShareBps(): Promise<number> {
    return this.coreModule.getProtocolShareBps();
  }

  /**
   * Previews the fee for a swap using on-chain calculation.
   *
   * @param poolAddress - Pool address
   * @param context - Swap context
   * @returns Fee quote
   */
  async previewFee(poolAddress: Address, context: SwapContext): Promise<FeeQuote> {
    return this.coreModule.previewFee(poolAddress, context);
  }

  /**
   * Gets complete fee breakdown for a pool.
   *
   * @param poolAddress - Pool address
   * @param isToken0In - Direction of swap (default: true)
   * @param currentDynamicFee - Current dynamic fee (if known)
   * @returns Complete fee calculation result
   */
  async getPoolFees(
    poolAddress: Address,
    isToken0In = true,
    currentDynamicFee = 0
  ): Promise<FeeCalculationResult> {
    const [baseFeeConfig, dynamicFeeConfig, protocolShareBps] = await Promise.all([
      this.getBaseFeeConfig(poolAddress),
      this.getDynamicFeeConfig(poolAddress),
      this.getProtocolShareBps(),
    ]);

    const effectiveBaseFee = this.calculateEffectiveBaseFee(baseFeeConfig, isToken0In);
    const totalFeeBps = effectiveBaseFee + currentDynamicFee;

    // Protocol fee is a percentage of the total fee
    // protocolShareBps is in 10000 = 100% scale
    const protocolFee = Math.floor((totalFeeBps * protocolShareBps) / 10_000);
    const lpFeeBps = totalFeeBps - protocolFee;

    return {
      poolAddress,
      baseFeeConfig,
      effectiveBaseFee,
      dynamicFeeConfig,
      currentDynamicFee,
      totalFeeBps,
      protocolShareBps,
      lpFeeBps,
    };
  }

  /**
   * Calculates the output amount after applying fees.
   * Fee is split between input and output based on weights.
   *
   * Formula:
   * 1. inFee = totalFee * weightIn / BPS_DEN
   * 2. outFee = totalFee - inFee
   * 3. amountInAfterFee = amountIn * (BPS_DEN - inFee) / BPS_DEN
   * 4. grossOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
   * 5. netOut = grossOut * (BPS_DEN - outFee) / BPS_DEN
   *
   * @param amountIn - Input amount
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @param totalFeeBps - Total fee in bps (baseFee + dynBps)
   * @param weightIn - Weight for input token (default: 100% = BPS_DENOMINATOR)
   * @returns Output amount after fees
   */
  calculateAmountOutWithFee(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    totalFeeBps: number,
    weightIn: number = FEE_CONSTANTS.BPS_DENOMINATOR
  ): bigint {
    if (reserveIn === 0n || reserveOut === 0n) {
      throw new Error('Insufficient liquidity');
    }

    const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR);

    // Cap totalFee at BPS_DEN - 1 (same as contract)
    const totalFee = BigInt(Math.min(totalFeeBps, FEE_CONSTANTS.BPS_DENOMINATOR - 1));

    // inFee = totalFee * weightIn / BPS_DEN
    const inFee = (totalFee * BigInt(weightIn)) / BPS_DEN;

    // outFee = totalFee - inFee
    const outFee = totalFee - inFee;

    // amountInAfterFee = amountIn * (BPS_DEN - inFee) / BPS_DEN
    const inFeeMultiplier = BPS_DEN - inFee;
    const amountInAfterFee = (amountIn * inFeeMultiplier) / BPS_DEN;

    if (amountInAfterFee <= 0n) {
      throw new Error('Amount in too small');
    }

    // grossOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
    const grossOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);

    if (grossOut <= 0n) {
      throw new Error('Invalid gross output');
    }

    // netOut = grossOut * (BPS_DEN - outFee) / BPS_DEN
    const outFeeMultiplier = BPS_DEN - outFee;
    const netOut = (grossOut * outFeeMultiplier) / BPS_DEN;

    return netOut;
  }

  /**
   * Calculates the input amount required to get a specific output.
   * Inverse of calculateAmountOutWithFee with fee split between input and output.
   *
   * @param amountOut - Desired output amount (netOut)
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @param totalFeeBps - Total fee in bps (baseFee + dynBps)
   * @param weightIn - Weight for input token (default: 100% = BPS_DENOMINATOR)
   * @returns Required input amount
   */
  calculateAmountInWithFee(
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    totalFeeBps: number,
    weightIn: number = FEE_CONSTANTS.BPS_DENOMINATOR
  ): bigint {
    if (reserveIn === 0n || reserveOut === 0n) {
      throw new Error('Insufficient liquidity');
    }

    const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR);

    // Cap totalFee at BPS_DEN - 1
    const totalFee = BigInt(Math.min(totalFeeBps, FEE_CONSTANTS.BPS_DENOMINATOR - 1));

    // inFee = totalFee * weightIn / BPS_DEN
    const inFee = (totalFee * BigInt(weightIn)) / BPS_DEN;

    // outFee = totalFee - inFee
    const outFee = totalFee - inFee;

    // To get netOut, we need grossOut such that:
    // netOut = grossOut * (BPS_DEN - outFee) / BPS_DEN
    // grossOut = netOut * BPS_DEN / (BPS_DEN - outFee)
    const outFeeMultiplier = BPS_DEN - outFee;
    if (outFeeMultiplier <= 0n) {
      throw new Error('Fee too high');
    }
    const grossOut = (amountOut * BPS_DEN + outFeeMultiplier - 1n) / outFeeMultiplier; // Round up

    if (grossOut >= reserveOut) {
      throw new Error('Insufficient liquidity');
    }

    // From grossOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
    // amountInAfterFee = grossOut * reserveIn / (reserveOut - grossOut)
    const amountInAfterFee = (grossOut * reserveIn + (reserveOut - grossOut) - 1n) / (reserveOut - grossOut); // Round up

    // From amountInAfterFee = amountIn * (BPS_DEN - inFee) / BPS_DEN
    // amountIn = amountInAfterFee * BPS_DEN / (BPS_DEN - inFee)
    const inFeeMultiplier = BPS_DEN - inFee;
    if (inFeeMultiplier <= 0n) {
      throw new Error('Fee too high');
    }
    const amountIn = (amountInAfterFee * BPS_DEN + inFeeMultiplier - 1n) / inFeeMultiplier; // Round up

    return amountIn;
  }

  /**
   * Gets fee information for multiple pools.
   *
   * @param poolAddresses - Array of pool addresses
   * @returns Array of fee calculation results
   */
  async getPoolFeesMultiple(poolAddresses: Address[]): Promise<FeeCalculationResult[]> {
    return Promise.all(poolAddresses.map((addr) => this.getPoolFees(addr)));
  }

  /**
   * Formats fee result as human-readable object.
   *
   * @param result - Fee calculation result
   * @returns Human-readable fee breakdown
   */
  formatFeeResult(result: FeeCalculationResult): {
    pool: string;
    baseFeePercent: string;
    effectiveFeePercent: string;
    dynamicFeePercent: string;
    totalFeePercent: string;
    protocolSharePercent: string;
    lpFeePercent: string;
  } {
    return {
      pool: result.poolAddress,
      baseFeePercent: `${this.feeToPercent(result.baseFeeConfig.baseFee).toFixed(4)}%`,
      effectiveFeePercent: `${this.feeToPercent(result.effectiveBaseFee).toFixed(4)}%`,
      dynamicFeePercent: `${this.feeToPercent(result.currentDynamicFee).toFixed(4)}%`,
      totalFeePercent: `${this.feeToPercent(result.totalFeeBps).toFixed(4)}%`,
      protocolSharePercent: `${(result.protocolShareBps / 100).toFixed(2)}%`,
      lpFeePercent: `${this.feeToPercent(result.lpFeeBps).toFixed(4)}%`,
    };
  }
}
