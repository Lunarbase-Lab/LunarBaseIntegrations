/**
 * DEX Integration Examples
 *
 * A TypeScript SDK for interacting with the DEX protocol on Base network.
 * Provides tools for pool discovery, fee calculation, swap simulation, and dynamic fee tracking.
 *
 * @example
 * ```typescript
 * import { Provider, PoolDiscovery, FeeCalculator, SwapSimulator } from 'dex-integration-examples';
 *
 * // Initialize provider
 * const provider = new Provider({ rpcUrl: process.env.RPC_URL });
 *
 * // Discover pools
 * const discovery = new PoolDiscovery(provider.getClient(), FACTORY_ADDRESS);
 * const pools = await discovery.scanPools({ fromBlock: 1000000n });
 *
 * // Calculate fees
 * const calculator = new FeeCalculator(provider.getClient(), CORE_MODULE_ADDRESS);
 * const fees = await calculator.getPoolFees(poolAddress);
 *
 * // Simulate swap
 * const simulator = new SwapSimulator(provider.getClient(), QUOTER_ADDRESS, CORE_MODULE_ADDRESS);
 * const result = await simulator.simulateExactInput(poolAddress, params);
 * ```
 */

// Core exports
export { Provider, base, baseSepolia } from './core/Provider.js';
export type { ProviderConfig, NetworkType } from './core/Provider.js';
export { PoolContract } from './core/PoolContract.js';
export { FactoryContract } from './core/FactoryContract.js';
export { CoreModuleContract } from './core/CoreModuleContract.js';

// Service exports
export { PoolDiscovery } from './services/PoolDiscovery.js';
export { FeeCalculator } from './services/FeeCalculator.js';
export { SwapSimulator } from './services/SwapSimulator.js';
export { DynamicFeeCalculator } from './services/DynamicFeeCalculator.js';

// Constants exports
export { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from './constants/addresses.js';
export type { NetworkAddresses } from './constants/addresses.js';
export {
  FACTORY_ABI,
  POOL_ABI,
  CORE_MODULE_ABI,
  QUOTER_ABI,
  ERC20_ABI,
} from './constants/abis.js';

// Type exports
export type {
  BaseFeeConfig,
  DynamicFeeConfig,
  DynamicFeeState,
  FeeQuote,
  PoolInfo,
  PoolInfoExtended,
  PoolState,
  SwapContext,
  SwapSimulationResult,
  ExactInputParams,
  ExactOutputParams,
  PairCreatedEvent,
  DynamicFeeUpdatedEvent,
  SwapEvent,
  PoolDiscoveryOptions,
  FeeCalculationResult,
} from './types/index.js';

export { FEE_CONSTANTS, MODULE_FLAGS } from './types/index.js';
