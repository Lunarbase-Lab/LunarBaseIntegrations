import type { Address, PublicClient } from 'viem';
import { PoolContract } from '../core/PoolContract.js';
import { FeeCalculator } from './FeeCalculator.js';
import { QUOTER_ABI } from '../constants/abis.js';
import type {
  SwapSimulationResult,
  ExactInputParams,
  ExactOutputParams,
  PoolState,
} from '../types/index.js';
import { FEE_CONSTANTS } from '../types/index.js';

/**
 * Service for simulating swaps and calculating expected outputs.
 * Supports both exact input and exact output simulations.
 *
 * @example
 * ```typescript
 * const simulator = new SwapSimulator(client, quoterAddress, coreModuleAddress);
 *
 * // Simulate exact input swap
 * const result = await simulator.simulateExactInput(
 *   poolAddress,
 *   { tokenIn, tokenOut, amountIn: parseEther('1') }
 * );
 *
 * console.log(`Output: ${formatEther(result.amountOut)}`);
 * console.log(`Price impact: ${result.priceImpactBps / 100}%`);
 * ```
 */
export class SwapSimulator {
  private readonly client: PublicClient;
  private readonly quoterAddress: Address;
  private readonly feeCalculator: FeeCalculator;

  /**
   * Creates a new SwapSimulator instance.
   *
   * @param client - Viem public client
   * @param quoterAddress - Quoter contract address
   * @param coreModuleAddress - Core module contract address
   */
  constructor(
    client: PublicClient,
    quoterAddress: Address,
    coreModuleAddress: Address
  ) {
    this.client = client;
    this.quoterAddress = quoterAddress;
    this.feeCalculator = new FeeCalculator(client, coreModuleAddress);
  }

  /**
   * Gets the fee calculator instance.
   */
  getFeeCalculator(): FeeCalculator {
    return this.feeCalculator;
  }

  /**
   * Simulates an exact input swap using on-chain quoter.
   *
   * @param poolAddress - Pool address
   * @param params - Swap parameters
   * @returns Simulation result with amount out and price impact
   */
  async simulateExactInputOnChain(
    _poolAddress: Address,
    params: ExactInputParams
  ): Promise<bigint> {
    const baseFeeConfig = params.baseFeeConfig ?? {
      baseFee: 3_000_000,
      wToken0: 500_000_000,
      wToken1: 500_000_000,
    };

    const amountOut = await this.client.readContract({
      address: this.quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'getAmountOut',
      args: [
        params.amountIn,
        params.tokenIn,
        params.tokenOut,
        params.userModule ?? FEE_CONSTANTS.ZERO_ADDRESS,
        params.moduleMask ?? FEE_CONSTANTS.DEFAULT_MODULE_MASK,
        baseFeeConfig,
        '0x',
      ],
    });

    return amountOut as bigint;
  }

  /**
   * Simulates an exact output swap using on-chain quoter.
   *
   * @param poolAddress - Pool address
   * @param params - Swap parameters
   * @returns Required input amount
   */
  async simulateExactOutputOnChain(
    _poolAddress: Address,
    params: ExactOutputParams
  ): Promise<bigint> {
    const baseFeeConfig = params.baseFeeConfig ?? {
      baseFee: 3_000_000,
      wToken0: 500_000_000,
      wToken1: 500_000_000,
    };

    const amountIn = await this.client.readContract({
      address: this.quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'getAmountIn',
      args: [
        params.amountOut,
        params.tokenIn,
        params.tokenOut,
        params.userModule ?? FEE_CONSTANTS.ZERO_ADDRESS,
        params.moduleMask ?? FEE_CONSTANTS.DEFAULT_MODULE_MASK,
        baseFeeConfig,
        '0x',
      ],
    });

    return amountIn as bigint;
  }

  /**
   * Simulates an exact input swap with detailed breakdown.
   * Uses the weight-based fee split formula.
   *
   * @param poolAddress - Pool address
   * @param params - Swap parameters
   * @param state - Optional pool state (fetched if not provided)
   * @param feeBps - Optional total fee in bps (calculated if not provided)
   * @returns Detailed simulation result
   */
  async simulateExactInput(
    poolAddress: Address,
    params: ExactInputParams,
    state?: PoolState,
    feeBps?: number
  ): Promise<SwapSimulationResult> {
    const pool = new PoolContract(this.client, poolAddress);
    const [token0] = await pool.getTokens();

    // Get pool state if not provided
    const poolState = state ?? await pool.getState();
    const { reserve0, reserve1 } = poolState;

    // Determine swap direction
    const isToken0In = params.tokenIn.toLowerCase() === token0.toLowerCase();
    const [reserveIn, reserveOut] = isToken0In
      ? [reserve0, reserve1]
      : [reserve1, reserve0];

    // Calculate spot price (before swap)
    const spotPrice = Number(reserveOut) / Number(reserveIn);

    // Calculate theoretical output without fees (for price impact)
    const amountOutBeforeFees = this.getAmountOut(
      params.amountIn,
      reserveIn,
      reserveOut
    );

    // Get fee configuration
    const feeResult = await this.feeCalculator.getPoolFees(poolAddress, isToken0In);
    const totalFeeBps = feeBps ?? feeResult.totalFeeBps;

    // Get the weight for input token
    const weightIn = isToken0In
      ? feeResult.baseFeeConfig.wToken0
      : feeResult.baseFeeConfig.wToken1;

    // Calculate actual output with fees (using weight-based fee split)
    const amountOut = this.feeCalculator.calculateAmountOutWithFee(
      params.amountIn,
      reserveIn,
      reserveOut,
      totalFeeBps,
      weightIn
    );

    // Calculate fee amount (in output token terms)
    const feeAmount = amountOutBeforeFees - amountOut;

    // Calculate effective fee rate
    const effectiveFeeBps =
      amountOutBeforeFees > 0n
        ? Number((feeAmount * BigInt(FEE_CONSTANTS.BPS_DENOMINATOR)) / amountOutBeforeFees)
        : 0;

    // Calculate execution price
    const executionPrice = Number(amountOut) / Number(params.amountIn);

    // Calculate price impact
    const priceImpactBps = Math.round((1 - executionPrice / spotPrice) * 10_000);

    return {
      amountIn: params.amountIn,
      amountOut,
      amountOutBeforeFees,
      feeAmount,
      effectiveFeeBps,
      priceImpactBps,
      executionPrice,
      spotPrice,
    };
  }

  /**
   * Simulates an exact output swap with detailed breakdown.
   * Uses the weight-based fee split formula.
   *
   * @param poolAddress - Pool address
   * @param params - Swap parameters
   * @param state - Optional pool state
   * @param feeBps - Optional total fee in bps
   * @returns Detailed simulation result
   */
  async simulateExactOutput(
    poolAddress: Address,
    params: ExactOutputParams,
    state?: PoolState,
    feeBps?: number
  ): Promise<SwapSimulationResult> {
    const pool = new PoolContract(this.client, poolAddress);
    const [token0] = await pool.getTokens();

    // Get pool state if not provided
    const poolState = state ?? await pool.getState();
    const { reserve0, reserve1 } = poolState;

    // Determine swap direction
    const isToken0In = params.tokenIn.toLowerCase() === token0.toLowerCase();
    const [reserveIn, reserveOut] = isToken0In
      ? [reserve0, reserve1]
      : [reserve1, reserve0];

    // Calculate spot price (before swap)
    const spotPrice = Number(reserveOut) / Number(reserveIn);

    // Get fee configuration
    const feeResult = await this.feeCalculator.getPoolFees(poolAddress, isToken0In);
    const totalFeeBps = feeBps ?? feeResult.totalFeeBps;

    // Get the weight for input token
    const weightIn = isToken0In
      ? feeResult.baseFeeConfig.wToken0
      : feeResult.baseFeeConfig.wToken1;

    // Calculate required input with fees (using weight-based fee split)
    const amountIn = this.feeCalculator.calculateAmountInWithFee(
      params.amountOut,
      reserveIn,
      reserveOut,
      totalFeeBps,
      weightIn
    );

    // Calculate theoretical input without fees
    const amountInWithoutFees = this.getAmountIn(
      params.amountOut,
      reserveIn,
      reserveOut
    );

    // Calculate fee amount (in input token terms)
    const feeAmount = amountIn - amountInWithoutFees;

    // Calculate effective fee rate
    const effectiveFeeBps =
      amountInWithoutFees > 0n
        ? Number((feeAmount * BigInt(FEE_CONSTANTS.BPS_DENOMINATOR)) / amountInWithoutFees)
        : 0;

    // Calculate execution price
    const executionPrice = Number(params.amountOut) / Number(amountIn);

    // Calculate price impact
    const priceImpactBps = Math.round((1 - executionPrice / spotPrice) * 10_000);

    return {
      amountIn,
      amountOut: params.amountOut,
      amountOutBeforeFees: params.amountOut, // For exact output, this is the same
      feeAmount,
      effectiveFeeBps,
      priceImpactBps,
      executionPrice,
      spotPrice,
    };
  }

  /**
   * Calculates the output amount using constant product formula (no fees).
   *
   * @param amountIn - Input amount
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @returns Output amount
   */
  getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (reserveIn === 0n || reserveOut === 0n) {
      throw new Error('Insufficient liquidity');
    }
    const numerator = amountIn * reserveOut;
    const denominator = reserveIn + amountIn;
    return numerator / denominator;
  }

  /**
   * Calculates the input amount using constant product formula (no fees).
   *
   * @param amountOut - Desired output amount
   * @param reserveIn - Input reserve
   * @param reserveOut - Output reserve
   * @returns Required input amount
   */
  getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) {
      throw new Error('Insufficient liquidity');
    }
    const numerator = reserveIn * amountOut;
    const denominator = reserveOut - amountOut;
    return numerator / denominator + 1n;
  }

  /**
   * Estimates the minimum output with slippage tolerance.
   *
   * @param expectedOutput - Expected output amount
   * @param slippageBps - Slippage tolerance in bps (100 = 1%)
   * @returns Minimum output amount
   */
  calculateMinOutput(expectedOutput: bigint, slippageBps: number): bigint {
    return expectedOutput - (expectedOutput * BigInt(slippageBps)) / 10_000n;
  }

  /**
   * Estimates the maximum input with slippage tolerance.
   *
   * @param expectedInput - Expected input amount
   * @param slippageBps - Slippage tolerance in bps (100 = 1%)
   * @returns Maximum input amount
   */
  calculateMaxInput(expectedInput: bigint, slippageBps: number): bigint {
    return expectedInput + (expectedInput * BigInt(slippageBps)) / 10_000n;
  }

  /**
   * Formats simulation result as human-readable object.
   *
   * @param result - Simulation result
   * @param inputDecimals - Input token decimals
   * @param outputDecimals - Output token decimals
   * @returns Formatted result
   */
  formatResult(
    result: SwapSimulationResult,
    inputDecimals = 18,
    outputDecimals = 18
  ): {
    amountIn: string;
    amountOut: string;
    feeAmount: string;
    effectiveFeePercent: string;
    priceImpactPercent: string;
    executionPrice: string;
    spotPrice: string;
  } {
    const formatAmount = (amount: bigint, decimals: number) =>
      (Number(amount) / 10 ** decimals).toFixed(6);

    return {
      amountIn: formatAmount(result.amountIn, inputDecimals),
      amountOut: formatAmount(result.amountOut, outputDecimals),
      feeAmount: formatAmount(result.feeAmount, outputDecimals),
      effectiveFeePercent: `${(result.effectiveFeeBps / FEE_CONSTANTS.BPS_DENOMINATOR * 100).toFixed(4)}%`,
      priceImpactPercent: `${(result.priceImpactBps / 100).toFixed(4)}%`,
      executionPrice: result.executionPrice.toFixed(8),
      spotPrice: result.spotPrice.toFixed(8),
    };
  }
}
