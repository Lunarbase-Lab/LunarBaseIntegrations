# Settlement

## ERC-20 Swap (pre-approved input token)

```solidity
function swapExactIn(
    ExactInputParams calldata params
) external returns (uint256 amountOut);
```

```solidity
struct ExactInputParams {
    address tokenIn;
    address tokenOut;
    address recipient;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint256 deadline;
}
```

This overload is the direct `Pool` entry point when the caller has already approved the pool for `tokenIn`.

## ERC-20 Swap (via Permit2)

```solidity
function swapExactIn(
    ExactInputParams calldata params,
    ISignatureTransfer.PermitTransferFrom calldata permit,
    bytes calldata signature
) external returns (uint256 amountOut);

struct ExactInputParams {
    address tokenIn;
    address tokenOut;
    address recipient;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint256 deadline;
}
```

**Flow:**

1. User approves the canonical Permit2 contract once (standard ERC-20 `approve`)
2. User signs a per-swap permit off-chain (gasless)
3. The signed Permit2 payload binds `spender` to the `Pool` address
4. Call the Permit2 overload of `swapExactIn` with swap params, permit, and signature
5. `Pool` validates the permit, pulls tokens through Permit2, executes the swap, and sends output to `recipient`

## Native ETH Swap

For pools where token X is `address(0)`:

```solidity
function swapExactInNative(
    address tokenOut,
    address recipient,
    uint256 amountOutMinimum,
    uint256 deadline
) external payable returns (uint256 amountOut);
```

Send the ETH amount as `msg.value`. No Permit2 signature needed.

## Liquidity Lifecycle On The Same ABI

`Pool` also exposes LP request and execution functions directly:

```solidity
function requestDeposit(DepositLiquidityParams calldata params) external payable;
function executeDeposit(address lp) external;
function requestWithdrawal(WithdrawalParams calldata params) external;
function executeWithdrawal(uint32 positionId) external;
function claimFees(ClaimFeesParams calldata params) external;
```

Use `getDepositRequest`, `getWithdrawalRequest`, `getPosition`, `getLpConfig`, `previewClaimableWealth`, and `previewWithdrawalWealth` to inspect state before submitting LP operations.

## Permit2 Integration

| Detail         | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Contract       | `0x000000000022D473030F116dDEE9F6B43aC78BA3` (canonical, all EVM chains) |
| Signed fields  | `token`, `amount`, `nonce`, `deadline`, `spender = Pool`                 |
| Approval model | Approve Permit2 once, sign per-swap permits off-chain                    |

## Gas Estimation

Gas depends on the swap path, reserve state, and whether Permit2 is used. Estimate each transaction against the target `Pool` address via `eth_estimateGas` instead of relying on a fixed number.
