/**
 * Example 01: Pool Discovery
 *
 * Demonstrates how to:
 * - Listen for PairCreated events via RPC
 * - Scan historical pool creations
 * - Watch for new pools in real-time
 * - Build a list of all pools with their configurations
 *
 * Usage:
 *   npx tsx scripts/01-discover-pools.ts
 *
 * Configuration:
 *   Set RPC_URL in .env file (default: http://46.4.31.28:8080)
 *   Optionally set START_BLOCK to specify scan start block
 */

import 'dotenv/config';
import { Provider } from '../src/core/Provider.js';
import { PoolDiscovery } from '../src/services/PoolDiscovery.js';
import { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from '../src/constants/addresses.js';
import { FEE_CONSTANTS } from '../src/types/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Pool Discovery Example');
  console.log('='.repeat(60));

  // Initialize provider
  const network = (process.env.NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  const rpcUrl = network === 'testnet'
    ? (process.env.RPC_URL_TESTNET ?? 'https://base-sepolia-rpc.publicnode.com')
    : (process.env.RPC_URL_MAINNET ?? 'https://base-rpc.publicnode.com');

  console.log(`\nConnecting to Base ${network}: ${rpcUrl}`);

  const provider = new Provider({ rpcUrl, network });
  const client = provider.getClient();

  // Check connection
  const isHealthy = await provider.isHealthy();
  if (!isHealthy) {
    console.error('Failed to connect to RPC endpoint');
    process.exit(1);
  }

  const blockNumber = await provider.getBlockNumber();
  console.log(`Current block: ${blockNumber}`);

  // Create pool discovery service
  const addresses = network === 'testnet' ? TESTNET_ADDRESSES : MAINNET_ADDRESSES;
  const discovery = new PoolDiscovery(client, addresses.factory as `0x${string}`);

  // Get total pool count from factory
  const totalPools = await discovery.getTotalPoolCount();
  console.log(`\nTotal pools on factory: ${totalPools}`);

  // Scan historical pools
  console.log('\n--- Historical Pool Scan ---');

  const startBlock = process.env.START_BLOCK
    ? BigInt(process.env.START_BLOCK)
    : blockNumber > 10000n
      ? blockNumber - 10000n
      : 0n;

  console.log(`Scanning from block ${startBlock} to ${blockNumber}...`);

  const pools = await discovery.scanPoolsExtended({ fromBlock: startBlock });
  console.log(`Found ${pools.length} pools`);

  // Display pool details
  if (pools.length > 0) {
    console.log('\nDiscovered Pools:');
    console.log('-'.repeat(60));

    for (const pool of pools.slice(0, 10)) {
      // Show first 10
      const feePercent = (pool.baseFeeConfig.baseFee / FEE_CONSTANTS.BPS_DENOMINATOR) * 100;
      console.log(`
Pool #${pool.pairIndex}
  Address: ${pool.address}
  Token0: ${pool.token0Symbol ?? 'Unknown'} (${pool.token0})
  Token1: ${pool.token1Symbol ?? 'Unknown'} (${pool.token1})
  Base Fee: ${feePercent.toFixed(4)}%
  Module Mask: ${pool.moduleMask}
  Created at block: ${pool.blockNumber}`);
    }

    if (pools.length > 10) {
      console.log(`\n... and ${pools.length - 10} more pools`);
    }
  }

  // Show statistics
  const stats = discovery.getStats();
  console.log('\n--- Statistics ---');
  console.log(`Total pools found: ${stats.totalPools}`);
  console.log(`Unique tokens: ${stats.uniqueTokens}`);
  console.log('\nPools by fee tier:');
  for (const [fee, count] of Object.entries(stats.poolsByFeeTier)) {
    const feePercent = (Number(fee) / FEE_CONSTANTS.BPS_DENOMINATOR) * 100;
    console.log(`  ${feePercent.toFixed(4)}%: ${count} pools`);
  }

  // Real-time pool watching example
  console.log('\n--- Real-time Watching ---');
  console.log('Starting to watch for new pools...');
  console.log('(Press Ctrl+C to stop)\n');

  const unwatch = discovery.watchNewPools((pool) => {
    console.log(`[NEW POOL] ${pool.address}`);
    console.log(`  Token0: ${pool.token0}`);
    console.log(`  Token1: ${pool.token1}`);
    console.log(`  Block: ${pool.blockNumber}`);
    console.log('');
  });

  // Keep process running for watching
  // In a real application, you would integrate this with your event loop
  await new Promise<void>((resolve) => {
    // Stop after 30 seconds for demo purposes
    setTimeout(() => {
      unwatch();
      console.log('Stopped watching for new pools.');
      resolve();
    }, 30_000);
  });

  console.log('\nPool discovery example completed.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
