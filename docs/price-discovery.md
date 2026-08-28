# Price Discovery and Slippage

## On-Chain State

The v0.4.0 pool state is operator-driven:

```solidity
function state()
    external
    view
    returns (
        uint160 anchorPrice,
        uint24 feeAskX24,
        uint24 feeBidX24,
        uint48 latestUpdateBlock
    );

function anchorPrice() external view returns (uint160 anchorPrice);
function maxPunishmentX24() external view returns (uint24);
function blockDelay() external view returns (uint48);
```

- `anchorPrice` is the operator-published sqrt-price in Q64.96 form: `floor(sqrt(P) * 2^96)`
- `feeBidX24` is the stored X -> Y directional fee in Q24 format
- `feeAskX24` is the stored Y -> X directional fee in Q24 format
- `latestUpdateBlock` is the block in which operators last refreshed the state
- `maxPunishmentX24` caps the amount-dependent punishment increment for a swap
- `uint24.max` is treated as the sentinel for conceptual Q24 `100%`

The Rust crate represents `anchorPrice` as `PoolParams.sqrt_price_x96: U256` because Rust has no native `uint160`; v0.4.0 validates that it fits the Solidity `uint160` domain.

## Price Conversion

Let `S = anchorPrice` and `Q96 = 2^96`. The raw-unit price of X in Y is `(S / Q96)^2`.

The contract deliberately follows Solidity integer rounding at each multiplication/division step:

```text
xValueInY(amountX) = floor(floor(amountX * S / Q96) * S / Q96)
yValueInX(amountY) = floor(floor(amountY * Q96 / S) * Q96 / S)
```

For tokens with different decimals, `P` is the raw-unit ratio. Apply token decimal normalization when converting it to a display price.

## Read-Only Quote Functions

```solidity
function quoteXToY(uint256 dx)
    external
    view
    returns (uint256 dy, uint160 pNext, uint256 fee);

function quoteYToX(uint256 dy)
    external
    view
    returns (uint256 dx, uint160 pNext, uint256 fee);

function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn)
    external
    view
    returns (uint256 amountOut);
```

In v0.4.0, conversion is linear at the operator anchor and `pNext` equals the unchanged `anchorPrice`. Amount-dependent execution impact is charged separately through punishment, as described below.

Stale or impossible read-only quotes return zero output. Swap execution reverts instead.

## Directional Fee and Amount-Dependent Punishment

The directional operator fee and slippage punishment are separate inputs to the execution price:

1. `feeBidX24` or `feeAskX24` supplies the currently stored directional fee.
2. The current trade computes a reserve-relative linear `punishmentX24`.
3. The two are added with saturation to obtain the current trade's `effectiveFeeX24`.
4. The effective fee is charged from gross output.

Using Y-denominated wealth:

```text
inventoryWealth = xValueInY(reserveX) + reserveY

swapWealth = xValueInY(amountIn)   for X -> Y
swapWealth = amountIn              for Y -> X

punishmentMaximumX24 =
    2^24                 if maxPunishmentX24 == uint24.max
    maxPunishmentX24     otherwise

rawPunishmentX24 = ceil(
    punishmentMaximumX24 * min(swapWealth / inventoryWealth, 1)
)

punishmentX24 =
    uint24.max           if rawPunishmentX24 >= 2^24
    rawPunishmentX24     otherwise

effectiveFeeX24 = min(uint24.max, storedDirectionalFeeX24 + punishmentX24)
```

Consequences for integrators:

- punishment is linear in the trade's share of active inventory wealth until it reaches the configured cap
- the current quote already includes the current trade's punishment
- after successful settlement, the increased fee is stored only in the traded direction and `PunishmentApplied(...)` is emitted
- a reverted or impossible swap does not persist punishment
- a later operator `upd(...)` replaces the anchor and both directional stored fees
- `state().feeAskX24` / `state().feeBidX24` may therefore include punishment accumulated since the latest operator update
- a non-whitelisted caller may additionally have `blacklistFeeMultiplier` applied to the complete effective fee

The caller's `amountOutMinimum` is independent slippage protection. It is not part of the protocol punishment calculation.

## Off-Chain Arithmetic

Use `lunarbase-pmm-math` v0.4.0 for bit-exact quote, punishment, rounding, saturation, and reserve-transition behavior. Reimplementations must preserve the nested floors and ceiling used above; using floating point for execution values will not be bit-exact.

## What Price Means for LP Flows

The Q64.96 anchor also drives LP wealth valuation:

- `executeDeposit(...)` uses the current normalized anchor price to mint `principalWealth`
- `executeWithdrawal(...)` uses the current normalized anchor price as its settlement price
- `claimFees(...)` uses the current normalized anchor price immediately
