import type { Address, PublicClient } from 'viem';
import { parseAbiItem } from 'viem';
import { CoreModuleContract } from '../core/CoreModuleContract.js';
import type {
  DynamicFeeConfig,
  DynamicFeeState,
  DynamicFeeUpdatedEvent,
} from '../types/index.js';
import { FEE_CONSTANTS } from '../types/index.js';

/**
 * Service for calculating dynamic fees off-chain.
 * Tracks activity and decays fees over time based on the protocol's formula.
 *
 * Dynamic Fee Mechanism:
 * - Each swap increases the "activity" metric based on swap size relative to reserves
 * - Activity decays exponentially over time based on halfLife
 * - Dynamic fee = min(activity * scale, maxCapBps)
 *
 * @example
 * ```typescript
 * const calculator = new DynamicFeeCalculator(client, coreModuleAddress);
 *
 * // Get current dynamic fee for a pool
 * const dynFee = await calculator.getCurrentDynamicFee(poolAddress);
 * console.log(`Current dynamic fee: ${dynFee / 10_000_000}%`);
 *
 * // Simulate fee after a swap
 * const newFee = calculator.simulateFeeAfterSwap(state, config, swapPulse, currentTime);
 * ```
 */
export class DynamicFeeCalculator {
  private readonly client: PublicClient;
  private readonly coreModule: CoreModuleContract;

  /** Cached dynamic fee states by pool */
  private stateCache: Map<Address, DynamicFeeState> = new Map();

  /**
   * Creates a new DynamicFeeCalculator instance.
   *
   * @param client - Viem public client
   * @param coreModuleAddress - Core module contract address
   */
  constructor(client: PublicClient, coreModuleAddress: Address) {
    this.client = client;
    this.coreModule = new CoreModuleContract(client, coreModuleAddress);
  }

  /**
   * Gets the core module contract wrapper.
   */
  getCoreModule(): CoreModuleContract {
    return this.coreModule;
  }

  /**
   * Gets the dynamic fee configuration for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Dynamic fee configuration
   */
  async getDynamicConfig(poolAddress: Address): Promise<DynamicFeeConfig> {
    return this.coreModule.getEffectiveDynamicConfig(poolAddress);
  }

  /**
   * Fetches the latest DynamicFeeUpdated event for a pool.
   * This provides the current on-chain dynamic fee state.
   *
   * @param poolAddress - Pool address
   * @param lookbackBlocks - Number of blocks to look back (default: 10000)
   * @returns Latest dynamic fee state or undefined if no events found
   */
  async getLatestDynamicFeeEvent(
    poolAddress: Address,
    lookbackBlocks = 10000n
  ): Promise<DynamicFeeState | undefined> {
    const currentBlock = await this.client.getBlockNumber();
    const fromBlock = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

    const logs = await this.client.getLogs({
      address: this.coreModule.getAddress(),
      event: parseAbiItem(
        'event DynamicFeeUpdated(address indexed pair, uint32 dynBps, uint256 activity, uint40 lastUpdate, uint256 pulse)'
      ),
      args: {
        pair: poolAddress,
      },
      fromBlock,
      toBlock: 'latest',
    });

    if (logs.length === 0) {
      return undefined;
    }

    // Get the latest event
    const latest = logs[logs.length - 1];
    const state: DynamicFeeState = {
      dynBps: latest.args.dynBps as number,
      activity: latest.args.activity as bigint,
      lastUpdate: Number(latest.args.lastUpdate),
    };

    // Cache the state
    this.stateCache.set(poolAddress, state);

    return state;
  }

  /**
   * Calculates the decayed activity level based on time elapsed.
   * Uses exponential decay: activity = activity * 2^(-elapsed / halfLife)
   *
   * @param activity - Current activity level
   * @param elapsed - Seconds since last update
   * @param halfLife - Half-life in seconds
   * @returns Decayed activity level
   */
  calculateDecayedActivity(
    activity: bigint,
    elapsed: number,
    halfLife: number
  ): bigint {
    if (elapsed <= 0 || halfLife <= 0) {
      return activity;
    }

    // Exponential decay: activity * 2^(-elapsed / halfLife)
    // Using floating point for the decay factor, then converting back to bigint
    const decayFactor = Math.pow(2, -elapsed / halfLife);

    // For very small decay factors, return 0 to avoid precision issues
    if (decayFactor < 1e-18) {
      return 0n;
    }

    // Scale the decay factor to maintain precision
    const PRECISION = BigInt(1e18);
    const scaledDecayFactor = BigInt(Math.floor(decayFactor * Number(PRECISION)));

    return (activity * scaledDecayFactor) / PRECISION;
  }

  /**
   * Calculates the swap pulse (impact on activity).
   * Pulse = outputAmount * PRECISION / reserveOut
   *
   * @param amountOut - Output amount of the swap
   * @param reserveOut - Output reserve before swap
   * @returns Pulse value
   */
  calculateSwapPulse(amountOut: bigint, reserveOut: bigint): bigint {
    if (reserveOut === 0n) {
      return 0n;
    }

    // Pulse = amountOut * 1e18 / reserveOut (scaled for precision)
    const PRECISION = BigInt(1e18);
    return (amountOut * PRECISION) / reserveOut;
  }

  /**
   * Calculates the new activity level after a swap.
   *
   * @param currentActivity - Current activity (after decay)
   * @param pulse - Swap pulse
   * @returns New activity level
   */
  calculateNewActivity(currentActivity: bigint, pulse: bigint): bigint {
    // Activity increases by pulse
    return currentActivity + pulse;
  }

  /**
   * Converts activity to dynamic fee in bps.
   * Fee = min(activity * scale, maxCapBps)
   *
   * @param activity - Activity level
   * @param maxCapBps - Maximum fee cap
   * @returns Dynamic fee in bps
   */
  activityToFeeBps(activity: bigint, maxCapBps: number): number {
    // Scale activity to bps (activity is in 1e18 precision)
    // A pulse of 1% (1e16) should result in some fee increase
    // Assuming activity scale factor of ~100x to bps
    const ACTIVITY_SCALE = BigInt(1e16);
    const scaledActivity = Number(activity / ACTIVITY_SCALE);

    return Math.min(scaledActivity, maxCapBps);
  }

  /**
   * Simulates the dynamic fee after a swap.
   *
   * @param state - Current dynamic fee state
   * @param config - Dynamic fee configuration
   * @param amountOut - Swap output amount
   * @param reserveOut - Output reserve
   * @param currentTimestamp - Current timestamp
   * @returns Simulated new dynamic fee in bps
   */
  simulateFeeAfterSwap(
    state: DynamicFeeState,
    config: DynamicFeeConfig,
    amountOut: bigint,
    reserveOut: bigint,
    currentTimestamp: number
  ): {
    newDynBps: number;
    newActivity: bigint;
    pulse: bigint;
    decayedActivity: bigint;
  } {
    if (!config.enabled) {
      return {
        newDynBps: 0,
        newActivity: 0n,
        pulse: 0n,
        decayedActivity: 0n,
      };
    }

    // Calculate time elapsed since last update
    const elapsed = currentTimestamp - state.lastUpdate;

    // Decay the activity
    const decayedActivity = this.calculateDecayedActivity(
      state.activity,
      elapsed,
      config.halfLife
    );

    // Calculate swap pulse
    const pulse = this.calculateSwapPulse(amountOut, reserveOut);

    // Calculate new activity
    const newActivity = this.calculateNewActivity(decayedActivity, pulse);

    // Convert to fee
    const newDynBps = this.activityToFeeBps(newActivity, config.maxCapBps);

    return {
      newDynBps,
      newActivity,
      pulse,
      decayedActivity,
    };
  }

  /**
   * Gets the current dynamic fee for a pool (accounting for decay).
   *
   * @param poolAddress - Pool address
   * @returns Current dynamic fee in bps
   */
  async getCurrentDynamicFee(poolAddress: Address): Promise<number> {
    const config = await this.getDynamicConfig(poolAddress);

    if (!config.enabled) {
      return 0;
    }

    const state = await this.getLatestDynamicFeeEvent(poolAddress);

    if (!state) {
      return 0;
    }

    // Get current timestamp from blockchain
    const block = await this.client.getBlock();
    const currentTimestamp = Number(block.timestamp);

    // Calculate elapsed time
    const elapsed = currentTimestamp - state.lastUpdate;

    // Decay the activity
    const decayedActivity = this.calculateDecayedActivity(
      state.activity,
      elapsed,
      config.halfLife
    );

    // Convert to fee
    return this.activityToFeeBps(decayedActivity, config.maxCapBps);
  }

  /**
   * Watches for DynamicFeeUpdated events for a pool.
   *
   * @param poolAddress - Pool address
   * @param callback - Function to call on new events
   * @returns Unwatch function
   */
  watchDynamicFeeUpdates(
    poolAddress: Address,
    callback: (event: DynamicFeeUpdatedEvent, blockNumber: bigint) => void
  ): () => void {
    return this.client.watchEvent({
      address: this.coreModule.getAddress(),
      event: parseAbiItem(
        'event DynamicFeeUpdated(address indexed pair, uint32 dynBps, uint256 activity, uint40 lastUpdate, uint256 pulse)'
      ),
      args: {
        pair: poolAddress,
      },
      onLogs: (logs) => {
        for (const log of logs) {
          const event: DynamicFeeUpdatedEvent = {
            pair: log.args.pair as Address,
            dynBps: log.args.dynBps as number,
            activity: log.args.activity as bigint,
            lastUpdate: Number(log.args.lastUpdate),
            pulse: log.args.pulse as bigint,
          };

          // Update cache
          this.stateCache.set(poolAddress, {
            dynBps: event.dynBps,
            activity: event.activity,
            lastUpdate: event.lastUpdate,
          });

          callback(event, log.blockNumber);
        }
      },
    });
  }

  /**
   * Gets cached state for a pool.
   *
   * @param poolAddress - Pool address
   * @returns Cached state or undefined
   */
  getCachedState(poolAddress: Address): DynamicFeeState | undefined {
    return this.stateCache.get(poolAddress);
  }

  /**
   * Estimates time until dynamic fee decays to a target level.
   *
   * @param currentFee - Current dynamic fee in bps
   * @param targetFee - Target fee in bps
   * @param halfLife - Half-life in seconds
   * @returns Estimated seconds until target is reached
   */
  estimateDecayTime(currentFee: number, targetFee: number, halfLife: number): number {
    if (currentFee <= targetFee) {
      return 0;
    }

    // Using decay formula: target = current * 2^(-t/halfLife)
    // t = -halfLife * log2(target/current)
    const ratio = targetFee / currentFee;
    const decayPeriods = -Math.log2(ratio);

    return Math.ceil(decayPeriods * halfLife);
  }

  /**
   * Formats dynamic fee information as human-readable.
   *
   * @param state - Dynamic fee state
   * @param config - Dynamic fee configuration
   * @returns Formatted information
   */
  formatDynamicFeeInfo(
    state: DynamicFeeState,
    config: DynamicFeeConfig
  ): {
    currentDynBps: number;
    currentDynPercent: string;
    maxCapPercent: string;
    halfLifeMinutes: string;
    lastUpdateAgo: string;
    enabled: boolean;
  } {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - state.lastUpdate;

    return {
      currentDynBps: state.dynBps,
      currentDynPercent: `${(state.dynBps / FEE_CONSTANTS.BPS_DENOMINATOR * 100).toFixed(4)}%`,
      maxCapPercent: `${(config.maxCapBps / FEE_CONSTANTS.BPS_DENOMINATOR * 100).toFixed(4)}%`,
      halfLifeMinutes: `${(config.halfLife / 60).toFixed(1)} min`,
      lastUpdateAgo: `${elapsed} seconds ago`,
      enabled: config.enabled,
    };
  }
}
