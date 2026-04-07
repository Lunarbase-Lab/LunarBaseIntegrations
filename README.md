# LunarBase PropAMM Integration

On-chain proactive market maker that concentrates liquidity in a dynamic band around an operator-set price. Uses an off-chain price oracle and custom price curve to provide tight, continuously-updated quotes for any ERC-20/ERC-20 or Native/ERC-20 pair.

## Repository Structure

```
.
├── README.md                    — Repository overview
├── docs/
│   ├── overview.md              — Protocol summary and motivation
│   ├── price-discovery.md       — On-chain quoting and API endpoints
│   ├── settlement.md            — Swap execution and Permit2 integration
│   ├── errors-and-events.md     — Error codes and emitted events
│   ├── api.md                   — API reference
│   ├── api-examples.md          — API usage examples
│   └── security.md              — Security model, limitations, dependencies
├── mainnet/
│   └── addresses.json           — Deployed contract addresses
├── testnet/
│   └── addresses.json           — Deployed contract addresses
└── archive/                     — Legacy docs, ABIs, and examples
```

## Contracts in Scope

| Contract | Description |
| -------- | ----------- |
| **Pool** | Unified entry point for quoting, swaps (direct, Permit2, native ETH), LP position requests/execution, fees, and admin controls |

## Key Concepts

- **Operator-driven pricing**: Up to 5 immutable operator addresses push price updates on-chain. The pool only serves quotes when operator state is fresh (within `blockDelay` blocks).
- **Single-contract integration surface**: Quotes, swaps, LP actions, treasury/partner fees, and admin controls all live on the same `Pool` ABI.
- **Permit2 gasless approvals**: Users approve the canonical Permit2 contract once, then sign per-swap permits off-chain.
- **Native ETH support**: Pools where token X is `address(0)` accept native ETH via `swapExactInNative`.
