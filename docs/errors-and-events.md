# Errors and Events

## Events

### Swap and Pricing

Emitted directly by `Pool`:

```solidity
event SwapExecuted(
    address recipient,
    bool xToY,
    uint256 dx,
    uint256 dy,
    uint256 fee
);
event StateUpdated(StateUpdateParameters state);
event Sync(uint128 reserveX, uint128 reserveY);

struct StateUpdateParameters {
    uint160 pX96;  // New sqrt price in Q64.96 format
    uint48 fee;    // New fee value
}
```

### Liquidity Lifecycle

```solidity
event DepositRequested(address indexed pool, address indexed lp, uint256 amountX, uint256 amountY);
event DepositRequestCancelled(address indexed pool, address indexed lp, address indexed canceller);
event DepositExecuted(
    address indexed pool,
    address indexed lp,
    uint32 positionId,
    uint256 usedX,
    uint256 usedY,
    uint256 wealthMinted
);
event WithdrawalRequested(
    address indexed pool,
    uint48 indexed positionId,
    address operator,
    address recipient,
    uint8 mode
);
event WithdrawalRequestCancelled(address indexed pool, uint48 indexed positionId, address indexed canceller);
event WithdrawalExecuted(
    address indexed pool,
    uint48 indexed positionId,
    address indexed recipient,
    uint8 mode,
    uint256 amountX,
    uint256 amountY,
    uint256 settlePriceWad
);
event FeesClaimed(
    address indexed pool,
    uint48 indexed positionId,
    address indexed feeRecipient,
    uint8 mode,
    uint256 amountX,
    uint256 amountY,
    uint256 settlePriceWad
);
event LpConfigUpdated(
    address indexed pool,
    address indexed lp,
    address depositor,
    address feeRecipient,
    address operator,
    uint32 yieldRate,
    uint32 penaltyBps,
    uint32 lockDuration
);
```

### Admin and Fee Management

```solidity
event BlockDelaySet(uint48 blockDelay);
event ConcentrationKSet(uint32 concentrationK);
event PartnerFeeSet(address indexed router, uint32 fee);
event PartnerFeeTaken(address indexed router, uint256 partnerFeeX, uint256 partnerFeeY);
event PartnerOperatorSet(address indexed router, address indexed operator);
event PartnerFeesWithdrawn(address indexed router, address indexed operator, uint256 amountX, uint256 amountY);
event TreasurySet(address indexed treasury);
event TreasuryFeesWithdrawn(address indexed treasury, uint256 amountX, uint256 amountY);
event WithdrawCooldownSet(uint32 previousWithdrawCooldown, uint32 currentWithdrawCooldown);
event Paused(address account);
event Unpaused(address account);
event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
```

## Errors

The `Pool` ABI now exposes the following custom errors.

### Swap and Pricing

- `AmountXExceedsLiquidity()`
- `AmountXPriceOverflow()`
- `InvalidParams()`
- `InvalidSqrtRatioAX96()`
- `LiquidityIsZero()`
- `NativeNotSupported()`
- `PM__DeadlineExpired()`
- `PM__MinAmountOutNotMet()`
- `PM__ZeroAmount()`
- `SqrtPriceIsZero()`
- `SqrtPriceUnderflow()`

### LP and Position Management

- `InvalidWithdrawCooldown(uint32)`
- `PM__ClaimCooldown()`
- `PM__InvalidAddress()`
- `PM__InvalidBps()`
- `PM__InvalidPool()`
- `PM__InvalidRequestStatus()`
- `PM__LpNotConfigured()`
- `PM__MinUsedNotMet()`
- `PM__NoPendingFees()`
- `PM__NoPosition()`
- `PM__NoPrincipal()`
- `PM__NotAuthorized()`
- `PM__PendingWithdrawal()`
- `PM__PoolNotPaused()`
- `PM__RequestExists()`
- `PM__TreasuryUnderfunded()`

### Fee Management

- `FeeManager__InvalidFee()`
- `FeeManager__InvalidOperator()`
- `FeeManager__InvalidRouter()`
- `FeeManager__NoFees()`
- `FeeManager__NotPartnerOperator(address router, address caller)`
- `FeeManager__NotTreasury()`
- `FeeManager__PartnerWithdrawCooldown(address router)`
- `FeeManager__ZeroAddress()`

### Access Control and Runtime Guards

- `EnforcedPause()`
- `ExpectedPause()`
- `OwnableInvalidOwner(address owner)`
- `OwnableUnauthorizedAccount(address account)`
- `ReentrancyGuardReentrantCall()`
- `SafeCastOverflowedUintDowncast(uint8 bits, uint256 value)`
- `UnauthorisedAccess(address accessor)`
