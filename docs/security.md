# Security

## Main Protections

- immutable operator set for `upd(...)`
- owner-controlled pause / unpause
- staleness guard via `blockDelay`
- `ReentrancyGuardTransient` on state-mutating external flows
- Solidity `0.8.31` overflow / underflow checks
- minimum-output and deadline checks on swaps, withdrawals, and claims
- paused-only LP request/execute flow for deposits and withdrawals

## Access Model

- `owner` controls pause, fee configuration, treasury configuration, and LP config
- immutable `operator1..5` control price and fee updates
- LP `depositor` creates deposits
- LP `operator` creates withdrawals and claims yield
- `feeRecipient` receives `claimFees(...)` payouts
- partner fee withdrawals require the configured partner operator
- treasury fee withdrawals require the treasury address

## Staleness Model

Swaps and valuation depend on fresh operator state:

- if operators stop updating `anchorPX48`, swaps revert on `StalePrice()`
- read-only quotes return zero output under stale state
- LP deposit valuation, withdrawal settlement, and yield claims all use the current anchor price through `ValuationLib`

## LP-Specific Safety Model

- deposit requests escrow tokens before execution
- wealth is minted only on `executeDeposit(...)`
- `requestWithdrawal(...)` stops further APR accrual
- withdrawal penalty is computed on execution from still-locked wealth tranches
- withdrawal and claim payout modes are constrained by `minAmountOutX` / `minAmountOutY`

## Important Economic Design Choices

These are not bugs; they are current intended semantics:

- treasury inventory is tracked in token-denominated buckets and excluded from live swap reserves
- treasury-funded LP claims and yield payouts debit treasury buckets before paying out
- pending withdrawals freeze APR accrual but do not automatically remove inventory from swap-side reserves
- `claimFees(...)` and withdrawal-yield funding require the treasury bucket to already hold the requested token mix
- the protocol does not auto-swap treasury `Y` into `X`
- successful `claimFees(...)` calls are limited by a fixed `12 hours` cooldown

## Known Limitations

- operators must keep state fresh under `blockDelay`
- deposit and withdrawal execution are owner-mediated flows
- helper scripts still use some legacy `CurvePMM` naming and one funding script still assumes two-sided bootstrap even though the contract supports one-sided deposits
- no external audit is documented in this repository
