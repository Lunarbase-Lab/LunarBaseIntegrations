/**
 * Contract addresses imported from the repository JSON files.
 * Source: mainnet/addresses.json and testnet/addresses.json
 */

// Import addresses from repository JSON files
import mainnetAddressesJson from '../../../mainnet/addresses.json' with { type: 'json' };
import testnetAddressesJson from '../../../testnet/addresses.json' with { type: 'json' };

/**
 * Contract addresses for mainnet deployment on Base network.
 */
export const MAINNET_ADDRESSES = {
  /** Factory contract - deploys new pools */
  factory: mainnetAddressesJson.LunarFactory,
  /** Router contract - executes swaps */
  router: mainnetAddressesJson.LunarRouter,
  /** Quoter contract - quotes swap amounts */
  quoter: mainnetAddressesJson.LunarQuoter,
  /** LP Fee Manager - manages LP fee distribution */
  lpFeeManager: mainnetAddressesJson.LunarLpFeeManager,
  /** Liquidity Locker - locks LP tokens */
  locker: mainnetAddressesJson.LunarLocker,
  /** Core Module - handles fee calculation and pool registration */
  coreModule: mainnetAddressesJson.LunarCoreModule,
  /** Permissions Registry - manages swap permissions */
  permissionsRegistry: mainnetAddressesJson.LunarPermissionsRegistry,
} as const;

/**
 * Contract addresses for testnet deployment (Base Sepolia).
 */
export const TESTNET_ADDRESSES = {
  factory: testnetAddressesJson.factory,
  router: testnetAddressesJson.router,
  quoter: testnetAddressesJson.quoter,
  lpFeeManager: testnetAddressesJson.lpFeeManager,
  coreModule: testnetAddressesJson.coreModule,
  permissionsRegistry: testnetAddressesJson.permissionsRegistry,
  locker: testnetAddressesJson.liquidityLocker,
} as const;

export type NetworkAddresses = typeof MAINNET_ADDRESSES;
