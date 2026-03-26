import type { Address, PublicClient } from 'viem';
import { POOL_ABI } from '../constants/abis.js';
import type { PoolState } from '../types/index.js';

/**
 * Wrapper for pool contract interactions.
 * Provides type-safe methods for reading pool state.
 */
export class PoolContract {
  private readonly client: PublicClient;
  private readonly address: Address;

  /**
   * Creates a new PoolContract instance.
   *
   * @param client - Viem public client
   * @param address - Pool contract address
   */
  constructor(client: PublicClient, address: Address) {
    this.client = client;
    this.address = address;
  }

  /**
   * Gets the pool contract address.
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Gets token0 address.
   */
  async getToken0(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'token0',
    }) as Promise<Address>;
  }

  /**
   * Gets token1 address.
   */
  async getToken1(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'token1',
    }) as Promise<Address>;
  }

  /**
   * Gets both token addresses.
   */
  async getTokens(): Promise<[Address, Address]> {
    const [token0, token1] = await Promise.all([
      this.getToken0(),
      this.getToken1(),
    ]);
    return [token0, token1];
  }

  /**
   * Gets the current reserves.
   *
   * @returns Tuple of [reserve0, reserve1]
   */
  async getReserves(): Promise<[bigint, bigint]> {
    const result = await this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'getReserves',
    });
    return result as [bigint, bigint];
  }

  /**
   * Gets the current LP fee buckets.
   *
   * @returns Tuple of [fees0, fees1]
   */
  async getFees(): Promise<[bigint, bigint]> {
    const [fees0, fees1] = await Promise.all([
      this.client.readContract({
        address: this.address,
        abi: POOL_ABI,
        functionName: 'fees0',
      }),
      this.client.readContract({
        address: this.address,
        abi: POOL_ABI,
        functionName: 'fees1',
      }),
    ]);
    return [fees0 as bigint, fees1 as bigint];
  }

  /**
   * Gets the total LP token supply.
   */
  async getTotalSupply(): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'totalSupply',
    }) as Promise<bigint>;
  }

  /**
   * Gets the LP token balance for an address.
   *
   * @param account - Address to check balance for
   */
  async getBalance(account: Address): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'balanceOf',
      args: [account],
    }) as Promise<bigint>;
  }

  /**
   * Gets the core module address.
   */
  async getCoreModule(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'coreModule',
    }) as Promise<Address>;
  }

  /**
   * Gets the user module address.
   */
  async getUserModule(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'userModule',
    }) as Promise<Address>;
  }

  /**
   * Gets the module mask (bit flags).
   */
  async getModuleMask(): Promise<number> {
    return this.client.readContract({
      address: this.address,
      abi: POOL_ABI,
      functionName: 'moduleMask',
    }) as Promise<number>;
  }

  /**
   * Gets the complete pool state.
   */
  async getState(): Promise<PoolState> {
    const [[reserve0, reserve1], [fees0, fees1], totalSupply] = await Promise.all([
      this.getReserves(),
      this.getFees(),
      this.getTotalSupply(),
    ]);

    return {
      reserve0,
      reserve1,
      fees0,
      fees1,
      totalSupply,
    };
  }

  /**
   * Checks if the pool has liquidity.
   */
  async hasLiquidity(): Promise<boolean> {
    const [reserve0, reserve1] = await this.getReserves();
    return reserve0 > 0n && reserve1 > 0n;
  }

  /**
   * Calculates the spot price of token1 in terms of token0.
   * Price = reserve1 / reserve0
   *
   * @param decimals0 - Decimals of token0 (for precision)
   * @param decimals1 - Decimals of token1 (for precision)
   * @returns Price as a number
   */
  async getSpotPrice(decimals0 = 18, decimals1 = 18): Promise<number> {
    const [reserve0, reserve1] = await this.getReserves();
    if (reserve0 === 0n) return 0;

    // Adjust for decimal difference
    const decimalAdjustment = 10 ** (decimals1 - decimals0);
    return (Number(reserve1) / Number(reserve0)) * decimalAdjustment;
  }
}
