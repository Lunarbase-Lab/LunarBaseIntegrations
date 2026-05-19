# Settlement

## Swap Settlement

### Exact-Input ERC-20 Swap

```solidity
struct ExactInputParams {
    address tokenIn;
    address tokenOut;
    address recipient;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint256 deadline;
}

function swapExactIn(ExactInputParams calldata params) external returns (uint256 amountOut);

function swapExactIn(
    ExactInputParams calldata params,
    ISignatureTransfer.PermitTransferFrom calldata permit,
    bytes calldata signature
) external returns (uint256 amountOut);
```

Flow:

1. Caller chooses the direct path or the Permit2 path
2. The pool validates direction, deadline, freshness, and minimum output
3. The pool transfers output tokens directly from contract custody
4. Partner / treasury fee accounting is updated
5. Reserves are synchronized

### Native `X` Swap

```solidity
function swapExactInNative(
    address tokenOut,
    address recipient,
    uint256 amountOutMinimum,
    uint256 deadline
) external payable returns (uint256 amountOut);
```

Use this only when `X() == address(0)`.

## LP Deposit Settlement

```solidity
struct DepositLiquidityParams {
    address lp;
    uint256 amountX;
    uint256 amountY;
    uint256 minUsedX;
    uint256 minUsedY;
    uint256 deadline;
}

function requestDeposit(DepositLiquidityParams calldata params) external payable;
function executeDeposit(address lp) external;
```

Flow:

1. Pool must be paused
2. Configured depositor escrows `amountX` / `amountY` into the pool
3. Owner executes the request
4. `executeDeposit(...)` values accepted amounts using the current normalized `anchorPX48`
5. The position receives `principalWealth`
6. A new lock tranche is appended

Notes:

- one-sided deposits are supported
- `minUsedX` / `minUsedY` are enforced on execute
- request time does not mint wealth

## LP Withdrawal Settlement

```solidity
enum WithdrawalMode {
    X,
    Y,
    Split
}

struct WithdrawalParams {
    uint32 positionId;
    address recipient;
    WithdrawalMode mode;
    uint256 minAmountOutX;
    uint256 minAmountOutY;
    uint256 deadline;
}

function requestWithdrawal(WithdrawalParams calldata params) external;
function executeWithdrawal(uint32 positionId) external;
```

Flow:

1. Pool must be paused
2. Operator requests withdrawal
3. APR accrual is settled and then frozen
4. Owner executes later
5. `executeWithdrawal(...)` computes the current penalty on still-locked wealth
6. Net principal wealth and pending yield wealth are converted using the current normalized `anchorPX48`
7. Principal is paid from active liquidity and the yield-funded component is debited from treasury buckets

Settlement modes:

- `X` — all settled wealth requested in `X`
- `Y` — all settled wealth requested in `Y`
- `Split` — half the settled wealth stays in `Y`, half is converted to `X`

## Yield Claim Settlement

```solidity
struct ClaimFeesParams {
    uint32 positionId;
    WithdrawalMode mode;
    uint256 minAmountOutX;
    uint256 minAmountOutY;
}

function claimFees(ClaimFeesParams calldata params) external;
```

Flow:

1. Operator calls `claimFees(...)`
2. Fixed APR is settled into `pendingYieldWealth`
3. Current normalized `anchorPX48` is used immediately
4. Requested wealth is converted to `X`, `Y`, or `Split`
5. Treasury inventory must already contain the requested token mix
6. Tokens are transferred to `feeRecipient`

Important:

- `claimFees(...)` is not pause-gated
- successful claims are subject to a fixed `12 hours` cooldown
- the protocol does not auto-convert treasury `Y` into `X` to satisfy `X` claims
