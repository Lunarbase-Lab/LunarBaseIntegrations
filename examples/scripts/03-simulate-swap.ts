/**
 * Example 03: Simulate Swap
 *
 * Demonstrates how to:
 * - Simulate exact input swaps (specify input, get expected output)
 * - Simulate exact output swaps (specify output, get required input)
 * - Calculate price impact and execution price
 * - Account for fees in swap calculations
 * - Use slippage tolerance
 *
 * Usage:
 *   npx tsx scripts/03-simulate-swap.ts [POOL_ADDRESS] [AMOUNT_IN]
 *
 * If no arguments provided, discovers a pool and uses default amounts.
 */

import 'dotenv/config';
import { Provider } from '../src/core/Provider.js';
import { PoolDiscovery } from '../src/services/PoolDiscovery.js';
import { SwapSimulator } from '../src/services/SwapSimulator.js';
import { PoolContract } from '../src/core/PoolContract.js';
import { ERC20_ABI } from '../src/constants/abis.js';
import { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from '../src/constants/addresses.js';
import type { Address } from 'viem';

async function main() {
  console.log('='.repeat(60));
  console.log('Swap Simulation Example');
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
  let amountIn: bigint;

  if (process.argv[2]) {
    poolAddress = process.argv[2] as Address;
    amountIn = process.argv[3] ? BigInt(process.argv[3]) : BigInt(1e18);
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
    amountIn = BigInt(1e18); // Default: 1 token (18 decimals)
  }

  // Create swap simulator
  const simulator = new SwapSimulator(
    client,
    addresses.quoter as `0x${string}`,
    addresses.coreModule as `0x${string}`
  );

  // Get pool information
  const pool = new PoolContract(client, poolAddress);
  const [token0, token1] = await pool.getTokens();
  const poolState = await pool.getState();

  // Try to get token symbols
  let token0Symbol = 'Token0';
  let token1Symbol = 'Token1';
  let token0Decimals = 18;
  let token1Decimals = 18;

  try {
    token0Symbol = (await client.readContract({
      address: token0,
      abi: ERC20_ABI,
      functionName: 'symbol',
    })) as string;
    token0Decimals = (await client.readContract({
      address: token0,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })) as number;
  } catch {
    /* Token might not be ERC20 compliant */
  }

  try {
    token1Symbol = (await client.readContract({
      address: token1,
      abi: ERC20_ABI,
      functionName: 'symbol',
    })) as string;
    token1Decimals = (await client.readContract({
      address: token1,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })) as number;
  } catch {
    /* Token might not be ERC20 compliant */
  }

  console.log('\n--- Pool Information ---');
  console.log(`Pool: ${poolAddress}`);
  console.log(`Token0: ${token0Symbol} (${token0})`);
  console.log(`Token1: ${token1Symbol} (${token1})`);
  console.log(`Reserve0: ${poolState.reserve0} (${Number(poolState.reserve0) / 10 ** token0Decimals} ${token0Symbol})`);
  console.log(`Reserve1: ${poolState.reserve1} (${Number(poolState.reserve1) / 10 ** token1Decimals} ${token1Symbol})`);

  // Check if pool has liquidity
  if (poolState.reserve0 === 0n || poolState.reserve1 === 0n) {
    console.log('\nPool has no liquidity. Cannot simulate swaps.');
    process.exit(1);
  }

  // Calculate spot price
  const spotPrice = Number(poolState.reserve1) / Number(poolState.reserve0);
  console.log(`\nSpot Price: 1 ${token0Symbol} = ${spotPrice.toFixed(8)} ${token1Symbol}`);

  // --- Exact Input Simulation ---
  console.log('\n' + '='.repeat(60));
  console.log('EXACT INPUT SWAP SIMULATION');
  console.log('='.repeat(60));
  console.log(`\nSwapping ${Number(amountIn) / 10 ** token0Decimals} ${token0Symbol} -> ${token1Symbol}`);

  // Using off-chain calculation
  console.log('\n--- Off-chain Calculation ---');
  const exactInputResult = await simulator.simulateExactInput(poolAddress, {
    tokenIn: token0,
    tokenOut: token1,
    amountIn,
  });

  const formatted = simulator.formatResult(exactInputResult, token0Decimals, token1Decimals);
  console.log(`Input: ${formatted.amountIn} ${token0Symbol}`);
  console.log(`Output: ${formatted.amountOut} ${token1Symbol}`);
  console.log(`Fee Amount: ${formatted.feeAmount} ${token1Symbol}`);
  console.log(`Effective Fee: ${formatted.effectiveFeePercent}`);
  console.log(`Price Impact: ${formatted.priceImpactPercent}`);
  console.log(`Execution Price: ${formatted.executionPrice} ${token1Symbol}/${token0Symbol}`);
  console.log(`Spot Price: ${formatted.spotPrice} ${token1Symbol}/${token0Symbol}`);

  // Using on-chain quoter
  console.log('\n--- On-chain Quoter ---');
  try {
    const onChainOutput = await simulator.simulateExactInputOnChain(poolAddress, {
      tokenIn: token0,
      tokenOut: token1,
      amountIn,
    });
    console.log(`Quoted Output: ${Number(onChainOutput) / 10 ** token1Decimals} ${token1Symbol}`);

    // Compare results
    const difference = exactInputResult.amountOut - onChainOutput;
    const diffPercent = Number(difference * 10000n / exactInputResult.amountOut) / 100;
    console.log(`Difference from off-chain: ${diffPercent.toFixed(4)}%`);
  } catch (error) {
    console.log(`Quoter call failed: ${error}`);
  }

  // --- Exact Output Simulation ---
  console.log('\n' + '='.repeat(60));
  console.log('EXACT OUTPUT SWAP SIMULATION');
  console.log('='.repeat(60));

  const desiredOutput = poolState.reserve1 / 100n; // 1% of reserve
  console.log(`\nWant to receive ${Number(desiredOutput) / 10 ** token1Decimals} ${token1Symbol}`);

  console.log('\n--- Off-chain Calculation ---');
  const exactOutputResult = await simulator.simulateExactOutput(poolAddress, {
    tokenIn: token0,
    tokenOut: token1,
    amountOut: desiredOutput,
  });

  const formattedOutput = simulator.formatResult(exactOutputResult, token0Decimals, token1Decimals);
  console.log(`Required Input: ${formattedOutput.amountIn} ${token0Symbol}`);
  console.log(`Output: ${formattedOutput.amountOut} ${token1Symbol}`);
  console.log(`Effective Fee: ${formattedOutput.effectiveFeePercent}`);
  console.log(`Price Impact: ${formattedOutput.priceImpactPercent}`);

  // Using on-chain quoter
  console.log('\n--- On-chain Quoter ---');
  try {
    const onChainInput = await simulator.simulateExactOutputOnChain(poolAddress, {
      tokenIn: token0,
      tokenOut: token1,
      amountOut: desiredOutput,
    });
    console.log(`Quoted Input: ${Number(onChainInput) / 10 ** token0Decimals} ${token0Symbol}`);
  } catch (error) {
    console.log(`Quoter call failed: ${error}`);
  }

  // --- Slippage Calculation ---
  console.log('\n' + '='.repeat(60));
  console.log('SLIPPAGE TOLERANCE');
  console.log('='.repeat(60));

  const slippageBps = 50; // 0.5%
  console.log(`\nSlippage tolerance: ${slippageBps / 100}%`);

  // For exact input: calculate minimum output
  const minOutput = simulator.calculateMinOutput(exactInputResult.amountOut, slippageBps);
  console.log(`\nExact Input Swap:`);
  console.log(`  Expected output: ${Number(exactInputResult.amountOut) / 10 ** token1Decimals} ${token1Symbol}`);
  console.log(`  Minimum output: ${Number(minOutput) / 10 ** token1Decimals} ${token1Symbol}`);

  // For exact output: calculate maximum input
  const maxInput = simulator.calculateMaxInput(exactOutputResult.amountIn, slippageBps);
  console.log(`\nExact Output Swap:`);
  console.log(`  Expected input: ${Number(exactOutputResult.amountIn) / 10 ** token0Decimals} ${token0Symbol}`);
  console.log(`  Maximum input: ${Number(maxInput) / 10 ** token0Decimals} ${token0Symbol}`);

  // --- Large Swap Simulation (Price Impact) ---
  console.log('\n' + '='.repeat(60));
  console.log('PRICE IMPACT ANALYSIS');
  console.log('='.repeat(60));

  const swapSizes = [1, 5, 10, 25, 50]; // Percentage of reserve
  console.log('\nSwap size vs Price Impact:');
  console.log('-'.repeat(40));

  for (const sizePercent of swapSizes) {
    const testAmount = (poolState.reserve0 * BigInt(sizePercent)) / 100n;
    const result = await simulator.simulateExactInput(poolAddress, {
      tokenIn: token0,
      tokenOut: token1,
      amountIn: testAmount,
    });

    console.log(
      `${sizePercent.toString().padStart(3)}% of reserve: ` +
      `${(result.priceImpactBps / 100).toFixed(4)}% price impact, ` +
      `execution: ${result.executionPrice.toFixed(6)}`
    );
  }

  console.log('\nSwap simulation example completed.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
