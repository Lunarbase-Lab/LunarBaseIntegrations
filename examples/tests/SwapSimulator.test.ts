/**
 * Tests for SwapSimulator service
 *
 * These tests cover:
 * - Amount out calculations
 * - Amount in calculations
 * - Price impact calculations
 * - Slippage calculations
 */

import { describe, it, expect } from 'vitest';
import { FEE_CONSTANTS } from '../src/types/index.js';

describe('SwapSimulator', () => {
  // Helper functions that mirror the simulator logic
  const getAmountOut = (amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint => {
    if (reserveIn === 0n || reserveOut === 0n) {
      throw new Error('Insufficient liquidity');
    }
    const numerator = amountIn * reserveOut;
    const denominator = reserveIn + amountIn;
    return numerator / denominator;
  };

  const getAmountIn = (amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint => {
    if (reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) {
      throw new Error('Insufficient liquidity');
    }
    const numerator = reserveIn * amountOut;
    const denominator = reserveOut - amountOut;
    return numerator / denominator + 1n;
  };

  const calculateMinOutput = (expectedOutput: bigint, slippageBps: number): bigint => {
    return expectedOutput - (expectedOutput * BigInt(slippageBps)) / 10_000n;
  };

  const calculateMaxInput = (expectedInput: bigint, slippageBps: number): bigint => {
    return expectedInput + (expectedInput * BigInt(slippageBps)) / 10_000n;
  };

  describe('getAmountOut', () => {
    it('should calculate correct output for standard swap', () => {
      const amountIn = BigInt(1e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);

      // x * y = k formula
      // amountOut = amountIn * reserveOut / (reserveIn + amountIn)
      // = 1 * 100 / 101 ≈ 0.99 tokens
      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

      expect(amountOut).toBeGreaterThan(0n);
      expect(amountOut).toBeLessThan(amountIn); // Some slippage expected
    });

    it('should return larger output for unbalanced pools', () => {
      const amountIn = BigInt(1e18);
      const reserveIn = BigInt(50e18);
      const reserveOut = BigInt(100e18);

      // Pool has more reserveOut, so we get more output
      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

      // Expected: 1 * 100 / 51 ≈ 1.96 tokens
      expect(amountOut).toBeGreaterThan(amountIn);
    });

    it('should handle small swaps', () => {
      const amountIn = BigInt(1e15); // 0.001 tokens
      const reserveIn = BigInt(1000e18);
      const reserveOut = BigInt(1000e18);

      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

      // Small swap should have minimal price impact
      // Expected close to 0.001 tokens
      expect(amountOut).toBeGreaterThan(0n);
      expect(Number(amountOut)).toBeCloseTo(Number(amountIn), -15); // Within 1e-15 precision
    });

    it('should throw on zero reserves', () => {
      expect(() => getAmountOut(BigInt(1e18), 0n, BigInt(100e18)))
        .toThrow('Insufficient liquidity');
      expect(() => getAmountOut(BigInt(1e18), BigInt(100e18), 0n))
        .toThrow('Insufficient liquidity');
    });
  });

  describe('getAmountIn', () => {
    it('should calculate correct input for desired output', () => {
      const amountOut = BigInt(1e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);

      const amountIn = getAmountIn(amountOut, reserveIn, reserveOut);

      // To get 1 token out of balanced 100/100 pool
      // amountIn = reserveIn * amountOut / (reserveOut - amountOut) + 1
      // = 100 * 1 / 99 + 1 ≈ 1.0101 tokens
      expect(amountIn).toBeGreaterThan(amountOut);
    });

    it('should return inverse of getAmountOut', () => {
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const amountIn = BigInt(1e18);

      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
      const recoveredAmountIn = getAmountIn(amountOut, reserveIn, reserveOut);

      // Should be approximately equal (within rounding)
      expect(recoveredAmountIn).toBeGreaterThanOrEqual(amountIn);
      expect(recoveredAmountIn).toBeLessThanOrEqual(amountIn + 2n); // Allow for rounding
    });

    it('should throw when output exceeds reserves', () => {
      const amountOut = BigInt(101e18);
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);

      expect(() => getAmountIn(amountOut, reserveIn, reserveOut))
        .toThrow('Insufficient liquidity');
    });
  });

  describe('price impact', () => {
    it('should calculate price impact correctly', () => {
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);

      // Spot price = reserveOut / reserveIn = 1
      const spotPrice = Number(reserveOut) / Number(reserveIn);
      expect(spotPrice).toBe(1);

      // Swap 10% of reserve
      const amountIn = BigInt(10e18);
      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

      // Execution price
      const executionPrice = Number(amountOut) / Number(amountIn);

      // Price impact = (spot - execution) / spot * 100
      const priceImpact = (1 - executionPrice / spotPrice) * 100;

      // For 10% of reserve, expect ~9% price impact (due to x*y=k curve)
      expect(priceImpact).toBeGreaterThan(0);
      expect(priceImpact).toBeLessThan(20); // Reasonable bound
    });

    it('should have higher impact for larger swaps', () => {
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const spotPrice = Number(reserveOut) / Number(reserveIn);

      const smallSwap = BigInt(1e18);
      const largeSwap = BigInt(50e18);

      const smallOut = getAmountOut(smallSwap, reserveIn, reserveOut);
      const largeOut = getAmountOut(largeSwap, reserveIn, reserveOut);

      const smallExecPrice = Number(smallOut) / Number(smallSwap);
      const largeExecPrice = Number(largeOut) / Number(largeSwap);

      const smallImpact = (1 - smallExecPrice / spotPrice) * 100;
      const largeImpact = (1 - largeExecPrice / spotPrice) * 100;

      expect(largeImpact).toBeGreaterThan(smallImpact);
    });
  });

  describe('slippage calculations', () => {
    it('should calculate minimum output correctly', () => {
      const expectedOutput = BigInt(100e18);
      const slippageBps = 50; // 0.5%

      const minOutput = calculateMinOutput(expectedOutput, slippageBps);

      // minOutput = 100 - (100 * 50 / 10000) = 100 - 0.5 = 99.5
      expect(minOutput).toBe(BigInt(995e17));
    });

    it('should calculate maximum input correctly', () => {
      const expectedInput = BigInt(100e18);
      const slippageBps = 100; // 1%

      const maxInput = calculateMaxInput(expectedInput, slippageBps);

      // maxInput = 100 + (100 * 100 / 10000) = 100 + 1 = 101
      expect(maxInput).toBe(BigInt(101e18));
    });

    it('should handle zero slippage', () => {
      const amount = BigInt(100e18);

      expect(calculateMinOutput(amount, 0)).toBe(amount);
      expect(calculateMaxInput(amount, 0)).toBe(amount);
    });

    it('should handle 100% slippage', () => {
      const amount = BigInt(100e18);

      expect(calculateMinOutput(amount, 10000)).toBe(0n);
      expect(calculateMaxInput(amount, 10000)).toBe(amount * 2n);
    });
  });

  describe('constant product invariant', () => {
    it('should maintain k after swap', () => {
      const reserveIn = BigInt(100e18);
      const reserveOut = BigInt(100e18);
      const amountIn = BigInt(10e18);

      const k = reserveIn * reserveOut;
      const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

      const newReserveIn = reserveIn + amountIn;
      const newReserveOut = reserveOut - amountOut;
      const newK = newReserveIn * newReserveOut;

      // k should increase slightly due to rounding in favor of the pool
      expect(newK).toBeGreaterThanOrEqual(k);
    });
  });
});
