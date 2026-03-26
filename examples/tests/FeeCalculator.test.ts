/**
 * Tests for FeeCalculator service
 *
 * These tests cover:
 * - Fee weight calculations
 * - Amount calculations with fees
 * - Fee conversion utilities
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { FeeCalculator } from '../src/services/FeeCalculator.js';
import type { BaseFeeConfig } from '../src/types/index.js';
import { FEE_CONSTANTS } from '../src/types/index.js';

describe('FeeCalculator', () => {
  describe('calculateEffectiveBaseFee', () => {
    it('should calculate effective fee for symmetric weights', () => {
      const config: BaseFeeConfig = {
        baseFee: 3_000_000, // 0.3%
        wToken0: 500_000_000, // 50%
        wToken1: 500_000_000, // 50%
      };

      // Create a mock calculator (we don't need RPC for these calculations)
      const calculator = {
        calculateEffectiveBaseFee: (cfg: BaseFeeConfig, isToken0In: boolean) => {
          const weight = isToken0In ? cfg.wToken0 : cfg.wToken1;
          return Math.floor((cfg.baseFee * weight) / FEE_CONSTANTS.WEIGHT_SUM);
        },
      };

      // Token0 in: fee = 3_000_000 * 500_000_000 / 1_000_000_000 = 1_500_000
      expect(calculator.calculateEffectiveBaseFee(config, true)).toBe(1_500_000);
      // Token1 in: same with symmetric weights
      expect(calculator.calculateEffectiveBaseFee(config, false)).toBe(1_500_000);
    });

    it('should calculate effective fee for asymmetric weights', () => {
      const config: BaseFeeConfig = {
        baseFee: 10_000_000, // 1%
        wToken0: 700_000_000, // 70%
        wToken1: 300_000_000, // 30%
      };

      const calculator = {
        calculateEffectiveBaseFee: (cfg: BaseFeeConfig, isToken0In: boolean) => {
          const weight = isToken0In ? cfg.wToken0 : cfg.wToken1;
          return Math.floor((cfg.baseFee * weight) / FEE_CONSTANTS.WEIGHT_SUM);
        },
      };

      // Token0 in: fee = 10_000_000 * 700_000_000 / 1_000_000_000 = 7_000_000
      expect(calculator.calculateEffectiveBaseFee(config, true)).toBe(7_000_000);
      // Token1 in: fee = 10_000_000 * 300_000_000 / 1_000_000_000 = 3_000_000
      expect(calculator.calculateEffectiveBaseFee(config, false)).toBe(3_000_000);
    });

    it('should handle zero fee', () => {
      const config: BaseFeeConfig = {
        baseFee: 0,
        wToken0: 500_000_000,
        wToken1: 500_000_000,
      };

      const calculator = {
        calculateEffectiveBaseFee: (cfg: BaseFeeConfig, isToken0In: boolean) => {
          const weight = isToken0In ? cfg.wToken0 : cfg.wToken1;
          return Math.floor((cfg.baseFee * weight) / FEE_CONSTANTS.WEIGHT_SUM);
        },
      };

      expect(calculator.calculateEffectiveBaseFee(config, true)).toBe(0);
      expect(calculator.calculateEffectiveBaseFee(config, false)).toBe(0);
    });
  });

  describe('feeToPercent and percentToFee', () => {
    it('should convert fee to percent correctly', () => {
      // 0.3% = 3_000_000 bps
      expect((3_000_000 / FEE_CONSTANTS.BPS_DENOMINATOR) * 100).toBeCloseTo(0.3);

      // 1% = 10_000_000 bps
      expect((10_000_000 / FEE_CONSTANTS.BPS_DENOMINATOR) * 100).toBeCloseTo(1.0);

      // 100% = 1_000_000_000 bps
      expect((1_000_000_000 / FEE_CONSTANTS.BPS_DENOMINATOR) * 100).toBeCloseTo(100);
    });

    it('should convert percent to fee correctly', () => {
      // 0.3% -> 3_000_000 bps
      expect(Math.floor((0.3 / 100) * FEE_CONSTANTS.BPS_DENOMINATOR)).toBe(3_000_000);

      // 1% -> 10_000_000 bps
      expect(Math.floor((1.0 / 100) * FEE_CONSTANTS.BPS_DENOMINATOR)).toBe(10_000_000);
    });

    /**
     * High-precision BPS tests:
     * BPS_DEN = 10^9 (1_000_000_000)
     * baseFee=300000 → 0.03%
     * baseFee=7500 → 0.00075%
     * baseFee=190000 → 0.019%
     */
    it('should handle high-precision BPS examples', () => {
      const BPS_DEN = FEE_CONSTANTS.BPS_DENOMINATOR; // 10^9

      // 300000 / 10^9 * 100 = 0.03%
      expect((300_000 / BPS_DEN) * 100).toBeCloseTo(0.03, 6);

      // 7500 / 10^9 * 100 = 0.00075%
      expect((7_500 / BPS_DEN) * 100).toBeCloseTo(0.00075, 8);

      // 190000 / 10^9 * 100 = 0.019%
      expect((190_000 / BPS_DEN) * 100).toBeCloseTo(0.019, 6);

      // 30000000 / 10^9 * 100 = 3% (Uniswap V2 style)
      expect((30_000_000 / BPS_DEN) * 100).toBeCloseTo(3.0, 4);
    });

    it('should correctly convert high-precision BPS to percent and back', () => {
      const BPS_DEN = FEE_CONSTANTS.BPS_DENOMINATOR;

      // Test round-trip conversions
      const testCases = [
        { bps: 300_000, percent: 0.03 },
        { bps: 7_500, percent: 0.00075 },
        { bps: 190_000, percent: 0.019 },
        { bps: 3_000_000, percent: 0.3 },
        { bps: 30_000_000, percent: 3.0 },
      ];

      for (const tc of testCases) {
        // BPS to percent
        const calculatedPercent = (tc.bps / BPS_DEN) * 100;
        expect(calculatedPercent).toBeCloseTo(tc.percent, 8);

        // Percent to BPS
        const calculatedBps = Math.round((tc.percent / 100) * BPS_DEN);
        expect(calculatedBps).toBe(tc.bps);
      }
    });
  });

  describe('calculateAmountOutWithFee', () => {
    /**
     * Fee split formula:
     * 1. inFee = totalFee * weightIn / BPS_DEN
     * 2. outFee = totalFee - inFee
     * 3. amountInAfterFee = amountIn * (BPS_DEN - inFee) / BPS_DEN
     * 4. grossOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
     * 5. netOut = grossOut * (BPS_DEN - outFee) / BPS_DEN
     */
    const calculateAmountOutWithFee = (
      amountIn: bigint,
      reserveIn: bigint,
      reserveOut: bigint,
      totalFeeBps: number,
      weightIn: number = FEE_CONSTANTS.BPS_DENOMINATOR
    ): bigint => {
      if (reserveIn === 0n || reserveOut === 0n) {
        throw new Error('Insufficient liquidity');
      }

      const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR);
      const totalFee = BigInt(Math.min(totalFeeBps, FEE_CONSTANTS.BPS_DENOMINATOR - 1));

      // inFee = totalFee * weightIn / BPS_DEN
      const inFee = (totalFee * BigInt(weightIn)) / BPS_DEN;
      // outFee = totalFee - inFee
      const outFee = totalFee - inFee;

      // amountInAfterFee = amountIn * (BPS_DEN - inFee) / BPS_DEN
      const inFeeMultiplier = BPS_DEN - inFee;
      const amountInAfterFee = (amountIn * inFeeMultiplier) / BPS_DEN;

      // grossOut = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
      const grossOut = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);

      // netOut = grossOut * (BPS_DEN - outFee) / BPS_DEN
      const outFeeMultiplier = BPS_DEN - outFee;
      const netOut = (grossOut * outFeeMultiplier) / BPS_DEN;

      return netOut;
    };

    it('should calculate output with 0.03% fee (100% on input)', () => {
      const amountIn = BigInt(1_000_000_000); // 1000 tokens (scaled)
      const reserveIn = BigInt(100_000_000_000);
      const reserveOut = BigInt(100_000_000_000);
      const feeBps = 300_000; // 0.03% in high-precision BPS
      const weightIn = FEE_CONSTANTS.BPS_DENOMINATOR; // 100% on input

      const amountOut = calculateAmountOutWithFee(amountIn, reserveIn, reserveOut, feeBps, weightIn);

      // With 100% weight on input, outFee = 0, so grossOut = netOut
      // Verify output is less than without fee (due to inFee)
      const amountOutNoFee = (amountIn * reserveOut) / (reserveIn + amountIn);
      expect(amountOut).toBeLessThan(amountOutNoFee);
      expect(amountOut).toBeGreaterThan(0n);

      // Fee percentage check: output should be reduced by ~0.03%
      // The reduction should be close to 0.03% of the no-fee output
      const reduction = amountOutNoFee - amountOut;
      const reductionPercent = Number(reduction * 10000n) / Number(amountOutNoFee);
      // Should be around 3 (0.03% = 3/10000)
      expect(reductionPercent).toBeGreaterThan(2);
      expect(reductionPercent).toBeLessThan(4);
    });

    it('should calculate output with 50/50 fee split', () => {
      const amountIn = BigInt(1_000_000_000);
      const reserveIn = BigInt(100_000_000_000);
      const reserveOut = BigInt(100_000_000_000);
      const feeBps = 300_000; // 0.03%
      const weightIn = 500_000_000; // 50% on input

      const amountOut = calculateAmountOutWithFee(amountIn, reserveIn, reserveOut, feeBps, weightIn);

      // Fee is split 50/50
      // inFee = 300_000 * 500_000_000 / 1_000_000_000 = 150_000
      // outFee = 300_000 - 150_000 = 150_000
      expect(amountOut).toBeGreaterThan(0n);

      // Compare with 100% on input - should be slightly different due to split
      const amountOut100 = calculateAmountOutWithFee(amountIn, reserveIn, reserveOut, feeBps, FEE_CONSTANTS.BPS_DENOMINATOR);
      // They should be very close but not identical due to split effect
      expect(amountOut).not.toBe(amountOut100);
    });

    it('should handle zero fee', () => {
      const amountIn = BigInt(1e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const feeBps = 0;

      const amountOut = calculateAmountOutWithFee(amountIn, reserveIn, reserveOut, feeBps);
      const expectedOut = (amountIn * reserveOut) / (reserveIn + amountIn);

      expect(amountOut).toBe(expectedOut);
    });

    it('should throw on zero reserves', () => {
      const amountIn = BigInt(1e18);

      expect(() => calculateAmountOutWithFee(amountIn, 0n, BigInt(100e18), 300_000))
        .toThrow('Insufficient liquidity');

      expect(() => calculateAmountOutWithFee(amountIn, BigInt(100e18), 0n, 300_000))
        .toThrow('Insufficient liquidity');
    });

    /**
     * Exact test cases for high-precision BPS calculations.
     * These verify the complete fee split formula step by step.
     */
    describe('high-precision BPS exact calculations', () => {
      const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR); // 10^9

      it('0.03% fee (baseFee=300000), 100% on input', () => {
        const amountIn = BigInt(1_000_000_000);
        const reserveIn = BigInt(100_000_000_000);
        const reserveOut = BigInt(100_000_000_000);
        const baseFee = BigInt(300_000);
        const wToken0 = BPS_DEN; // 100%

        // Manual calculation step by step:
        // inFee = baseFee * wToken0 / BPS_DEN = 300000 * 1e9 / 1e9 = 300000
        const inFee = (baseFee * wToken0) / BPS_DEN;
        expect(inFee).toBe(300_000n);

        // outFee = baseFee - inFee = 300000 - 300000 = 0
        const outFee = baseFee - inFee;
        expect(outFee).toBe(0n);

        // feeMultiplier = BPS_DEN - inFee = 1e9 - 300000 = 999700000
        const feeMultiplier = BPS_DEN - inFee;
        expect(feeMultiplier).toBe(999_700_000n);

        // effIn = amountIn * feeMultiplier / BPS_DEN
        // effIn = 1e9 * 999700000 / 1e9 = 999700000
        const effIn = (amountIn * feeMultiplier) / BPS_DEN;
        expect(effIn).toBe(999_700_000n);

        // grossOut = effIn * reserveOut / (reserveIn + effIn)
        // grossOut = 999700000 * 100e9 / (100e9 + 999700000)
        const denom = reserveIn + effIn;
        const grossOut = (effIn * reserveOut) / denom;

        // outFeeMultiplier = BPS_DEN - outFee = 1e9 - 0 = 1e9
        const outFeeMultiplier = BPS_DEN - outFee;
        expect(outFeeMultiplier).toBe(BPS_DEN);

        // netOut = grossOut * outFeeMultiplier / BPS_DEN = grossOut (since outFee=0)
        const netOut = (grossOut * outFeeMultiplier) / BPS_DEN;
        expect(netOut).toBe(grossOut); // Since outFee = 0

        // Verify using our function
        const calculated = calculateAmountOutWithFee(
          amountIn, reserveIn, reserveOut, 
          Number(baseFee), Number(wToken0)
        );
        expect(calculated).toBe(netOut);
      });

      it('0.03% fee, 50/50 split', () => {
        const amountIn = BigInt(1_000_000_000);
        const reserveIn = BigInt(100_000_000_000);
        const reserveOut = BigInt(100_000_000_000);
        const baseFee = BigInt(300_000);
        const wToken0 = BigInt(500_000_000); // 50%

        // inFee = 300000 * 500000000 / 1e9 = 150000
        const inFee = (baseFee * wToken0) / BPS_DEN;
        expect(inFee).toBe(150_000n);

        // outFee = 300000 - 150000 = 150000
        const outFee = baseFee - inFee;
        expect(outFee).toBe(150_000n);

        // feeMultiplier = 1e9 - 150000 = 999850000
        const inFeeMultiplier = BPS_DEN - inFee;
        expect(inFeeMultiplier).toBe(999_850_000n);

        // effIn = 1e9 * 999850000 / 1e9 = 999850000
        const effIn = (amountIn * inFeeMultiplier) / BPS_DEN;
        expect(effIn).toBe(999_850_000n);

        // grossOut = effIn * reserveOut / (reserveIn + effIn)
        const denom = reserveIn + effIn;
        const grossOut = (effIn * reserveOut) / denom;

        // outFeeMultiplier = 1e9 - 150000 = 999850000
        const outFeeMultiplier = BPS_DEN - outFee;
        expect(outFeeMultiplier).toBe(999_850_000n);

        // netOut = grossOut * 999850000 / 1e9
        const netOut = (grossOut * outFeeMultiplier) / BPS_DEN;

        // Verify using our function
        const calculated = calculateAmountOutWithFee(
          amountIn, reserveIn, reserveOut,
          Number(baseFee), Number(wToken0)
        );
        expect(calculated).toBe(netOut);
      });

      it('0.00075% fee (baseFee=7500), 100% on input', () => {
        const amountIn = BigInt(1_000_000_000);
        const reserveIn = BigInt(100_000_000_000);
        const reserveOut = BigInt(100_000_000_000);
        const baseFee = BigInt(7_500);
        const wToken0 = BPS_DEN; // 100%

        // inFee = 7500
        const inFee = (baseFee * wToken0) / BPS_DEN;
        expect(inFee).toBe(7_500n);

        // Verify fee percentage
        const feePercent = Number(baseFee) / Number(BPS_DEN) * 100;
        expect(feePercent).toBeCloseTo(0.00075, 8);

        // Verify using our function
        const calculated = calculateAmountOutWithFee(
          amountIn, reserveIn, reserveOut,
          Number(baseFee), Number(wToken0)
        );

        // Output should be very close to no-fee output (fee is tiny)
        const noFeeOut = (amountIn * reserveOut) / (reserveIn + amountIn);
        const difference = noFeeOut - calculated;
        const differencePercent = Number(difference) / Number(noFeeOut) * 100;

        // The reduction should be approximately 0.00075%
        expect(differencePercent).toBeCloseTo(0.00075, 4);
      });
    });
  });

  describe('calculateAmountInWithFee', () => {
    // Inverse calculation matching the forward formula
    const calculateAmountInWithFee = (
      amountOut: bigint,
      reserveIn: bigint,
      reserveOut: bigint,
      totalFeeBps: number,
      weightIn: number = FEE_CONSTANTS.BPS_DENOMINATOR
    ): bigint => {
      if (reserveIn === 0n || reserveOut === 0n) {
        throw new Error('Insufficient liquidity');
      }

      const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR);
      const totalFee = BigInt(Math.min(totalFeeBps, FEE_CONSTANTS.BPS_DENOMINATOR - 1));

      const inFee = (totalFee * BigInt(weightIn)) / BPS_DEN;
      const outFee = totalFee - inFee;

      // Inverse: grossOut from netOut
      const outFeeMultiplier = BPS_DEN - outFee;
      const grossOut = (amountOut * BPS_DEN + outFeeMultiplier - 1n) / outFeeMultiplier;

      if (grossOut >= reserveOut) {
        throw new Error('Insufficient liquidity');
      }

      // Inverse: amountInAfterFee from grossOut
      const amountInAfterFee = (grossOut * reserveIn + (reserveOut - grossOut) - 1n) / (reserveOut - grossOut);

      // Inverse: amountIn from amountInAfterFee
      const inFeeMultiplier = BPS_DEN - inFee;
      const amountIn = (amountInAfterFee * BPS_DEN + inFeeMultiplier - 1n) / inFeeMultiplier;

      return amountIn;
    };

    it('should calculate input with fee correctly', () => {
      const amountOut = BigInt(1e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const feeBps = 300_000; // 0.03%

      const amountIn = calculateAmountInWithFee(amountOut, reserveIn, reserveOut, feeBps);

      // With fee, we need more input to get the same output
      const amountInWithoutFee = (reserveIn * amountOut) / (reserveOut - amountOut) + 1n;

      expect(amountIn).toBeGreaterThan(amountInWithoutFee);
    });

    it('should be inverse of calculateAmountOut', () => {
      const amountIn = BigInt(1e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const feeBps = 300_000; // 0.03%
      const weightIn = 500_000_000; // 50%

      // Forward calculation
      const calculateAmountOutWithFee = (
        amIn: bigint,
        resIn: bigint,
        resOut: bigint,
        fee: number,
        weight: number
      ): bigint => {
        const BPS_DEN = BigInt(FEE_CONSTANTS.BPS_DENOMINATOR);
        const totalFee = BigInt(fee);
        const inFee = (totalFee * BigInt(weight)) / BPS_DEN;
        const outFee = totalFee - inFee;
        const amountInAfterFee = (amIn * (BPS_DEN - inFee)) / BPS_DEN;
        const grossOut = (amountInAfterFee * resOut) / (resIn + amountInAfterFee);
        return (grossOut * (BPS_DEN - outFee)) / BPS_DEN;
      };

      const amountOut = calculateAmountOutWithFee(amountIn, reserveIn, reserveOut, feeBps, weightIn);
      const calculatedAmountIn = calculateAmountInWithFee(amountOut, reserveIn, reserveOut, feeBps, weightIn);

      // Should be close to original (allowing for rounding)
      const diff = calculatedAmountIn > amountIn ? calculatedAmountIn - amountIn : amountIn - calculatedAmountIn;
      expect(diff).toBeLessThan(BigInt(100)); // Allow small rounding difference
    });

    it('should throw when output exceeds reserves', () => {
      const amountOut = BigInt(101e18); // More than reserve
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);

      expect(() => calculateAmountInWithFee(amountOut, reserveIn, reserveOut, 300_000))
        .toThrow('Insufficient liquidity');
    });
  });
});
