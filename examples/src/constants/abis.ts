/**
 * Contract ABIs imported from the repository.
 * Source: mainnet/abi/ directory
 *
 * Full ABIs are used directly from the JSON files to ensure consistency
 * with the deployed contracts.
 */

// Import ABIs from repository JSON files
import factoryAbi from '../../../mainnet/abi/LunarFactory.json' with { type: 'json' };
import poolAbi from '../../../mainnet/abi/LunarPool.json' with { type: 'json' };
import coreModuleAbi from '../../../mainnet/abi/LunarCoreModule.json' with { type: 'json' };
import quoterAbi from '../../../mainnet/abi/LunarQuoter.json' with { type: 'json' };

// Type for ABI entries
type AbiItem = {
  type: string;
  name?: string;
  inputs?: readonly { name: string; type: string; indexed?: boolean; internalType?: string; components?: readonly { name: string; type: string; internalType?: string }[] }[];
  outputs?: readonly { name: string; type: string; internalType?: string; components?: readonly { name: string; type: string; internalType?: string }[] }[];
  stateMutability?: string;
  anonymous?: boolean;
};

/**
 * Factory ABI - for pool discovery and creation.
 * Source: mainnet/abi/LunarFactory.json
 */
export const FACTORY_ABI = factoryAbi as AbiItem[];

/**
 * Pool ABI - for pool state and swap operations.
 * Source: mainnet/abi/LunarPool.json
 */
export const POOL_ABI = poolAbi as AbiItem[];

/**
 * Core Module ABI - for fee configuration and calculation.
 * Source: mainnet/abi/LunarCoreModule.json
 */
export const CORE_MODULE_ABI = coreModuleAbi as AbiItem[];

/**
 * Quoter ABI - for quoting swap amounts.
 * Source: mainnet/abi/LunarQuoter.json
 */
export const QUOTER_ABI = quoterAbi as AbiItem[];

/**
 * ERC20 ABI - minimal interface for token interactions.
 * This is a standard interface, not specific to the protocol.
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
