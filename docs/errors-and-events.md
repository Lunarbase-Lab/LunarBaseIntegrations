# Trading Events and Errors

Use [Pool.trading.abi.json](../abi/Pool.trading.abi.json) for quote, swap, and trading-state calls. It includes the relevant events and errors, including swap errors propagated through linked libraries.

The full [Pool.abi.json](../abi/Pool.abi.json) remains available for compatibility.

## Swap Events

```solidity
event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee);
event PunishmentApplied(
    bool indexed xToY,
    uint24 punishmentX24,
    uint24 feeAskX24,
    uint24 feeBidX24
);
event PartnerFeeTaken(address indexed router, uint256 partnerFeeX, uint256 partnerFeeY);
event Sync(uint128 reserveX, uint128 reserveY);
```

- `SwapExecuted`: `dx` always denotes the X amount and `dy` the Y amount. X → Y logs `(inputX, outputY)`; Y → X logs `(outputX, inputY)`. The fee is in the output token. None of the fields are indexed.
- `PunishmentApplied`: X → Y increases the bid fee; Y → X increases the ask fee. `punishmentX24` is the actual saturated increment, and the last two fields are the absolute stored fees after applying it. The caller multiplier affects the token fee, not this stored increment. No event is emitted if the stored fee does not increase.
- `PartnerFeeTaken`: a swap attributed a nonzero fee share to its immediate caller. `router` is that caller, not necessarily the end user.
- `Sync`: cached active reserves were refreshed after accounting deductions. Event fields are `uint128`; the reserve getters return `uint112`.

In an ordinary successful swap, events occur as `PunishmentApplied` when applicable, `PartnerFeeTaken` when applicable, `Sync`, then `SwapExecuted`. Tokens may emit their own transfer logs between these events. For proxy deployments, pool runtime events are emitted from the proxy address.

## Quote Cache Invalidation Events

```solidity
event StateUpdated(uint160 anchorPrice, uint24 feeAskX24, uint24 feeBidX24);
event MaxPunishmentX24Set(uint24 maxPunishmentX24);
event BlockDelaySet(uint48 blockDelay);
event WhitelistSet(address indexed account, bool whitelisted);
event BlacklistFeeMultiplierSet(uint256 multiplier);
event Paused(address account);
event Unpaused(address account);
```

- `StateUpdated` replaces the anchor and directional fees. The update's block number supplies `latestUpdateBlock`; the event retains three fields even though the update entrypoint also accepts a deadline.
- `MaxPunishmentX24Set` changes amount-dependent fee punishment, so cached quotes must be recomputed.
- `BlockDelaySet` changes the freshness boundary.
- `WhitelistSet` changes fee treatment for the indexed pool caller; `BlacklistFeeMultiplierSet` changes fee treatment for every non-whitelisted caller.
- `Paused` and `Unpaused` change whether swaps can execute. Quotes themselves do not check the pause state.

The trading ABI includes these events for cache maintenance while excluding state-update and administration entrypoints. Read `state()` and the other trading-state getters at a consistent block to initialize or refresh the cache. Also process `PunishmentApplied` and `Sync`; freshness can expire on a later block even without any event.

## Swap Errors

| Error | Meaning |
| --- | --- |
| `StalePrice()` | Operator state is stale for execution |
| `SwapImpossible()` | Quote output is zero under current reserves, price, or fees |
| `DeadlineExpired(uint256 deadline)` | Swap or Permit2 deadline has passed |
| `InsufficientOutput(uint256 amountOut,uint256 amountOutMinimum)` | Output is below the requested minimum |
| `InvalidToken(address token)` | Token is not valid for the requested pair or entrypoint |
| `PermitMismatch()` | Permit2 token or amount differs from the swap request |
| `NativeNotSupported()` | Native-input entrypoint was used on a pool whose X token is ERC-20 |
| `NoNativeSent()` | Native input does not match the amount expected by the transfer helper |
| `NativeSendFailed(bytes data)` | Recipient rejected the native-token payout; includes returned revert data |
| `SafeERC20FailedOperation(address token)` | ERC-20 operation reported failure |
| `SafeCastOverflowedUintDowncast(uint8 bits,uint256 value)` | Accounting or reserve value does not fit its storage width |
| `EnforcedPause()` | A swap was attempted while paused |
| `ReentrancyGuardReentrantCall()` | A guarded entrypoint was reentered |

Permit2, token contracts, and checked arithmetic can return additional revert data. Failed transfers are not guaranteed to use a pool-specific error.

The Pool does not compare the received input balance delta with the quoted amount. Do not assume support for fee-on-transfer or rebasing tokens.
