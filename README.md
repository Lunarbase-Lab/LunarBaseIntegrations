# LunarBase PropAMM Integration

Integration reference for LunarBase quotes and swaps, including the `lunarbase-pmm-math` 0.4.1 API. Pricing uses an operator-published Q64.96 anchor, directional fees and immediate amount-dependent punishment.

## Pools

| Network | Chain ID | Pair (X / Y) | Pool proxy |
| --- | --- | --- | --- |
| Base | `8453` | native ETH / USDC | `0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99` |
| BNB Smart Chain | `56` | native BNB / USDT | `0x00007904d186680C709519e71f4Dc3e2DF8f1b99` |

Call the proxy. Both pools use `address(0)` as token X; wrapped native tokens are different assets. Base USDC has 6 decimals, while BNB Chain USDT has 18. Read `X()` and `Y()` on the intended chain and preserve that order when interpreting prices and fees.

[mainnet/addresses.json](mainnet/addresses.json) records the pool proxies, implementation addresses, tokens and decimals. Older mainnet and testnet records remain historical references; they do not establish compatibility with this integration.

## ABI

Use [abi/Pool.trading.abi.json](abi/Pool.trading.abi.json) for the documented quote/swap surface and trading-state/event decoding. [abi/Pool.abi.json](abi/Pool.abi.json) is the complete Pool application ABI. Neither includes UUPS administration methods.

## Integration path

1. Select chain and Pool proxy from the registry, then read a coherent state snapshot and the actual caller's fee policy.
2. Quote using the Pool with `eth_call.from` set to the execution caller, or use `lunarbase-pmm-math` with inputs from that snapshot.
3. Execute the appropriate native, direct-allowance or Permit2 entrypoint with `amountOutMinimum` and a deadline.
4. Refresh state after successful swaps and operator updates. A swap changes directional fees and reserves; a quote does not.

## Documentation

| Guide | Content |
| --- | --- |
| [Overview](docs/overview.md) | Trading model and runtime dependencies |
| [Price discovery](docs/price-discovery.md) | Exact rounding, punishment, fees and caller multiplier |
| [Off-chain integration](docs/offchain-integration.md) | Rust/Go/Node APIs, snapshots, sequential simulation and order books |
| [Settlement](docs/settlement.md) | Native, allowance and Permit2 swaps |
| [Errors and events](docs/errors-and-events.md) | Trading reverts and cache invalidation |
| [Hosted API](docs/api.md) | Routes, authentication and quote limitations |
| [API examples](docs/api-examples.md) | Base ETH/USDC quote examples |
| [Security](docs/security.md) | Execution and operational assumptions |

## Quote semantics

`feeBidX24` applies to X -> Y and `feeAskX24` to Y -> X. Each quote includes the current input's punishment. A successful swap persists the increased directional fee; an operator update replaces the pricing epoch. Caller multiplication applies after the base fee's integer rounding. The Q24 sentinel `0xffffff` means conceptual 100%.

Read-only quotes can be positive while swaps are paused and do not check every settlement condition. Preserve slippage protection and simulate the actual call. The hosted REST backend currently quotes with multiplier one; its result can differ from a non-whitelisted caller's on-chain quote.
