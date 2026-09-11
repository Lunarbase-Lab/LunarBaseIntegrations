# Off-Chain Integration

Use [`lunarbase-pmm-math`](https://github.com/Lunarbase-Lab/lunarbase-pmm-math)
to reproduce the current Pool's integer quote and directional-punishment math.
The API examples use version `0.4.1`. Check that your installed package
provides the quote, simulation and order-book APIs used by your integration.

| Package | Implementation | Current scope |
| --- | --- | --- |
| Rust `lunarbase-pmm-math` | Pure Rust core | Quotes, simulation, order books and fee-accounting preflight |
| Node `@lunarbase-lab/pmm-math` | Native Rust binding | Quotes, simulation, order books and fee-accounting preflight |
| Go `github.com/Lunarbase-Lab/lunarbase-pmm-math/math/go` | Pure Go mirror | Quotes and mutable standard-token simulation |

These packages do not fetch chain state, sign orders or execute swaps. The
current Node native targets are macOS arm64, Linux x64 glibc (2.17+), Linux
arm64 glibc and Linux x64 musl. Build requirements are Rust 1.90+, Go
1.22+ and Node 18+; check that a matching native package exists for your runtime.

## One Coherent, Caller-Specific Snapshot

Read the following views at one block hash, retaining its number and hash:

| Input | Public source |
| --- | --- |
| Token identities | `X()` and `Y()` |
| Anchor, ask, bid, latest update block | `state()` |
| Active reserves | `getXReserve()` and `getYReserve()` |
| Maximum punishment | `maxPunishmentX24()` |
| Freshness window and pause state | `blockDelay()` and `paused()` |
| Execution caller's fee policy | `isWhitelisted(caller)` and `blacklistFeeMultiplier()` |

The caller is the direct `msg.sender` seen by the Pool, including an execution
adapter or router. Cache separate caller policies and use the same caller as
`from` when comparing with public on-chain quote views.

Validate the Solidity widths: anchor `uint160`, active reserves `uint112`, Q24
fields `uint24`, latest update and block delay `uint48`. Preserve raw token
units. Neither `PoolParams` nor the basic quote functions include pause/freshness
inputs, so the surrounding service must reject paused, unhealthy and stale
snapshots. Freshness requires `executionBlock < latestUpdateBlock + blockDelay`.

The upstream [canonical snapshot example](https://github.com/Lunarbase-Lab/lunarbase-pmm-math/tree/main/examples/offchain-quoting)
uses acknowledged WebSocket `newHeads`, verifies each observed number/hash over
HTTP, and pins every `eth_call` using EIP-1898
`{ "blockHash": "0x…", "requireCanonical": true }`. It marks the cache unhealthy
before refresh and publishes the complete caller snapshot plus an expiring
health lease atomically in Redis. Errors, disconnects, expired leases and RPCs
without the required hash selector disable quoting. It serves canonical head
snapshots; a canonical head is not a finality guarantee.

The example does not apply `pendingLogs`, `newFlashblocks` or individual Pool
events to quote state. If building a different event cache, apply complete
transaction/block changes atomically, retain hashes for reorg recovery, and
reconcile against block-pinned reads. Relevant invalidations include
`StateUpdated`, `PunishmentApplied`, `Sync`, maximum-punishment/freshness/pause
changes and the execution caller's whitelist or multiplier changes. Other Pool
operations can also affect reserves and accounting. An unchanged operator anchor
does not imply an unchanged quote.

## Quotes and Sequential Simulations

| Operation | Rust | Go | Node |
| --- | --- | --- | --- |
| Checked X -> Y quote with caller fee | `try_quote_x_to_y_with_multiplier` | `QuoteXToYWithMultiplierChecked` | `quoteXToY` |
| Checked Y -> X quote with caller fee | `try_quote_y_to_x_with_multiplier` | `QuoteYToXWithMultiplierChecked` | `quoteYToX` |
| Standard-token state transition | `try_simulate_successful_swap` with `Direction` | `SimulateStandardTokenSwapWithMultiplier` with direction | `simulateXToY` / `simulateYToX` |

All quote results include net output, unchanged anchor, output-token fee and the
current trade's `effectiveFeeX24` before caller multiplication. Rust uses
`U256` for the anchor and amounts, and `u128` for width-checked reserves. Go
uses `*uint256.Int` for anchor, reserves and amounts; mutable simulation requires
distinct state pointers and no result/input aliasing.

Rust `try_*` functions return math/domain errors; convenience quote wrappers
panic on those failures. Go `*Checked` variants return errors; convenience
quotes panic. Node rejects malformed domains and math failures with exceptions.
A zero-output quote is a modeled rejection, not necessarily a math error.
See [Price Discovery](price-discovery.md) for precise rounding and fee sentinels.

Node passes large integers as strict decimal or `0x`-hex strings. Decimal strings
have no sign, whitespace or leading zeros except `"0"`, are limited to 78 digits
and must fit `uint256`; hex is limited to 64 digits. Q24 fields are finite integer
numbers in `[0, 0xffffff]`. `QuoteParams.maxPunishmentX24` defaults to zero and
`feeMultiplier` defaults to one: **supply both from the snapshot explicitly**.
Order-book builders require both fields.

This example shows how to chain Node simulations after the caller snapshot has
passed the service's freshness and pause checks:

```ts
import {
  simulateXToY,
  SwapSimulationStatus,
  type QuoteParams,
} from "@lunarbase-lab/pmm-math";

export function simulateXToYChunks(
  initial: Required<Omit<QuoteParams, "amountIn">>,
  chunks: string[],
) {
  let current = { ...initial };
  let totalOut = 0n;
  for (const amountIn of chunks) {
    const result = simulateXToY({ ...current, amountIn });
    if (result.status !== SwapSimulationStatus.Applied) {
      throw new Error(`Chunk did not apply: ${result.status}`);
    }
    totalOut += BigInt(result.amountOut);
    current = {
      ...current,
      feeAskX24: result.feeAskX24After,
      feeBidX24: result.feeBidX24After,
      reserveX: result.reserveXAfter,
      reserveY: result.reserveYAfter,
    };
  }
  return { totalOut: totalOut.toString(), state: current };
}
```

In Rust, chain each simulation's `effective_params()` after checking
`SimulationStatus::Applied`. Go commits successful simulations into `PoolParams`.
Its `SwapImpossible` and `ReserveTransitionOverflow` results are structured
rollback outcomes (`Executable == false`), while domain/arithmetic failures are
errors. All modeled rollbacks retain the original reserves and stored fees and
have zero applied punishment, while retaining the attempted quote and desired
punishment. Reusing unchanged quote inputs for every chunk does not simulate
this sequence; split executions can have different total output from one swap.

For standard tokens and fully credited fees, X -> Y changes active reserves to
`reserveX + amountIn` and `reserveY - (amountOut + fee)`; Y -> X is symmetric.
An applied simulation covers this math and its numeric bounds. It does not
predict token callbacks, rebasing, transfer taxes, later accounting/transfer
reverts or other transactions. Rust `mark_rolled_back` and Go `MarkRolledBack`
can model a known later revert; Go refuses to overwrite state changed after the
simulated commit. Node exposes `LaterRevert` in its status enum but its pure
simulation functions do not generate that outcome automatically.

## Order Books and Their Coverage

Rust and Node offer three builders; Go currently has no order-book API:

| Rust / Node | Output and coverage |
| --- | --- |
| `try_build_order_book` / `buildOrderBook` | Indicative ladders, conservative at emitted cumulative input prefixes |
| `try_build_validated_order_book` / `buildValidatedOrderBook` | Conservative flat directional prices after exhaustive finite-policy validation |
| `try_build_precise_order_book` / `buildPreciseOrderBook` | Up to 20 conservative levels per direction, fitted under the same finite model |

Each `{ size, price }` level uses cumulative raw input size and marginal raw
output/input price scaled by `1e18`. The exact promised output is the sum of
`floor(consumedInput * price / 1e18)` over consumed tranches, starting at the
direction's lifetime input cursor. Use Rust
`try_ladder_amount_out_at_cursor` or Node `ladderAmountOut(levels, amountIn, cursor)`;
requests beyond depth return `None` / `null`. Do not round-trip through VWAP.
Even merging equal-price levels can remove a floor and increase promised output.

Builders require a complete snapshot, caller multiplier and an explicit
`maxExecutionBlock` covering the signed lifetime. They return empty books for
paused/stale state; equality with `latestUpdateBlock + blockDelay` is stale.
Require active status **and non-empty levels for each published direction**.
Indicative books keep `safety: "indicative"`: independent prefix samples do not
certify arbitrary partial fills, consumed-cursor fills or future punishment.

Validated books use optional per-direction `FillPolicy` values
`minInput`, `lotInput`, `maxInput`, `totalInput`. Every allowed reachable
lot-aligned fill and both-direction interleaving is simulated. The adapter must
enforce this exact policy and track directional lifetime cursors/caps. A successful
active result has `safety: "exhaustiveLotPolicy"`, its input snapshot/policy and
coverage counters. `maxTransitions` is an integer in `1..100000`; budget exhaustion
returns an error, without a partial certificate.

Before signing a validated or precise book, run Rust
`try_validate_fee_accounting_capacity` or Node `validateFeeAccountingCapacity`
against the same snapshot and policy. Its `FeeAccountingState` includes the
actual caller's partner share and operator presence, treasury/global partner
buckets and that caller's cumulative partner fee buckets. Partner share uses
**`1_000_000`**, separate from Q24 and the `10000` denominator of conventional
basis points. Preflight rejects a positive share without an operator or inadequate
conservative `uint112` bucket headroom.

Also reconcile initial stored active reserves with raw balances minus reserved
balances and global fee buckets. Unsynced donations are absent
from `PoolParams`, but affect the next on-chain sync. Standard token behavior
and fully credited fees are prerequisites for the certified reserve transitions.
The certificate covers the finite quote/reserve/punishment model, not arbitrary
EVM call success, external Pool updates or concurrently live quote generations.

Precise fitting accepts `maxLevels` in `1..20`, `targetUnderquoteBps` in
`0..10000` and a separate `maxWork` budget in `1..5000000`. Its measured
`worstUnderquoteBps` compares the ladder with the **worst reachable state for
the same direction, cursor and fill size**. `worstFreshSnapshotDiscountBps`
separately compares it with the initial snapshot's same-size quote. A small
fitting gap can coexist with a larger fresh-snapshot discount. Require
`targetMet` before claiming the requested tolerance; it is not guaranteed by
the requested configuration. Missing the target retains the finite model's
conservatism and does not prove that every possible ladder is infeasible.

Retire paired directional generations together. Stopping publication or replacing
one side does not revoke previously signed orders or reset their executable caps.
Both sides also need rebuilding after an ordinary swap: changed reserves alter
the punishment denominator for either direction.

Every builder requires settlement protection: pass the executing system's exact
promised output as the Pool's `amountOutMinimum`, preserve the enforced policy
and signed lifetime, and invalidate/rebuild generations on relevant state changes.
Revalidate any protocol-specific packing, price rounding, level merging or cursor
conversion. See the upstream [order-book guide](https://github.com/Lunarbase-Lab/lunarbase-pmm-math/blob/main/docs/order-book.md)
for the full coverage and generation rules.

## Validating an Integration

For an integration check, compare both quote directions at one canonical block
with identical caller, raw amounts and state. Include tiny rounded-to-zero inputs,
gross-output reserve exhaustion, fee/punishment sentinels, caller multipliers,
stale-boundary handling and sequential chunks. Test the actual adapter's
`amountOutMinimum`, cursor and fill-policy enforcement separately from the math.
