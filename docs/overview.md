# Overview

## Summary

`Pool` v0.4.0 is an operator-updated proactive market maker that combines:

- fixed-anchor swap conversion
- direction-specific operator fees
- linear amount-dependent punishment
- embedded LP position management
- treasury and partner-fee accounting

The current v0.4.0 deployment supports the native-BNB / USDT pair on BNB Smart Chain. Price and direction-specific fees are refreshed on-chain by immutable operators through `upd(...)`.

## Current Runtime

| Field | Value |
| ----- | ----- |
| Network | BNB Smart Chain (`chainId = 56`) |
| Pair | BNB / USDT |
| Pool proxy | `0x00007904d186680c709519e71f4dc3e2df8f1b99` |
| Current implementation | `0x385E90e2F2Bf13DfE55AF5F7F1da43D72373f7E0` |
| Token X | native BNB sentinel (`address(0)`) |
| Token Y | `0x55d398326f99059fF775485246999027B3197955` |

Integrators call the proxy using [`../abi/Pool.abi.json`](../abi/Pool.abi.json). The ABI is the Pool application interface and deliberately excludes UUPS administration methods.

## Core Ideas

- the anchor is a `uint160` Q64.96 sqrt-price, not the legacy `uint80` Q32.48 value
- operator updates publish `anchorPrice`, `feeAskX24`, and `feeBidX24`
- `feeAskX24` is used for Y -> X and `feeBidX24` is used for X -> Y
- the stored directional fee is the operator-published fee plus any punishment accumulated by successful swaps since the latest update
- each quote includes the current swap's linear amount-dependent punishment immediately
- the pool only serves live flow while operator state is fresh under `blockDelay`
- LP principal is tracked as normalized `principalWealth`, not transferable shares
- fixed APR yield accrues on LP wealth and is paid from treasury buckets
- LP withdrawal and claim payouts can be requested in `X`, `Y`, or `Split`

## Runtime Architecture

```text
Operators ──► Pool.upd(...)
Users     ──► Pool.quoteExactIn / quoteXToY / quoteYToX
Users     ──► Pool.swapExactIn / swapExactInNative
LPs       ──► Pool.requestDeposit / requestWithdrawal / claimFees
Owner     ──► Pool.executeDeposit / executeWithdrawal / pause / admin controls
```

The Pool owns price state, reserves, swaps, LP position state, and fee accounting. The production address is an ERC1967 proxy, while the public integration surface is the Pool ABI.

## Why Wealth-Based LP Accounting

The LP system tracks normalized wealth instead of token-principal shares:

- deposit requests escrow raw token amounts
- `executeDeposit(...)` values accepted amounts using the current price derived from the Q64.96 anchor
- the position is credited in normalized Y-denominated wealth units

That model supports one-sided liquidity provision, a common numeraire for fixed-APR accrual, and settlement into `X`, `Y`, or `Split`.

## Important Operational Behavior

- swaps run only while the pool is unpaused
- deposit and withdrawal request/execute flows require the pool to be paused
- `claimFees(...)` is not pause-gated
- pending withdrawal stops APR accrual but does not reserve liquidity out of the pool
- treasury-funded LP payouts debit treasury buckets before paying
