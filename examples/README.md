# DEX Integration Examples

A TypeScript SDK and examples for integrating with the DEX protocol on Base network.

## Overview

This package provides tools for:

1. **Pool Discovery** - Listen for pool creation events and build a pool registry
2. **Fee Extraction** - Understand and calculate pool fee structures
3. **Swap Simulation** - Simulate swaps with accurate fee and price impact calculations
4. **Dynamic Fee Calculation** - Track and calculate dynamic fees off-chain

## Installation

```bash
cd examples
npm install
```

## Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` to configure your network:

```bash
# Base Mainnet
RPC_URL_MAINNET=https://base-rpc.publicnode.com

# Base Sepolia Testnet  
RPC_URL_TESTNET=https://base-sepolia-rpc.publicnode.com

# Network to use: "mainnet" or "testnet"
NETWORK=mainnet
```

## Running Examples

### 1. Pool Discovery

Discover pools by listening to `PairCreated` events:

```bash
npm run example:pools
```

This example demonstrates:
- Scanning historical pool creation events
- Building a pool registry from events
- Watching for new pools in real-time
- Filtering pools by token
- Grouping pools by fee tier

### 2. Extract Pool Fees

Understand how fees are structured and calculated:

```bash
npm run example:fees [POOL_ADDRESS]
```

This example demonstrates:
- Reading base fee configuration from core module
- Understanding fee weights (wToken0, wToken1)
- Calculating effective fees for each swap direction
- Getting protocol share and LP fee breakdown

### 3. Simulate Swaps

Calculate expected swap outputs with accurate fee accounting:

```bash
npm run example:swap [POOL_ADDRESS] [AMOUNT_IN]
```

This example demonstrates:
- Exact input swap simulation (specify input, get expected output)
- Exact output swap simulation (specify output, get required input)
- Price impact calculation
- Slippage tolerance calculation
- Comparison with on-chain quoter

### 4. Calculate Dynamic Fee

Track and calculate dynamic fees off-chain:

```bash
npm run example:dynamic-fee [POOL_ADDRESS]
```

This example demonstrates:
- Reading dynamic fee configuration
- Getting current dynamic fee state from events
- Calculating fee decay over time
- Simulating how swaps affect dynamic fees
- Estimating time until fee decays to target

## Running Tests

```bash
npm test
```

With coverage:

```bash
npm run test:coverage
```

## Architecture

### Core Components

```
src/
├── core/                    # Contract wrappers
│   ├── Provider.ts         # RPC provider setup
│   ├── PoolContract.ts     # Pool contract interactions
│   ├── FactoryContract.ts  # Factory contract interactions
│   └── CoreModuleContract.ts # Core module interactions
├── services/               # Business logic
│   ├── PoolDiscovery.ts    # Pool discovery and caching
│   ├── FeeCalculator.ts    # Fee calculation utilities
│   ├── SwapSimulator.ts    # Swap simulation
│   └── DynamicFeeCalculator.ts # Dynamic fee tracking
├── constants/              # ABIs and addresses
│   ├── abis.ts            # Minimal contract ABIs
│   └── addresses.ts       # Deployed contract addresses
├── types/                  # TypeScript types
│   └── index.ts
└── index.ts               # Main exports
```

### Usage Example

```typescript
import {
  Provider,
  PoolDiscovery,
  FeeCalculator,
  SwapSimulator,
  DynamicFeeCalculator,
  MAINNET_ADDRESSES,
  TESTNET_ADDRESSES,
} from 'dex-integration-examples';

// Initialize provider for mainnet
const provider = new Provider({
  rpcUrl: 'https://base-rpc.publicnode.com',
  network: 'mainnet',
});
const client = provider.getClient();

// Use appropriate addresses for network
const addresses = MAINNET_ADDRESSES; // or TESTNET_ADDRESSES

// Discover pools
const discovery = new PoolDiscovery(client, addresses.factory);
const pools = await discovery.scanPools({ fromBlock: 1000000n });

// Calculate fees
const feeCalc = new FeeCalculator(client, addresses.coreModule);
const fees = await feeCalc.getPoolFees(poolAddress);

// Simulate swap
const simulator = new SwapSimulator(
  client,
  addresses.quoter,
  addresses.coreModule
);
const result = await simulator.simulateExactInput(poolAddress, {
  tokenIn,
  tokenOut,
  amountIn: BigInt(1e18),
});

// Track dynamic fees
const dynFeeCalc = new DynamicFeeCalculator(client, addresses.coreModule);
const currentDynFee = await dynFeeCalc.getCurrentDynamicFee(poolAddress);
```

## Fee System Overview

### Base Fee

The base fee is configured per pool with weights:

```typescript
interface BaseFeeConfig {
  baseFee: number;   // Total fee (1_000_000_000 = 100%)
  wToken0: number;   // Weight for token0 fee
  wToken1: number;   // Weight for token1 fee
}
```

When swapping token0 → token1:
- Effective fee = `baseFee * wToken0 / 1_000_000_000`

When swapping token1 → token0:
- Effective fee = `baseFee * wToken1 / 1_000_000_000`

### Dynamic Fee

Dynamic fees adjust based on trading activity:

```typescript
interface DynamicFeeConfig {
  maxCapBps: number;  // Maximum dynamic fee cap
  halfLife: number;   // Decay half-life in seconds
  enabled: boolean;   // Whether dynamic fees are active
}
```

- Each swap increases "activity" based on swap size relative to reserves
- Activity decays exponentially over time
- Dynamic fee = `min(activity_scaled, maxCapBps)`

### Total Fee

```
Total Fee = Effective Base Fee + Current Dynamic Fee
Protocol Fee = Total Fee * protocolShareBps / 10000
LP Fee = Total Fee - Protocol Fee
```

## Contract Addresses

Contract addresses are imported directly from the repository JSON files:
- Mainnet: `mainnet/addresses.json`
- Testnet: `testnet/addresses.json`

The SDK automatically uses the correct addresses based on the network type.

```typescript
import { MAINNET_ADDRESSES, TESTNET_ADDRESSES } from 'dex-integration-examples';

// Addresses are loaded from repository JSON files
console.log(MAINNET_ADDRESSES.factory);
console.log(TESTNET_ADDRESSES.factory);
```

## Key Events

### PairCreated (Factory)

```solidity
event PairCreated(
    address indexed token0,
    address indexed token1,
    address indexed module,
    address pair,
    uint256 pairCount,
    uint8 moduleMask,
    BaseFeeConfig baseFeeConfig
);
```

### Swap (Pool)

```solidity
event Swap(
    address indexed sender,
    uint256 amount0In,
    uint256 amount1In,
    uint256 amount0Out,
    uint256 amount1Out,
    address indexed to
);
```

### DynamicFeeUpdated (Core Module)

```solidity
event DynamicFeeUpdated(
    address indexed pair,
    uint32 dynBps,
    uint256 activity,
    uint40 lastUpdate,
    uint256 pulse
);
```

## Additional Resources

- Full ABIs: Imported from `mainnet/abi/` directory (no duplication)
- Documentation: See `docs/.md/` directory for detailed protocol documentation
- Contract addresses: Imported from `mainnet/addresses.json` and `testnet/addresses.json`

## Network Configuration

The SDK supports both Base Mainnet and Base Sepolia testnet:

| Network | Chain ID | RPC Endpoint |
|---------|----------|--------------|
| Base Mainnet | 8453 | `https://base-rpc.publicnode.com` |
| Base Sepolia | 84532 | `https://base-sepolia-rpc.publicnode.com` |

## License

MIT
