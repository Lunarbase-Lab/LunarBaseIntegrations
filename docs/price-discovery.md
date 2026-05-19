# Price Discovery

## On-Chain State

The pool state is operator-driven:

```solidity
function state() external view returns (uint80 anchorPX48, uint24 feeAskX24, uint24 feeBidX24, uint48 latestUpdateBlock);
function anchorPrice() external view returns (uint80 anchorPX48);
function blockDelay() external view returns (uint48);
function concentrationK() external view returns (uint32);
```

- `anchorPX48` is the operator-published anchor sqrt price in Q32.48 form
- `feeBidX24` is the X -> Y fee in Q24 format
- `feeAskX24` is the Y -> X fee in Q24 format
- `latestUpdateBlock` is the block at which operators last refreshed the state
- quotes and swaps depend on this state being fresh under `blockDelay`
- the runtime address used on Base Mainnet is the UUPS proxy `0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99`

## Read-Only Quote Functions

```solidity
function quoteXToY(uint256 dx) external view returns (uint256 dy, uint80 pNext, uint256 fee);
function quoteYToX(uint256 dy) external view returns (uint256 dx, uint80 pNext, uint256 fee);
function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
```

Quote semantics:

- `quoteXToY` and `quoteYToX` are directional and expose post-trade `pNext`
- `quoteExactIn` is the address-routed convenience view
- X -> Y quotes use `anchorPX48` together with `feeBidX24`
- Y -> X quotes use `anchorPX48` together with `feeAskX24`
- stale or impossible quotes return `0` output rather than executing

## Directional `Lx/Ly` Semantics

Current PMM quote math is directional:

- `X -> Y` execution depends on available `Y`-side liquidity
- `Y -> X` execution depends on available `X`-side liquidity

This means the pool can still quote one direction even when only one reserve side is available.

That same directional model is mirrored off-chain in:

- `pmm-math/curve-pmm-math`

## Practical Quote Guidance

- use `quoteXToY` / `quoteYToX` when you already know direction and want `pNext` plus fee
- use `quoteExactIn` when you want a simpler token-address-based integration
- always check freshness indirectly through the returned output or directly via `state()` + `blockDelay()`

## What Price Means For LP Flows

The operator-published `anchorPX48` drives both swap quoting and LP wealth valuation:

- `executeDeposit(...)` uses the current normalized anchor price to mint `principalWealth`
- `executeWithdrawal(...)` uses the current normalized anchor price as `P_settle`
- `claimFees(...)` uses the current normalized anchor price immediately

So the pool's quote state is not only for swaps; it is also the valuation anchor for wealth-based LP settlement.
