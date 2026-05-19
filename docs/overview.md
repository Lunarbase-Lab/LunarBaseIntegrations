# Overview

## Summary

`Pool` is an operator-updated proactive market maker that combines:

- PMM swap logic
- embedded LP position management
- treasury and partner-fee accounting

The protocol supports ERC-20/ERC-20 pairs and native-`X` / ERC-20 pairs. Price and direction-specific fees are updated on-chain by immutable operators through `upd(...)`.

## Core Ideas

- quotes and swaps are based on the latest on-chain `anchorPX48` state plus current reserves
- operator updates publish an anchor price `anchorPX48` and direction-specific fees `feeAskX24` / `feeBidX24`
- the pool only serves live flow while that state is fresh under `blockDelay`
- LP principal is tracked as normalized `principalWealth`, not as transferable shares
- fixed APR yield accrues on LP wealth and is paid from treasury buckets
- LP withdrawal and claim payouts can be requested in `X`, `Y`, or `Split`

## Runtime Architecture

```text
Operators ──► Pool.upd(...)
Users     ──► Pool.swapExactIn(...)
LPs       ──► Pool.requestDeposit / requestWithdrawal / claimFees
Owner     ──► Pool.executeDeposit / executeWithdrawal / pause / admin controls
```

More concretely:

- the production runtime on Base Mainnet is a UUPS / ERC1967 proxy at `0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99`
- integrators should treat that proxy address as the main `Pool` contract address
- `Pool` owns price state, reserves, swaps, and pause controls
- `PositionManager` is embedded and owns LP request/execute logic plus wealth accounting
- `FeeManager` is embedded and owns treasury / partner-fee buckets
- `PoolUUPS` is the current implementation behind the proxy; docs in this directory describe the proxy runtime surface

## Why Wealth-Based LP Accounting

The LP system no longer tracks token principal or share-ledger balances. Instead:

- deposit requests escrow raw token amounts
- `executeDeposit(...)` values accepted amounts using the current normalized anchor price derived from `anchorPX48`
- the position is credited in normalized `Y`-denominated wealth units

That model lets the protocol:

- support one-sided liquidity provision
- accrue a fixed APR against one common numeraire
- settle withdrawals and yield claims into `X`, `Y`, or `Split`

## Important Operational Behavior

- swaps run only while the pool is unpaused
- deposit and withdrawal request/execute flows require the pool to be paused
- `claimFees(...)` is not pause-gated
- pending withdrawal stops APR accrual but does not reserve liquidity out of the pool
- treasury-funded LP payouts debit treasury buckets before paying
