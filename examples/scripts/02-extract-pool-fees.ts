/**
 * Example 02: Extract Pool Fees
 *
 * Demonstrates how to:
 * - Read pool fee configuration from the core module
 * - Understand the fee weight system (wToken0, wToken1)
 * - Calculate effective fees for different swap directions
 * - Get the protocol share of fees
 *
 * Usage:
 *   npx tsx scripts/02-extract-pool-fees.ts [POOL_ADDRESS]
 *
 * If no pool address is provided, the script will discover pools
 * and analyze the first one found.
 */

import 'dotenv/config';
import { Provider } from '../src/core/Provider.js';
import { PoolDiscovery } from '../src/services/PoolDiscovery.js';
import { FeeCalculator } from '../src/services/FeeCalculator.js';
import { PoolContract } from '../src/core/PoolContract.js';
import { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from '../src/constants/addresses.js';
import { FEE_CONSTANTS } from '../src/types/index.js';
import type { Address } from 'viem';

async function main() {
  console.log('='.repeat(60));
  console.log('Pool Fee Extraction Example');
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

  // Get pool address from command line or discover one
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

  // Create fee calculator
  const feeCalculator = new FeeCalculator(client, addresses.coreModule as `0x${string}`);

  // Get pool contract to fetch token info
  const pool = new PoolContract(client, poolAddress);
  const [token0, token1] = await pool.getTokens();

  console.log('\n--- Pool Information ---');
  console.log(`Pool Address: ${poolAddress}`);
  console.log(`Token0: ${token0}`);
  console.log(`Token1: ${token1}`);

  // Get base fee configuration
  console.log('\n--- Base Fee Configuration ---');
  const baseFeeConfig = await feeCalculator.getBaseFeeConfig(poolAddress);

  const baseFeePercent = feeCalculator.feeToPercent(baseFeeConfig.baseFee);
  const wToken0Percent = (baseFeeConfig.wToken0 / FEE_CONSTANTS.WEIGHT_SUM) * 100;
  const wToken1Percent = (baseFeeConfig.wToken1 / FEE_CONSTANTS.WEIGHT_SUM) * 100;

  console.log(`Base Fee: ${baseFeeConfig.baseFee} (${baseFeePercent.toFixed(4)}%)`);
  console.log(`Weight Token0: ${baseFeeConfig.wToken0} (${wToken0Percent.toFixed(2)}%)`);
  console.log(`Weight Token1: ${baseFeeConfig.wToken1} (${wToken1Percent.toFixed(2)}%)`);

  // Explain fee weights
  console.log('\nFee Weight Explanation:');
  console.log('  The base fee is split between input tokens based on weights.');
  console.log('  When swapping Token0 -> Token1:');
  console.log(`    Effective fee = baseFee * wToken0 / WEIGHT_SUM`);
  console.log(`    = ${baseFeeConfig.baseFee} * ${baseFeeConfig.wToken0} / ${FEE_CONSTANTS.WEIGHT_SUM}`);
  console.log(`    = ${feeCalculator.calculateEffectiveBaseFee(baseFeeConfig, true)}`);
  console.log('  When swapping Token1 -> Token0:');
  console.log(`    Effective fee = baseFee * wToken1 / WEIGHT_SUM`);
  console.log(`    = ${baseFeeConfig.baseFee} * ${baseFeeConfig.wToken1} / ${FEE_CONSTANTS.WEIGHT_SUM}`);
  console.log(`    = ${feeCalculator.calculateEffectiveBaseFee(baseFeeConfig, false)}`);

  // Get dynamic fee configuration
  console.log('\n--- Dynamic Fee Configuration ---');
  const dynamicConfig = await feeCalculator.getDynamicFeeConfig(poolAddress);

  console.log(`Enabled: ${dynamicConfig.enabled}`);
  console.log(`Max Cap: ${dynamicConfig.maxCapBps} (${feeCalculator.feeToPercent(dynamicConfig.maxCapBps).toFixed(4)}%)`);
  console.log(`Half Life: ${dynamicConfig.halfLife} seconds (${(dynamicConfig.halfLife / 60).toFixed(1)} minutes)`);

  // Get protocol share
  console.log('\n--- Protocol Share ---');
  const protocolShareBps = await feeCalculator.getProtocolShareBps();
  console.log(`Protocol Share: ${protocolShareBps} bps (${(protocolShareBps / 100).toFixed(2)}%)`);
  console.log('  This is the percentage of total fees that goes to the protocol.');
  console.log('  The rest goes to liquidity providers.');

  // Calculate complete fee breakdown
  console.log('\n--- Complete Fee Breakdown (Token0 -> Token1) ---');
  const feesToken0In = await feeCalculator.getPoolFees(poolAddress, true);
  const formattedFees0 = feeCalculator.formatFeeResult(feesToken0In);

  console.log(`Base Fee (configured): ${formattedFees0.baseFeePercent}`);
  console.log(`Effective Base Fee: ${formattedFees0.effectiveFeePercent}`);
  console.log(`Dynamic Fee: ${formattedFees0.dynamicFeePercent}`);
  console.log(`Total Fee: ${formattedFees0.totalFeePercent}`);
  console.log(`Protocol Share: ${formattedFees0.protocolSharePercent} of total`);
  console.log(`LP Fee: ${formattedFees0.lpFeePercent}`);

  console.log('\n--- Complete Fee Breakdown (Token1 -> Token0) ---');
  const feesToken1In = await feeCalculator.getPoolFees(poolAddress, false);
  const formattedFees1 = feeCalculator.formatFeeResult(feesToken1In);

  console.log(`Base Fee (configured): ${formattedFees1.baseFeePercent}`);
  console.log(`Effective Base Fee: ${formattedFees1.effectiveFeePercent}`);
  console.log(`Dynamic Fee: ${formattedFees1.dynamicFeePercent}`);
  console.log(`Total Fee: ${formattedFees1.totalFeePercent}`);
  console.log(`Protocol Share: ${formattedFees1.protocolSharePercent} of total`);
  console.log(`LP Fee: ${formattedFees1.lpFeePercent}`);

  // Example: Calculate fee impact on a swap
  console.log('\n--- Fee Impact Example ---');
  const reserves = await pool.getReserves();
  console.log(`Current reserves: ${reserves[0]} / ${reserves[1]}`);

  if (reserves[0] > 0n && reserves[1] > 0n) {
    const amountIn = reserves[0] / 100n; // 1% of reserve
    const amountOutWithFee = feeCalculator.calculateAmountOutWithFee(
      amountIn,
      reserves[0],
      reserves[1],
      feesToken0In.totalFeeBps
    );

    // Calculate output without fee for comparison
    const amountOutNoFee = (amountIn * reserves[1]) / (reserves[0] + amountIn);

    console.log(`\nSwapping ${amountIn} of Token0:`);
    console.log(`  Output without fee: ${amountOutNoFee}`);
    console.log(`  Output with fee: ${amountOutWithFee}`);
    console.log(`  Fee paid: ${amountOutNoFee - amountOutWithFee}`);
  }

  console.log('\nFee extraction example completed.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
