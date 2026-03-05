# Errors and Events

## Events

### Swap

Emitted by the periphery on every successful swap.

```solidity
event Swap(
    address indexed sender,
    address indexed recipient,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOut
);
```

### StateUpdated

Emitted by CurvePMM when an operator updates the pool price and fee.

```solidity
event StateUpdated(StateUpdateParameters state);

struct StateUpdateParameters {
    uint160 pX96;  // New sqrt price in Q64.96 format
    uint48 fee;    // New fee value
}
```

## Errors

| Error                                  | Selector     | Cause                                                                       |
| -------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `SwapImpossible()`                     | `0x4a45e749` | Output is zero — stale operator state or input exceeds active band capacity |
| `StalePrice()`                         | `0x19abf40e` | Operator hasn't updated state within `blockDelay` blocks                    |
| `DeadlineExpired(uint256)`             | `0xbc3088ef` | Permit or swap deadline has passed                                          |
| `InsufficientOutput(uint256, uint256)` | `0x2c19b8b8` | `amountOut < amountOutMinimum` — slippage exceeded                          |
| `PermitMismatch()`                     | `0xceaf57ba` | Permit token/amount doesn't match swap params                               |
| `InvalidToken(address)`                | `0x961c9a4f` | Token is not one of the pool's pair tokens                                  |
| `NativeNotSupported()`                 | `0x0a7287b5` | `swapExactInNative` called on a non-native pool                             |
