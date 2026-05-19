# Errors and Events

This page summarizes the main externally visible events and custom errors across the current `Pool` runtime.

## Pool Events

```solidity
event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee);
event StateUpdated(uint80 anchorPrice, uint24 feeAskX24, uint24 feeBidX24);
event BlockDelaySet(uint48 blockDelay);
event ConcentrationKSet(uint32 concentrationK);
event WhitelistSet(address indexed account, bool whitelisted);
event BlacklistFeeMultiplierSet(uint256 multiplier);
event Sync(uint128 reserveX, uint128 reserveY);
```

What they mean:

- `SwapExecuted` - exact-input swap completed
- `StateUpdated` - operator wrote a new `anchorPX48` plus direction-specific `feeAskX24` / `feeBidX24`
- `BlockDelaySet` - owner changed staleness window
- `ConcentrationKSet` - owner changed PMM concentration
- `WhitelistSet` - owner changed whether an account pays the base fee or the blacklist multiplier
- `BlacklistFeeMultiplierSet` - owner changed the extra fee multiplier for non-whitelisted swappers
- `Sync` - cached reserves were refreshed from balances

## Position Manager Events

```solidity
event DepositRequested(address indexed pool, address indexed lp, uint256 amountX, uint256 amountY);
event DepositExecuted(address indexed pool, address indexed lp, uint32 positionId, uint256 usedX, uint256 usedY, uint256 wealthMinted);
event WithdrawalRequested(address indexed pool, uint48 indexed positionId, address operator, address recipient, WithdrawalMode mode);
event WithdrawalExecuted(
    address indexed pool,
    uint48 indexed positionId,
    address indexed recipient,
    WithdrawalMode mode,
    uint256 amountX,
    uint256 amountY,
    uint256 settlePriceWad
);
event FeesClaimed(
    address indexed pool,
    uint48 indexed positionId,
    address indexed feeRecipient,
    WithdrawalMode mode,
    uint256 amountX,
    uint256 amountY,
    uint256 settlePriceWad
);
event DepositRequestCancelled(address indexed pool, address indexed lp, address indexed canceller);
event WithdrawalRequestCancelled(address indexed pool, uint48 indexed positionId, address indexed canceller);
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
event ClaimCooldownSet(uint32 previousClaimCooldown, uint32 currentClaimCooldown);
```

What they mean:

- `DepositExecuted` reports raw token usage plus minted wealth
- `WithdrawalExecuted` reports final token payout plus settlement price
- `FeesClaimed` reports fixed APR yield claim payout plus settlement price
- `ClaimCooldownSet` reports an owner update to the LP claim cooldown

## Fee Manager Events

```solidity
event PartnerFeeSet(address indexed router, uint32 fee);
event PartnerOperatorSet(address indexed router, address indexed operator);
event PartnerFeeTaken(address indexed router, uint256 partnerFeeX, uint256 partnerFeeY);
event PartnerFeesWithdrawn(address indexed router, address indexed operator, uint256 amountX, uint256 amountY);
event TreasurySet(address indexed treasury);
event WithdrawCooldownSet(uint32 previousWithdrawCooldown, uint32 currentWithdrawCooldown);
event TreasuryFeesWithdrawn(address indexed treasury, uint256 amountX, uint256 amountY);
```

## Main Pool Errors

| Error                                  | Meaning                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `UnauthorisedAccess(address)`          | Caller is not one of the immutable operators               |
| `InvalidParams()`                      | Constructor or admin parameters are invalid                |
| `StalePrice()`                         | Operator state is stale for execution                      |
| `SwapImpossible()`                     | Current reserves / state cannot support the requested swap |
| `InputAmountMismatch(uint256,uint256)` | Observed input transfer differs from expected amount       |
| `DeadlineExpired(uint256)`             | Swap deadline has passed                                   |
| `InsufficientOutput(uint256,uint256)`  | Swap output is below `amountOutMinimum`                    |
| `InvalidToken(address)`                | Token is not valid for the chosen direction                |
| `PermitMismatch()`                     | Permit2 data does not match the swap request               |
| `NativeNotSupported()`                 | Native flow is invalid for the current pair                |

## Main Position Manager Errors

| Error                        | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `PM__PoolNotPaused()`        | LP request/execute flow requires a paused pool                       |
| `PM__InvalidBps()`           | Yield or penalty basis points are out of range                       |
| `PM__InvalidAddress()`       | Zero or invalid address in LP flow                                   |
| `PM__ZeroAmount()`           | Amounts or resulting wealth are zero                                 |
| `PM__NoPrincipal()`          | Position has no principal left                                       |
| `PM__InvalidRequestStatus()` | Request is not in the expected lifecycle state                       |
| `PM__NotAuthorized()`        | Caller is not the configured depositor/operator/owner for the action |
| `PM__NoPendingFees()`        | No claimable fixed APR yield is available                            |
| `PM__DeadlineExpired()`      | Deposit or withdrawal request deadline passed                        |
| `PM__MinUsedNotMet()`        | Deposit execution did not satisfy `minUsedX` / `minUsedY`            |
| `PM__MinAmountOutNotMet()`   | Withdrawal or claim did not satisfy requested minimum outputs        |
| `PM__LpNotConfigured()`      | LP config does not exist                                             |
| `PM__NoPosition()`           | Position id does not exist                                           |
| `PM__ClaimCooldown()`        | Fixed APR yield claim cooldown is still active                       |
| `PM__RequestExists()`        | Another pending request already exists                               |
| `PM__TreasuryUnderfunded()`  | Treasury bucket cannot fund requested yield payout mix               |
| `PM__PendingWithdrawal()`    | Active position already has a pending withdrawal                     |

## Main Fee Manager Errors

| Error                                             | Meaning                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `FeeManager__ZeroAddress()`                       | Required address is zero                          |
| `FeeManager__NoFees()`                            | Requested fee bucket is empty                     |
| `FeeManager__InvalidRouter()`                     | Invalid partner router address                    |
| `FeeManager__InvalidOperator()`                   | Invalid partner operator address                  |
| `FeeManager__InvalidFee()`                        | Partner fee is out of range                       |
| `FeeManager__NotPartnerOperator(address,address)` | Caller is not the configured partner operator     |
| `FeeManager__PartnerWithdrawCooldown(address)`    | Partner cooldown has not elapsed                  |
| `FeeManager__NotTreasury()`                       | Caller is not the treasury address                |
| `InvalidWithdrawCooldown(uint32)`                 | Configured partner withdrawal cooldown is invalid |
