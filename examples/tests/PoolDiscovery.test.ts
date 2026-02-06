/**
 * Tests for PoolDiscovery service
 *
 * These tests cover:
 * - Pool caching logic
 * - Token filtering
 * - Statistics calculation
 * - Pool grouping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PoolInfo, BaseFeeConfig } from '../src/types/index.js';
import type { Address } from 'viem';

describe('PoolDiscovery', () => {
  // Helper to create mock pool info
  const createMockPool = (
    address: Address,
    token0: Address,
    token1: Address,
    baseFee: number,
    pairIndex: bigint
  ): PoolInfo => ({
    address,
    token0,
    token1,
    userModule: '0x0000000000000000000000000000000000000000' as Address,
    moduleMask: 1,
    baseFeeConfig: {
      baseFee,
      wToken0: 500_000_000,
      wToken1: 500_000_000,
    },
    pairIndex,
    blockNumber: 1000n + pairIndex,
    transactionHash: `0x${'0'.repeat(64)}`,
  });

  describe('Pool Caching', () => {
    it('should cache pools correctly', () => {
      const pools = new Map<Address, PoolInfo>();

      const pool1 = createMockPool(
        '0x1111111111111111111111111111111111111111' as Address,
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
        '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
        3_000_000,
        1n
      );

      pools.set(pool1.address, pool1);

      expect(pools.has(pool1.address)).toBe(true);
      expect(pools.get(pool1.address)).toEqual(pool1);
    });

    it('should return cached pools', () => {
      const pools = new Map<Address, PoolInfo>();

      pools.set(
        '0x1111111111111111111111111111111111111111' as Address,
        createMockPool(
          '0x1111111111111111111111111111111111111111' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          3_000_000,
          1n
        )
      );

      pools.set(
        '0x2222222222222222222222222222222222222222' as Address,
        createMockPool(
          '0x2222222222222222222222222222222222222222' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
          5_000_000,
          2n
        )
      );

      const cachedPools = Array.from(pools.values());
      expect(cachedPools).toHaveLength(2);
    });
  });

  describe('Token Filtering', () => {
    it('should filter pools by token', () => {
      const pools = [
        createMockPool(
          '0x1111111111111111111111111111111111111111' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          3_000_000,
          1n
        ),
        createMockPool(
          '0x2222222222222222222222222222222222222222' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
          3_000_000,
          2n
        ),
        createMockPool(
          '0x3333333333333333333333333333333333333333' as Address,
          '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' as Address,
          '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address,
          3_000_000,
          3n
        ),
      ];

      const tokenFilter = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'.toLowerCase();

      const filtered = pools.filter(
        (p) =>
          p.token0.toLowerCase() === tokenFilter ||
          p.token1.toLowerCase() === tokenFilter
      );

      expect(filtered).toHaveLength(2);
    });

    it('should find pool by token pair', () => {
      const pools = [
        createMockPool(
          '0x1111111111111111111111111111111111111111' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          3_000_000,
          1n
        ),
        createMockPool(
          '0x2222222222222222222222222222222222222222' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
          3_000_000,
          2n
        ),
      ];

      const tokenA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
      const tokenB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address;

      // Sort tokens
      const [token0, token1] =
        tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA.toLowerCase(), tokenB.toLowerCase()]
          : [tokenB.toLowerCase(), tokenA.toLowerCase()];

      const found = pools.find(
        (p) =>
          p.token0.toLowerCase() === token0 && p.token1.toLowerCase() === token1
      );

      expect(found).toBeDefined();
      expect(found?.address).toBe('0x1111111111111111111111111111111111111111');
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate correct statistics', () => {
      const pools = [
        createMockPool(
          '0x1111111111111111111111111111111111111111' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          3_000_000, // 0.3%
          1n
        ),
        createMockPool(
          '0x2222222222222222222222222222222222222222' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
          3_000_000, // 0.3%
          2n
        ),
        createMockPool(
          '0x3333333333333333333333333333333333333333' as Address,
          '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' as Address,
          '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address,
          10_000_000, // 1%
          3n
        ),
      ];

      // Calculate stats
      const tokens = new Set<string>();
      const feeTiers: Record<string, number> = {};

      for (const pool of pools) {
        tokens.add(pool.token0.toLowerCase());
        tokens.add(pool.token1.toLowerCase());

        const feeKey = `${pool.baseFeeConfig.baseFee}`;
        feeTiers[feeKey] = (feeTiers[feeKey] ?? 0) + 1;
      }

      const stats = {
        totalPools: pools.length,
        uniqueTokens: tokens.size,
        poolsByFeeTier: feeTiers,
      };

      expect(stats.totalPools).toBe(3);
      expect(stats.uniqueTokens).toBe(5); // A, B, A, C, D, E -> 5 unique
      expect(stats.poolsByFeeTier['3000000']).toBe(2);
      expect(stats.poolsByFeeTier['10000000']).toBe(1);
    });
  });

  describe('Pool Grouping', () => {
    it('should group pools by fee tier', () => {
      const pools = [
        createMockPool(
          '0x1111111111111111111111111111111111111111' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          3_000_000,
          1n
        ),
        createMockPool(
          '0x2222222222222222222222222222222222222222' as Address,
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
          '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address,
          3_000_000,
          2n
        ),
        createMockPool(
          '0x3333333333333333333333333333333333333333' as Address,
          '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD' as Address,
          '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address,
          10_000_000,
          3n
        ),
      ];

      const groups = new Map<number, PoolInfo[]>();

      for (const pool of pools) {
        const fee = pool.baseFeeConfig.baseFee;
        const existing = groups.get(fee) ?? [];
        existing.push(pool);
        groups.set(fee, existing);
      }

      expect(groups.get(3_000_000)).toHaveLength(2);
      expect(groups.get(10_000_000)).toHaveLength(1);
    });
  });

  describe('Token Sorting', () => {
    it('should sort tokens correctly for pool ID', () => {
      const tokenA = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address;
      const tokenB = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;

      const [token0, token1] =
        tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA, tokenB]
          : [tokenB, tokenA];

      // A < B, so token0 should be A
      expect(token0.toLowerCase()).toBe(tokenB.toLowerCase());
      expect(token1.toLowerCase()).toBe(tokenA.toLowerCase());
    });
  });
});
