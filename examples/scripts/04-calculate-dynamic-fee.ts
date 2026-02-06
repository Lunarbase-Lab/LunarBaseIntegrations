/**
 * Example 04: Calculate Dynamic Fee
 *
 * Demonstrates how to:
 * - Read dynamic fee configuration from the core module
 * - Get the current dynamic fee state from events
 * - Calculate dynamic fee decay over time
 * - Simulate how swaps affect the dynamic fee
 * - Track dynamic fee changes in real-time
 *
 * The dynamic fee mechanism:
 * - Activity increases with each swap based on swap size relative to reserves
 * - Activity decays exponentially over time based on halfLife parameter
 * - Dynamic fee = min(activity_scaled, maxCapBps)
 *
 * Usage:
 *   npx tsx scripts/04-calculate-dynamic-fee.ts [POOL_ADDRESS]
 */

import 'dotenv/config';
import { Provider } from '../src/core/Provider.js';
import { PoolDiscovery } from '../src/services/PoolDiscovery.js';
import { DynamicFeeCalculator } from '../src/services/DynamicFeeCalculator.js';
import { FeeCalculator } from '../src/services/FeeCalculator.js';
import { PoolContract } from '../src/core/PoolContract.js';
import { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from '../src/constants/addresses.js';
import { FEE_CONSTANTS } from '../src/types/index.js';
import type { Address } from 'viem';

async function main() {
  console.log('='.repeat(60));
  console.log('Dynamic Fee Calculation Example');
  console.log('='.repeat(60));

  // Initialize provider
  const network = (process.env.NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  const rpcUrl = network === 'testnet'
    ? (process.env.RPC_URL_TESTNET ?? 'https://base-sepolia-rpc.publicnode.com')
    : (process.env.RPC_URL_MAINNET ?? 'https://base-rpc.publicnode.com');

  const provider = new Provider({ rpcUrl, network });
  const client = provider.getClient();
  const addresses = network === 'testnet' ? TESTNET_ADDRESSES : MAINNET_ADDRESSES;

  console.log(`\nConnected to Base ${network}: ${rpcUrl}`);

  // Get pool address
  let poolAddress: Address;

  if (process.argv[2]) {
    poolAddress = process.argv[2] as Address;
    console.log(`Using provided pool: ${poolAddress}`);
  } else {
    console.log('\nNo pool address provided, discovering pools...');

    const discovery = new PoolDiscovery(client, addresses.factory as `0x${string}`);
    const blockNumber = await provider.getBlockNumber();
    const pools = await discovery.scanPools({
      fromBlock: blockNumber > 50000n ? blockNumber - 50000n : 0n,
    });

    if (pools.length === 0) {
      console.log('No pools found. Please provide a pool address.');
      process.exit(1);
    }

    poolAddress = pools[0].address;
    console.log(`Using first discovered pool: ${poolAddress}`);
  }

  // Create calculators
  const dynamicFeeCalc = new DynamicFeeCalculator(client, addresses.coreModule as `0x${string}`);
  const feeCalc = new FeeCalculator(client, addresses.coreModule as `0x${string}`);

  // Get pool contract for reserve info
  const pool = new PoolContract(client, poolAddress);

  console.log('\n--- Pool Information ---');
  console.log(`Pool Address: ${poolAddress}`);

  // Get dynamic fee configuration
  console.log('\n--- Dynamic Fee Configuration ---');
  const config = await dynamicFeeCalc.getDynamicConfig(poolAddress);

  console.log(`Enabled: ${config.enabled}`);
  console.log(`Max Cap: ${config.maxCapBps} bps (${feeCalc.feeToPercent(config.maxCapBps).toFixed(4)}%)`);
  console.log(`Half Life: ${config.halfLife} seconds (${(config.halfLife / 60).toFixed(1)} minutes)`);

  if (!config.enabled) {
    console.log('\nDynamic fees are disabled for this pool.');
    console.log('The pool uses only the base fee configuration.');

    const baseFeeConfig = await feeCalc.getBaseFeeConfig(poolAddress);
    console.log(`\nBase Fee: ${feeCalc.feeToPercent(baseFeeConfig.baseFee).toFixed(4)}%`);
    process.exit(0);
  }

  // Get latest dynamic fee event
  console.log('\n--- Current Dynamic Fee State ---');
  const state = await dynamicFeeCalc.getLatestDynamicFeeEvent(poolAddress);

  if (!state) {
    console.log('No dynamic fee events found for this pool.');
    console.log('The pool might be new or dynamic fees recently enabled.');
    console.log('\nAssuming initial state with zero activity...');
  } else {
    const formattedInfo = dynamicFeeCalc.formatDynamicFeeInfo(state, config);
    console.log(`Current Dynamic Fee: ${formattedInfo.currentDynPercent}`);
    console.log(`Activity: ${state.activity}`);
    console.log(`Last Update: ${formattedInfo.lastUpdateAgo}`);

    // Calculate current decayed fee
    console.log('\n--- Decay Calculation ---');
    const currentDynFee = await dynamicFeeCalc.getCurrentDynamicFee(poolAddress);
    console.log(`Current fee (with decay): ${feeCalc.feeToPercent(currentDynFee).toFixed(4)}%`);

    if (currentDynFee < state.dynBps) {
      console.log(`Fee has decayed from ${state.dynBps} to ${currentDynFee} bps`);
    }
  }

  // Simulate swap impact on dynamic fee
  console.log('\n--- Swap Impact Simulation ---');

  const [reserve0, reserve1] = await pool.getReserves();
  if (reserve0 === 0n || reserve1 === 0n) {
    console.log('Pool has no liquidity. Cannot simulate swap impact.');
    process.exit(1);
  }

  console.log(`Current reserves: ${reserve0} / ${reserve1}`);

  // Get current timestamp
  const block = await client.getBlock();
  const currentTimestamp = Number(block.timestamp);

  // Initialize state if not found
  const currentState = state ?? {
    dynBps: 0,
    activity: 0n,
    lastUpdate: currentTimestamp,
  };

  // Simulate different swap sizes
  const swapSizes = [0.1, 0.5, 1, 5, 10]; // Percentage of reserve
  console.log('\nSimulating swaps of different sizes:');
  console.log('-'.repeat(60));

  for (const sizePercent of swapSizes) {
    const amountOut = (reserve1 * BigInt(Math.floor(sizePercent * 10))) / 1000n;

    const simulation = dynamicFeeCalc.simulateFeeAfterSwap(
      currentState,
      config,
      amountOut,
      reserve1,
      currentTimestamp
    );

    console.log(
      `Swap ${sizePercent}% of reserve1:` +
      `\n  Pulse: ${simulation.pulse}` +
      `\n  New Activity: ${simulation.newActivity}` +
      `\n  New Dynamic Fee: ${simulation.newDynBps} bps (${feeCalc.feeToPercent(simulation.newDynBps).toFixed(4)}%)`
    );
  }

  // Decay projection
  console.log('\n--- Decay Projection ---');
  console.log('Assuming current fee, time until decay to various levels:');

  const currentFee = state?.dynBps ?? 0;
  if (currentFee > 0) {
    const targetFees = [
      Math.floor(currentFee * 0.5), // 50% of current
      Math.floor(currentFee * 0.25), // 25% of current
      Math.floor(currentFee * 0.1), // 10% of current
      1, // Nearly zero
    ];

    for (const target of targetFees) {
      if (target > 0 && target < currentFee) {
        const decayTime = dynamicFeeCalc.estimateDecayTime(currentFee, target, config.halfLife);
        console.log(
          `To ${target} bps (${feeCalc.feeToPercent(target).toFixed(4)}%): ` +
          `${decayTime} seconds (${(decayTime / 60).toFixed(1)} minutes)`
        );
      }
    }
  } else {
    console.log('Current fee is already at minimum.');
  }

  // Combined fee calculation
  console.log('\n--- Combined Fee (Base + Dynamic) ---');
  const baseFeeConfig = await feeCalc.getBaseFeeConfig(poolAddress);
  const effectiveBaseFee = feeCalc.calculateEffectiveBaseFee(baseFeeConfig, true);
  const currentDynamicFee = await dynamicFeeCalc.getCurrentDynamicFee(poolAddress);
  const totalFee = effectiveBaseFee + currentDynamicFee;

  console.log(`Base Fee (effective): ${feeCalc.feeToPercent(effectiveBaseFee).toFixed(4)}%`);
  console.log(`Dynamic Fee (current): ${feeCalc.feeToPercent(currentDynamicFee).toFixed(4)}%`);
  console.log(`Total Fee: ${feeCalc.feeToPercent(totalFee).toFixed(4)}%`);

  // Protocol share breakdown
  const protocolShareBps = await feeCalc.getProtocolShareBps();
  const protocolFee = Math.floor((totalFee * protocolShareBps) / 10_000);
  const lpFee = totalFee - protocolFee;

  console.log(`\nFee Distribution:`);
  console.log(`  Protocol: ${feeCalc.feeToPercent(protocolFee).toFixed(4)}% (${(protocolShareBps / 100).toFixed(2)}% share)`);
  console.log(`  LPs: ${feeCalc.feeToPercent(lpFee).toFixed(4)}%`);

  // Real-time watching
  console.log('\n--- Real-time Dynamic Fee Monitoring ---');
  console.log('Watching for DynamicFeeUpdated events...');
  console.log('(Press Ctrl+C to stop)\n');

  const unwatch = dynamicFeeCalc.watchDynamicFeeUpdates(poolAddress, (event, blockNum) => {
    console.log(`[Block ${blockNum}] Dynamic Fee Updated:`);
    console.log(`  Fee: ${event.dynBps} bps (${feeCalc.feeToPercent(event.dynBps).toFixed(4)}%)`);
    console.log(`  Activity: ${event.activity}`);
    console.log(`  Pulse: ${event.pulse}`);
    console.log('');
  });

  // Keep process running for watching
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      unwatch();
      console.log('Stopped watching for dynamic fee updates.');
      resolve();
    }, 30_000);
  });

  console.log('\nDynamic fee calculation example completed.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
