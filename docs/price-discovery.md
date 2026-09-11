# Price Discovery and Slippage

The current Pool uses a fixed operator anchor with immediate, stateful directional
punishment. Swaps do not move the anchor along a concentration curve. This guide
describes the Pool's quote behavior and the `lunarbase-pmm-math` 0.4.1 API.

## On-Chain State

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

function anchorPrice() external view returns (uint160);
function getXReserve() external view returns (uint112);
function getYReserve() external view returns (uint112);
function maxPunishmentX24() external view returns (uint24);
function blockDelay() external view returns (uint48);
function isFresh() external view returns (bool);
function paused() external view returns (bool);
function isWhitelisted(address account) external view returns (bool);
function blacklistFeeMultiplier() external view returns (uint256);
```

- `anchorPrice` is the Q64.96 sqrt-price: `floor(sqrt(Praw) * 2^96)`.
- `feeBidX24` applies to X -> Y; `feeAskX24` applies to Y -> X. These stored
  fees already include successful swaps' punishment since the last operator update.
- Reserves are active inventory after reserved balances and global fee buckets
  are excluded. Do not substitute the Pool's raw token balances.
- `maxPunishmentX24` caps the increment requested by one trade; zero disables it.
- Q24 uses denominator `2^24`. The largest stored `uint24`, `0xffffff`, is a
  sentinel for conceptual 100% for fees and the maximum punishment.
- `latestUpdateBlock` changes on operator `upd(...)`, not on a swap. Freshness is
  strictly `block.number < latestUpdateBlock + blockDelay`; equality is stale.

Read all fields from the same block and resolve whitelist status for the exact
address that will call the Pool. See [Off-Chain Integration](offchain-integration.md).

## Price Conversion

Let `S = anchorPrice` and `Q96 = 2^96`. The raw-unit price of X in Y is
`Praw = (S / Q96)^2`. For display, Y tokens per X token is
`Praw * 10^(decimalsX - decimalsY)`.

Execution preserves two separate floor operations:

```text
xValueInY(amountX) = floor(floor(amountX * S / Q96) * S / Q96)
yValueInX(amountY) = floor(floor(amountY * Q96 / S) * Q96 / S)
```

Do not collapse either expression into a single division, use floating point,
or round a displayed price back into an execution anchor. The library's
`priceToSqrtPriceX96` / Rust `price_to_sqrt_price_x96` are lossy convenience
helpers; use the exact on-chain anchor for quotes. A zero anchor yields zero
quote output in both directions, without inverse division by zero.

## Read-Only Quotes and Execution

```solidity
function quoteXToY(uint256 dx)
    external view returns (uint256 dy, uint160 pNext, uint256 fee);

function quoteYToX(uint256 dy)
    external view returns (uint256 dx, uint160 pNext, uint256 fee);

function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn)
    external view returns (uint256 amountOut);
```

`pNext` always equals the unchanged anchor. `fee` is denominated in the output
token. Unlike the off-chain result, the public Solidity quote tuple does not
return `effectiveFeeX24`.

The gross anchor-converted output must fit the output active reserve **before**
fees are deducted. Gross output zero or above that reserve produces zero output
and zero fee. A full effective fee also produces zero output, but returns the
entire gross output as fee. Stale read-only quotes return `(0, anchorPrice, 0)`.
Invalid token pairs and checked arithmetic failures can still revert.

Public quote views do not check `paused()`: a positive quote can coexist with
paused swaps. A positive quote also does not check input-reserve `uint112`
headroom or predict token-transfer/accounting success. Executing a swap checks
pause state, freshness, nonzero output, deadline and `amountOutMinimum`, and can
revert in later settlement. The quote itself never mutates state.

## Immediate Directional Punishment

Compute the current trade's punishment from the **pre-swap active reserves**:

```text
Q24 = 2^24
MAX_U24 = Q24 - 1
inventoryWealth = xValueInY(reserveX) + reserveY
swapWealth = xValueInY(amountIn)   for X -> Y
swapWealth = amountIn              for Y -> X
maximum = Q24 if maxPunishmentX24 == MAX_U24 else maxPunishmentX24

rawDesired = ceil(maximum * min(swapWealth, inventoryWealth) / inventoryWealth)
desiredPunishmentX24 = min(MAX_U24, rawDesired)
effectiveFeeX24 = min(MAX_U24, storedDirectionalFeeX24 + desiredPunishmentX24)
```

Punishment is zero if input, configured maximum, anchor, inventory wealth or
swap wealth is zero. Preserve the single ceiling operation above; do not
integer-divide the wealth ratio first.

The current trade is priced with `effectiveFeeX24`, including its own punishment.
For an ordinary successful settlement, the traded direction stores that fee;
the other direction is unchanged. The applied increment is
`effectiveFeeX24 - storedDirectionalFeeX24`, which can be smaller than the desired
increment because of saturation. `PunishmentApplied` is emitted only when a
positive increment is actually stored. A reverted swap persists neither the
increment nor the reserve changes.

Operator `upd(...)` replaces the anchor and both accumulated fees,
starting a new pricing epoch. A swap's punishment does not refresh this epoch's
block deadline.

## Fee Rounding and Caller Multiplier

For the address seen by the Pool as `msg.sender`:

```text
multiplier = 1 if isWhitelisted(caller) else blacklistFeeMultiplier()
```

This may be a router or settlement contract, rather than the recipient or taker
EOA. Set `from` to that caller for direct `eth_call` comparisons. The public
`blacklistFeeMultiplier()` getter normalizes an unset stored zero to one.

Fee deduction follows this order:

```text
if effectiveFeeX24 == MAX_U24:
    fee = grossOutput
else:
    baseFee = floor(grossOutput * effectiveFeeX24 / Q24)
    fee = baseFee                         if multiplier <= 1 or baseFee == 0
    fee = min(grossOutput, baseFee * multiplier) otherwise
    # Overflow of baseFee * multiplier also means fee = grossOutput.

amountOut = grossOutput - fee
```

The multiplier is applied **after** flooring the base fee; multiplying Q24 fee
units first changes rounding. `effectiveFeeX24` in off-chain results is the
directional fee before the caller multiplier, and only that unmultiplied fee is
persisted. For example, gross output `10000`, fee `floor(2^24 / 100) = 167772`
and multiplier `3` produce base fee `99`, charged fee `297`, and output `9703`.

The caller's `amountOutMinimum` is independent execution protection. It does not
participate in protocol punishment or fee calculation.

## Sequential Swaps

Repeated quotes against an unchanged snapshot describe independent alternatives.
They do not model a split execution: every successful chunk changes reserves and
the traded directional fee. Chain successful simulations, using each resulting
state for the next chunk. Under the current mechanism, splitting can increase
aggregate output; summing unchanged-snapshot quotes is not a valid estimate of
that effect. See [simulation APIs](offchain-integration.md#quotes-and-sequential-simulations).
