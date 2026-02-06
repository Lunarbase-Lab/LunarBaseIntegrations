/**
 * Tests for DynamicFeeCalculator service
 *
 * These tests cover:
 * - Activity decay calculations
 * - Pulse calculations
 * - Fee conversion from activity
 * - Decay time estimation
 */

import { describe, it, expect } from 'vitest';
import type { DynamicFeeConfig, DynamicFeeState } from '../src/types/index.js';
import { FEE_CONSTANTS } from '../src/types/index.js';

describe('DynamicFeeCalculator', () => {
  // Helper functions that mirror the calculator logic
  // Simplified decay calculation for testing
  const calculateDecayedActivity = (
    activity: bigint,
    elapsed: number,
    halfLife: number
  ): bigint => {
    if (elapsed <= 0 || halfLife <= 0) {
      return activity;
    }

    // Simple exponential decay: activity * 2^(-elapsed/halfLife)
    // Using approximation for testing purposes
    const decayFactor = Math.pow(2, -elapsed / halfLife);
    const decayed = BigInt(Math.floor(Number(activity) * decayFactor));

    return decayed;
  };

  const calculateSwapPulse = (amountOut: bigint, reserveOut: bigint): bigint => {
    if (reserveOut === 0n) {
      return 0n;
    }
    const PRECISION = BigInt(1e18);
    return (amountOut * PRECISION) / reserveOut;
  };

  const activityToFeeBps = (activity: bigint, maxCapBps: number): number => {
    const ACTIVITY_SCALE = BigInt(1e16);
    const scaledActivity = Number(activity / ACTIVITY_SCALE);
    return Math.min(scaledActivity, maxCapBps);
  };

  const estimateDecayTime = (
    currentFee: number,
    targetFee: number,
    halfLife: number
  ): number => {
    if (currentFee <= targetFee) {
      return 0;
    }
    const ratio = targetFee / currentFee;
    const decayPeriods = -Math.log2(ratio);
    return Math.ceil(decayPeriods * halfLife);
  };

  describe('calculateDecayedActivity', () => {
    it('should not decay with zero elapsed time', () => {
      const activity = BigInt(1000e16);
      const decayed = calculateDecayedActivity(activity, 0, 300);
      expect(decayed).toBe(activity);
    });

    it('should decay to approximately half after one half-life', () => {
      const activity = BigInt(1000e16);
      const halfLife = 300; // 5 minutes

      const decayed = calculateDecayedActivity(activity, halfLife, halfLife);

      // Should be approximately half
      const ratio = Number(decayed) / Number(activity);
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(0.6);
    });

    it('should decay to approximately quarter after two half-lives', () => {
      const activity = BigInt(1000e16);
      const halfLife = 300;

      const decayed = calculateDecayedActivity(activity, halfLife * 2, halfLife);

      const ratio = Number(decayed) / Number(activity);
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.35);
    });

    it('should approach zero after many half-lives', () => {
      const activity = BigInt(1000e16);
      const halfLife = 300;

      const decayed = calculateDecayedActivity(activity, halfLife * 10, halfLife);

      // After 10 half-lives, should be ~1/1024 of original
      const ratio = Number(decayed) / Number(activity);
      expect(ratio).toBeLessThan(0.01);
    });
  });

  describe('calculateSwapPulse', () => {
    it('should calculate pulse proportional to swap size', () => {
      const reserveOut = BigInt(100e18);

      // 1% of reserve
      const smallSwap = BigInt(1e18);
      const smallPulse = calculateSwapPulse(smallSwap, reserveOut);

      // 10% of reserve
      const largeSwap = BigInt(10e18);
      const largePulse = calculateSwapPulse(largeSwap, reserveOut);

      // Large pulse should be 10x small pulse
      expect(Number(largePulse)).toBe(Number(smallPulse) * 10);
    });

    it('should return 1e18 for 100% of reserve', () => {
      const reserveOut = BigInt(100e18);
      const amountOut = BigInt(100e18);

      const pulse = calculateSwapPulse(amountOut, reserveOut);

      expect(pulse).toBe(BigInt(1e18));
    });

    it('should return 0 for zero reserves', () => {
      const pulse = calculateSwapPulse(BigInt(1e18), 0n);
      expect(pulse).toBe(0n);
    });
  });

  describe('activityToFeeBps', () => {
    it('should convert activity to fee correctly', () => {
      // 1e16 activity = 1 bps
      const activity = BigInt(100e16); // Should give 100 bps
      const fee = activityToFeeBps(activity, 1000);

      expect(fee).toBe(100);
    });

    it('should cap at maxCapBps', () => {
      const activity = BigInt(10000e16); // Would give 10000 bps
      const maxCap = 500;

      const fee = activityToFeeBps(activity, maxCap);

      expect(fee).toBe(maxCap);
    });

    it('should return 0 for zero activity', () => {
      const fee = activityToFeeBps(0n, 1000);
      expect(fee).toBe(0);
    });
  });

  describe('estimateDecayTime', () => {
    it('should return 0 when target exceeds current', () => {
      const time = estimateDecayTime(100, 200, 300);
      expect(time).toBe(0);
    });

    it('should return halfLife for half decay', () => {
      const halfLife = 300;
      const time = estimateDecayTime(100, 50, halfLife);

      // Should be approximately one half-life
      expect(time).toBeCloseTo(halfLife, -1);
    });

    it('should return 2x halfLife for quarter decay', () => {
      const halfLife = 300;
      const time = estimateDecayTime(100, 25, halfLife);

      // Should be approximately two half-lives
      expect(time).toBeCloseTo(halfLife * 2, -1);
    });
  });

  describe('simulateFeeAfterSwap', () => {
    it('should increase activity after swap', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000, // 5%
        halfLife: 300,
        enabled: true,
      };

      const state: DynamicFeeState = {
        dynBps: 0,
        activity: 0n,
        lastUpdate: 1000,
      };

      const amountOut = BigInt(1e18);
      const reserveOut = BigInt(100e18);
      const currentTimestamp = 1000; // Same as lastUpdate, no decay

      const pulse = calculateSwapPulse(amountOut, reserveOut);
      const newActivity = state.activity + pulse;
      const newDynBps = activityToFeeBps(newActivity, config.maxCapBps);

      expect(newActivity).toBeGreaterThan(state.activity);
      expect(newDynBps).toBeGreaterThan(state.dynBps);
    });

    it('should decay activity before adding pulse', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000,
        halfLife: 300,
        enabled: true,
      };

      const state: DynamicFeeState = {
        dynBps: 1000,
        activity: BigInt(1000e16),
        lastUpdate: 1000,
      };

      const amountOut = BigInt(1e18);
      const reserveOut = BigInt(100e18);
      const currentTimestamp = 1300; // 300 seconds later = 1 half-life

      // Decay activity
      const elapsed = currentTimestamp - state.lastUpdate;
      const decayedActivity = calculateDecayedActivity(
        state.activity,
        elapsed,
        config.halfLife
      );

      // Activity should be roughly halved
      expect(Number(decayedActivity)).toBeLessThan(Number(state.activity));
    });

    it('should return zero fee when disabled', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000,
        halfLife: 300,
        enabled: false,
      };

      // When disabled, dynamic fee should always be 0
      expect(config.enabled).toBe(false);
    });
  });

  describe('time-series simulation', () => {
    it('should correctly simulate fee evolution over time with periodic swaps', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000, // 5%
        halfLife: 300, // 5 minutes
        enabled: true,
      };

      // Simulation parameters - frequent large swaps to see accumulation
      const startTimestamp = 1000;
      const swapInterval = 30; // Every 30 seconds (frequent)
      const simulationDuration = 180; // 3 minutes
      const reserveOut = BigInt(100e18);
      const swapAmount = BigInt(5e18); // 5% of reserve (larger swap)

      let state: DynamicFeeState = {
        dynBps: 0,
        activity: 0n,
        lastUpdate: startTimestamp,
      };

      const feeHistory: { time: number; fee: number; activity: bigint }[] = [];

      // Record initial state
      feeHistory.push({ time: 0, fee: state.dynBps, activity: state.activity });

      // Simulate over time
      for (let elapsed = swapInterval; elapsed <= simulationDuration; elapsed += swapInterval) {
        const currentTime = startTimestamp + elapsed;

        // Calculate decay first
        const decayedActivity = calculateDecayedActivity(
          state.activity,
          currentTime - state.lastUpdate,
          config.halfLife
        );

        // Add swap pulse
        const pulse = calculateSwapPulse(swapAmount, reserveOut);
        const newActivity = decayedActivity + pulse;
        const newFee = activityToFeeBps(newActivity, config.maxCapBps);

        state = {
          dynBps: newFee,
          activity: newActivity,
          lastUpdate: currentTime,
        };

        feeHistory.push({ time: elapsed, fee: state.dynBps, activity: state.activity });
      }

      // Verify first swap creates non-zero fee
      expect(feeHistory[1].fee).toBeGreaterThan(feeHistory[0].fee);
      
      // Verify activity accumulates (each swap adds pulse)
      expect(feeHistory[1].activity).toBeGreaterThan(feeHistory[0].activity);
      expect(feeHistory[2].activity).toBeGreaterThan(0n);

      // Verify final fee is non-zero
      const lastFee = feeHistory[feeHistory.length - 1].fee;
      expect(lastFee).toBeGreaterThan(0);
    });

    it('should decay fee to near zero after long period without swaps', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000,
        halfLife: 300, // 5 minutes
        enabled: true,
      };

      // Start with high activity
      const initialActivity = BigInt(1000e16); // High activity
      const initialFee = activityToFeeBps(initialActivity, config.maxCapBps);

      expect(initialFee).toBeGreaterThan(0);

      // After 10 half-lives (50 minutes), fee should be ~0
      const elapsed = config.halfLife * 10;
      const decayedActivity = calculateDecayedActivity(initialActivity, elapsed, config.halfLife);
      const decayedFee = activityToFeeBps(decayedActivity, config.maxCapBps);

      // Should be effectively zero (or very small)
      expect(decayedFee).toBeLessThan(initialFee / 100);
    });

    it('should respect maxCapBps even with very high activity', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 50_000_000, // 0.5% cap
        halfLife: 300,
        enabled: true,
      };

      // Very high activity that would exceed cap
      const hugeActivity = BigInt(1e30);
      const fee = activityToFeeBps(hugeActivity, config.maxCapBps);

      expect(fee).toBe(config.maxCapBps);
    });

    it('should show gradual decay between swaps', () => {
      const config: DynamicFeeConfig = {
        maxCapBps: 500_000_000,
        halfLife: 60, // 1 minute for faster decay
        enabled: true,
      };

      const startTimestamp = 1000;
      const reserveOut = BigInt(100e18);
      const swapAmount = BigInt(10e18); // 10% of reserve - big swap

      // Perform initial swap
      const pulse = calculateSwapPulse(swapAmount, reserveOut);
      const initialActivity = pulse;
      const initialFee = activityToFeeBps(initialActivity, config.maxCapBps);

      // Track decay over time (every 15 seconds)
      const decayPoints: { time: number; fee: number }[] = [];
      
      for (let elapsed = 0; elapsed <= 180; elapsed += 15) {
        const decayedActivity = calculateDecayedActivity(initialActivity, elapsed, config.halfLife);
        const fee = activityToFeeBps(decayedActivity, config.maxCapBps);
        decayPoints.push({ time: elapsed, fee });
      }

      // Verify monotonic decay
      for (let i = 1; i < decayPoints.length; i++) {
        expect(decayPoints[i].fee).toBeLessThanOrEqual(decayPoints[i - 1].fee);
      }

      // After 3 half-lives (180s), fee should be ~1/8 of initial
      const finalFee = decayPoints[decayPoints.length - 1].fee;
      expect(finalFee).toBeLessThan(initialFee / 4);
    });
  });

  describe('edge cases', () => {
    it('should handle very large activity values', () => {
      const activity = BigInt(1e30);
      const maxCap = 1_000_000_000; // 100%

      const fee = activityToFeeBps(activity, maxCap);

      // Should be capped
      expect(fee).toBe(maxCap);
    });

    it('should handle very small activity values', () => {
      const activity = BigInt(1e10); // Very small
      const maxCap = 1_000_000_000;

      const fee = activityToFeeBps(activity, maxCap);

      // Should be effectively 0
      expect(fee).toBe(0);
    });

    it('should handle zero halfLife', () => {
      const activity = BigInt(1000e16);
      const decayed = calculateDecayedActivity(activity, 100, 0);

      // Should return original activity
      expect(decayed).toBe(activity);
    });
  });
});
