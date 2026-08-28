# LunarBase PropAMM Integration — v0.4.0

Integration reference for the LunarBase proactive market maker. The pool uses operator-published pricing, direction-specific fees, linear amount-dependent punishment, embedded LP position management, and direct / Permit2 / native-token swap entrypoints.

## Current Deployment

The only deployment covered by the v0.4.0 ABI is:

| Network | Chain ID | Pair | Pool proxy | Current implementation |
| ------- | -------- | ---- | ---------- | ---------------------- |
| BNB Smart Chain | `56` | BNB / USDT | `0x00007904d186680c709519e71f4dc3e2df8f1b99` | `0x385E90e2F2Bf13DfE55AF5F7F1da43D72373f7E0` |

For this pool:

- `X()` is the native-token sentinel `0x0000000000000000000000000000000000000000`
- `Y()` is USDT at `0x55d398326f99059fF775485246999027B3197955`
- the public integration address is the proxy address, not the implementation address
- earlier Base, Monad, BNB Chain, and testnet deployments do not use this v0.4.0 ABI

See [`mainnet/addresses.json`](mainnet/addresses.json) for the machine-readable deployment record. Older mainnet addresses are retained only in [`archive/mainnet/addresses.pre-v0.4.0.json`](archive/mainnet/addresses.pre-v0.4.0.json).

## ABI

[`abi/Pool.abi.json`](abi/Pool.abi.json) is a plain JSON ABI array generated from the v0.4.0 `Pool` contract. It contains no bytecode, deployment artifact wrapper, or UUPS administration functions.

Use this ABI with the proxy address above.

## Repository Structure

```text
.
├── README.md
├── abi/
│   └── Pool.abi.json           — v0.4.0 Pool ABI as a plain JSON array
├── docs/
│   ├── overview.md             — protocol and deployment overview
│   ├── price-discovery.md      — Q64.96 price, quotes, fees, and punishment
│   ├── settlement.md           — swap and LP settlement
│   ├── errors-and-events.md    — errors and events
│   ├── api.md                  — hosted API reference
│   ├── api-examples.md         — hosted API examples
│   └── security.md             — security and operational assumptions
├── mainnet/
│   └── addresses.json          — current v0.4.0 deployment
├── testnet/
│   └── addresses.json          — legacy testnet deployments, not v0.4.0
└── archive/
    └── mainnet/
        └── addresses.pre-v0.4.0.json
```

## Contracts in Scope

| Contract | Description |
| -------- | ----------- |
| **Pool** | Unified entry point for quotes, swaps, LP position requests/execution, fees, and administrative controls |

The deployed address is a UUPS / ERC1967 proxy, but proxy upgrade methods are intentionally excluded from the public integration ABI.

## v0.4.0 Integration Notes

- **Price format:** `anchorPrice` is `uint160` Q64.96 sqrt-price: `floor(sqrt(P) * 2^96)`.
- **Directional fees:** `feeBidX24` applies to X -> Y and `feeAskX24` applies to Y -> X.
- **Amount-dependent punishment:** the current swap adds a linear, reserve-relative Q24 punishment to the applicable directional fee, capped by `maxPunishmentX24` and `uint24.max`.
- **State persistence:** a successful swap stores its increased directional fee; a later operator `upd(...)` publishes a fresh anchor and directional fees.
- **Off-chain parity:** use `lunarbase-pmm-math` v0.4.0 for bit-exact Rust and TypeScript-compatible quote arithmetic.
- **Freshness:** quotes and swaps depend on operator state being fresh under `blockDelay`.
- **Native BNB:** because `X()` is `address(0)`, native BNB input uses `swapExactInNative(...)`.
