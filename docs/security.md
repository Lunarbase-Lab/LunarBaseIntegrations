# Trading Integration Constraints

Use the [trading ABI](../abi/Pool.trading.abi.json) to encode calls and decode the relevant events and errors.

## Quote and Execution Context

Freshness is the strict condition:

```text
block.number < latestUpdateBlock + blockDelay
```

At the boundary the state is stale. Swap execution reverts with `StalePrice()`; directional quotes return `(0, anchorPrice, 0)` for stale state. Read `blockDelay()` rather than assuming a fixed freshness window.

Quotes do not check pause state, token allowance, Permit2 validity, recipient transfer behavior, or caller balance. They depend on the immediate caller's whitelist status, current directional fees, punishment, and active reserves. Use the intended pool caller as the simulation's `from` address, check `paused()` and `isFresh()`, and set `amountOutMinimum` and a deadline for execution.

A successful quote does not reserve an execution price. Other swaps can increase the relevant directional fee; authorized state updates can change the anchor and fees before inclusion. The returned `pNext` stays equal to the anchor.

## Token Movement

Swap entrypoints use `ReentrancyGuardTransient` and require an unpaused pool. The execution chain must support EIP-1153 transient storage. ERC-20 movement uses SafeERC20 or Permit2; native output must succeed or the transaction reverts.

The pool prices the requested input and then pulls that amount from `msg.sender`. Current transfer helpers do not compare the received balance delta with the requested amount. Integrations must not assume support for fee-on-transfer or rebasing tokens. Native-output recipients must accept ETH.

The input is paid before output is sent. No swap callback accepts deferred payment. When a router calls the pool, the router supplies the input and receives its own whitelist and partner-attribution treatment, even if a different user initiated the route.

## State and Accounting

Use `X()` / `Y()` and the actual token decimals for raw-unit conversions. Native X is `address(0)` and uses 18 decimals. Read active reserves with `getXReserve()` / `getYReserve()` instead of treating the pool's custody balances as fully available liquidity.

Swap fees and punishment use denominator `2^24`, with `uint24.max` treated as the full-fee sentinel. Partner fee shares instead use `BPS() == 1_000_000`. These scales are not interchangeable. Punishment and the non-whitelisted caller multiplier can reduce output to zero even when token inventory is available.

Pool configuration and implementation upgrades can change future execution behavior. Integrations should re-read trading configuration and verify the active implementation when deployment metadata changes. Invalidate cached quotes on pricing, punishment, whitelist, multiplier, reserve, or pause-state changes; freshness also changes as blocks advance without a new state update.
