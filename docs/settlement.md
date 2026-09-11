# Swap Settlement

Use [Pool.trading.abi.json](../abi/Pool.trading.abi.json) for the integration surface. Calls and approvals for a proxy deployment target the pool's proxy address.

## Exact-Input ERC-20 Swap

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

Amounts use raw token units. Read `X()` and `Y()` to determine the pair and token order.

1. The pool must be unpaused. It validates the token pair, deadline, price freshness, executable output, and `amountOutMinimum`.
2. The pool pulls `amountIn` from `msg.sender`. The direct path requires ERC-20 allowance to the pool. The Permit2 path uses the caller as the permit owner and requires ERC-20 allowance to Permit2, a valid signature, and an unused nonce.
3. Settlement applies the current swap's punishment to the traded direction's stored fee, subject to saturation. That punishment is already included in the current quote.
4. The pool sends the net output to `recipient` from contract custody. There is no swap callback for deferred input payment.
5. The output-token fee is split into partner and treasury accounting buckets. Active reserves are synchronized and `SwapExecuted` is emitted.

For Permit2, `permit.permitted.token` and `permit.permitted.amount` must exactly match `params.tokenIn` and `params.amountIn`. Both `params.deadline` and `permit.deadline` are checked against `block.timestamp`; equality is allowed and the two deadlines need not match. Permit2 is called at `0x000000000022D473030F116dDEE9F6B43aC78BA3`.

A router calling the pool is the pool's `msg.sender`, including for input payment, whitelist treatment, and partner fee attribution. The caller therefore needs the input balance and applicable allowance or permit itself. Simulate quotes with that same caller address.

## Native Input and Output

```solidity
function swapExactInNative(
    address tokenOut,
    address recipient,
    uint256 amountOutMinimum,
    uint256 deadline
) external payable returns (uint256 amountOut);
```

Use this entrypoint when `X() == address(0)`, with `tokenOut == Y()` and the complete input in `msg.value`. To swap ERC-20 Y into native X, use either ERC-20 `swapExactIn` overload with `tokenOut == address(0)`. A contract receiving native output must accept an ETH transfer.

The ERC-20 overloads reject native input. A plain ETH transfer to the pool does not initiate a swap. Wrapped ETH is an ERC-20 and uses the ERC-20 entrypoints.

## Fee Attribution and Active Reserves

The fee is denominated in Y for X → Y and in X for Y → X. For a partner with an operator configured, its share is `floor(fee * partnerInfo(msg.sender).fee / BPS())`, where `BPS() == 1_000_000`; treasury receives the remainder. Configure both the partner operator and its fee before routing swaps. Partner attribution does not add a second fee to the quoted output.

Read `getXReserve()` and `getYReserve()` for active swap inventory. Custody balances also contain accounting buckets excluded from trading, including partner and treasury fees. The gross output must fit the active output reserve before the fee is deducted.

The quote's `pNext` is the unchanged anchor. Successful swaps increase the relevant directional fee when punishment applies; they do not move the anchor. A failed swap reverts token movement and state changes together.
