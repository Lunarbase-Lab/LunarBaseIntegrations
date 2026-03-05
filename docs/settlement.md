# Settlement

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
}
```

**Flow:**

1. User approves the canonical Permit2 contract once (standard ERC-20 `approve`)
2. User signs a per-swap permit off-chain (gasless)
3. Call `swapExactIn` with swap params, permit, and signature
4. Periphery validates the permit, transfers tokens via Permit2, executes the swap, and sends output to `recipient`

## Native ETH Swap

For pools where token X is `address(0)`:

```solidity
function swapExactInNative(
    ExactInputNativeParams calldata params
) external payable returns (uint256 amountOut);

struct ExactInputNativeParams {
    address tokenOut;
    address recipient;
    uint256 deadline;
    uint256 amountOutMinimum;
}
```

Send the ETH amount as `msg.value`. No Permit2 signature needed.

## Permit2 Integration

| Detail         | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Contract       | `0x000000000022D473030F116dDEE9F6B43aC78BA3` (canonical, all EVM chains) |
| Permit fields  | `token`, `amount`, `nonce` (replay protection), `deadline`               |
| Approval model | Approve Permit2 once, sign per-swap permits off-chain                    |

## Gas Estimates

| Path                               | Estimated Gas     |
| ---------------------------------- | ----------------- |
| `quoteExactIn`                     | 0 (view function) |
| `swapExactIn` (ERC-20 via Permit2) | ~120k–150k        |
| `swapExactInNative` (native ETH)   | ~80k–110k         |
