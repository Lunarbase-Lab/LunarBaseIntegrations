# LunarBase user‑facing functions

This document lists every external/public function a user/operator may call in:
`LunarRouter`, `LunarFactory`, `LunarCoreModule`, `LunarBaseLiquidityLocker`, and `LunarQuoter`.
Each entry includes parameters, meaning, and return values, plus access notes.

## Shared types

**`BaseFeeConfig`**
- `baseFee` (uint24): total fee in bps (1_000_000_000 = 100%).
- `wToken0` (uint24): weight of fee charged in token0 (bps; sum with wToken1 must be 1_000_000_000).
- `wToken1` (uint24): weight of fee charged in token1 (bps).

**`CreatePairParams`**
- `tokenA`, `tokenB`: pair tokens (ERC20 or native address(0)).
- `userModule`: optional module for user‑defined swap behavior.
- `moduleMask`: enabled module types.
- `baseFeeConfig`: preset or partner‑defined base fee.

**`AddLiquidityParams`**
- `tokenA`, `tokenB`: pair tokens.
- `amountADesired`, `amountBDesired`: desired deposit amounts.
- `amountAMin`, `amountBMin`: slippage guards.
- `userModule`, `moduleMask`, `baseFeeConfig`: pool selector.
- `to`: LP recipient.

**`AddLiquidityAndLockParams`**
- Same as `AddLiquidityParams` plus:
- `unlockTime`: unlock timestamp (0 for permanent if `permanent = true`).
- `permanent`: lock type.
- `beneficiary`: address that can claim LP fees during lock.

**`RemoveLiquidityParams`**
- `tokenA`, `tokenB`: pair tokens.
- `liquidity`: LP to burn.
- `amountAMin`, `amountBMin`: slippage guards.
- `to`: recipient.
- `userModule`, `moduleMask`, `baseFeeConfig`: pool selector.

**`SwapExactParams`**
- `tokenIn`, `tokenOut`: swap tokens.
- `amountIn`, `amountOutMin`: exact input + min output.
- `to`: recipient.
- `userModule`, `moduleMask`, `baseFeeConfig`: pool selector.
- `data`: hook data forwarded to modules/pool.

**`PathKey`**
- `intermediateToken`: next hop token.
- `userModule`, `moduleMask`, `baseFeeConfig`: pool selector for the hop.
- `data`: hook data for the hop.

**`ExactInputSingleParams`**
- `tokenIn`, `tokenOut`, `amountIn`, `amountOutMinimum`, `to`
- `userModule`, `moduleMask`, `baseFeeConfig`
- `data`

**`ExactInputParams`**
- `tokenIn`: start token.
- `path`: array of `PathKey` hops.
- `maxHopSlippage`: optional per‑hop max price (empty = no check).
- `amountIn`, `amountOutMinimum`, `to`

**`ExactOutputSingleParams`**
- `tokenIn`, `tokenOut`, `amountOut`, `amountInMaximum`, `to`
- `userModule`, `moduleMask`, `baseFeeConfig`
- `data`

**`ExactOutputParams`**
- `tokenOut`: final token.
- `path`: array of `PathKey` hops (reverse path).
- `maxHopSlippage`: optional per‑hop max price (empty = no check).
- `amountOut`, `amountInMaximum`, `to`

---

## LunarRouter (`src/contracts/LunarRouter.sol`)

**`msgSender() → address`**
- Returns the transient `msgSender` set by the router for this tx.
- Used by factory/locker to resolve the actual caller.

**`pairFor(tokenA, tokenB, userModule, moduleMask, baseFeeConfig) → pair`**
- Pure pool lookup via factory.

**`createPair(CreatePairParams params) → pair`**
- Creates a new pool (and registers it in core module).
- Requires router to be whitelisted in factory.

**`addLiquidity(AddLiquidityParams params) → (amountA, amountB, liquidity)`**
- Pulls tokens from the caller, mints LP to `to`.
- `amountA/amountB` are the actual amounts used.

**`addLiquidityAndLock(AddLiquidityAndLockParams params) → (amountA, amountB, liquidity, lockId)`**
- Same as `addLiquidity` but mints LP to the locker and registers a lock.
- `lockId` is the locker lock identifier.

**`lockLiquidity(token, amount, unlockTime, permanent, beneficiary) → lockId`**
- Pulls `token` from caller, registers a lock in the protocol locker.

**`lockLiquidityFor(owner, token, amount, unlockTime, permanent, beneficiary) → lockId`**
- Operator‑assisted lock for `owner`. Caller must be allowed by locker policy.

**`setLockBeneficiary(id, newBeneficiary)`**
- Changes lock beneficiary (via locker).

**`withdrawLocked(id, to)`**
- Withdraws LP from locker to `to` (owner‑gated in locker).

**`claimLockedFees(id, to) → (fee0, fee1)`**
- Claims locked LP fees to `to`.

**`removeLiquidity(RemoveLiquidityParams params) → (amountA, amountB)`**
- Transfers LP from caller to pool, burns, sends tokens to `to`.

**`swapExactTokensForTokens(SwapExactParams params) → amountOut`**
- Single hop exact‑input swap with slippage protection.

**`swapExactInputSingle(ExactInputSingleParams params) → amountOut`**
- Single hop exact‑input swap (Uniswap‑like naming).

**`swapExactInput(ExactInputParams params) → amountOut`**
- Multi‑hop exact‑input swap.

**`swapExactOutputSingle(ExactOutputSingleParams params) → amountIn`**
- Single hop exact‑output swap.

**`swapExactOutput(ExactOutputParams params) → amountIn`**
- Multi‑hop exact‑output swap.

Notes:
- All swap paths respect `userModule` preview hooks and permissions.
- Core fee is always included; user fee is added if override‑fee flag is set.
- Native token swaps use `address(0)` as currency.

---

## LunarFactory (`src/contracts/LunarFactory/LunarFactory.sol`)

**`setOwner(newOwner)`** (onlyOwner)
- Transfers factory ownership.

**`setCoreModule(newCore)`** (onlyOwner)
- Updates core module address.

**`setRouter(router, allowed)`** (onlyOwner)
- Whitelists/unwhitelists a router.

**`setPermissionsRegistry(registry)`** (onlyOwner)
- Sets permissions registry (can be zero to disable).

**`setLocker(newLocker)`** (onlyLockerOperator)
- Sets the canonical locker address.

**`setLockerOperator(newOperator)`** (onlyOwner)
- Sets who can update the locker address.

**`allPairsLength() → pairCount`**
- Total pairs created.

**`createPair(tokenA, tokenB, userModule, moduleMask, baseFeeConfig) → pair`**
- Creates a pool clone and registers it in core module.
- Enforces module permissions and partner gating.

**`computePoolAddress(tokenA, tokenB, userModule, moduleMask, baseFeeConfig) → predicted`**
- Deterministic CREATE2 address calculation.

**`getPair(tokenA, tokenB, userModule, moduleMask, baseFeeConfig) → pair`**
- Returns pool for a given key or address(0).

**`pairInitCodeHash() → bytes32`**
- Factory pair init code hash for CREATE2 address derivation.

---

## LunarCoreModule (`src/contracts/LunarModule/LunarCoreModule.sol`)

Module interface functions (called by pools):

**`beforeAction(moduleType, pair, caller, data) → bytes`**
- Core logic for access checks and fee quotes.
- SWAP: returns `LunarSwapReturn` with fee quote.
- ACCESS: reverts if unauthorized (vault‑only mint/burn).

**`afterAction(...)`**
- No‑op in core (hook point reserved).

**`modulePermissions() → (moduleMask, swapFlags)`**
- Declares allowed module types and swap flags for core (no override flags).

**`previewFee(pair, ctx) → LunarFeeQuote`** (view)
- Returns base + dynamic fee quote (in/out bps + protocolShareBps).

Admin / operator functions:

**`setOwner(newOwner)`** (onlyOwner)
- Updates core owner.

**`setFactory(newFactory)`** (onlyOwner)
- Sets factory address.

**`setProtocolTreasury(treasury)`** (onlyOwner)
- Protocol fee recipient.

**`setProtocolFeeOperator(operator)`** (onlyOwner)
- Grants permission to change protocol share.

**`setLpFeeManager(manager)`** (onlyOwner)
- Sets LP fee manager contract.

**`setProtocolShareBps(bps)`** (onlyFeeOperator)
- Updates protocol fee share (bps).

**`setChameleonOperator(pair, operator, enabled)`** (onlyOwner)
- Enables chameleon base fee updates for a pool.

**`setVaultConfig(pair, vault, enabled)`** (onlyOwner)
- Enforces vault‑only mint/burn; auto‑enables chameleon for vault pools.

**`updateChameleonBaseFee(pair, cfg)`**
- Operator‑only base fee update for chameleon pools.

**`registerPool(pair, token0, token1, cfg, caller)`** (onlyFactory)
- Registers pool and validates partner gating/presets.

---

## LunarBaseLiquidityLocker (`src/contracts/LunarBaseLiquidityLocker.sol`)

**`setOperator(operator, allowed)`** (onlyOwner)
- Grants/revokes operator rights (usually router).

**`lock(token, amount, unlockTime, permanent, beneficiary) → id`**
- Locks tokens from caller; beneficiary can claim LP fees.

**`lockFor(owner, token, amount, unlockTime, permanent, beneficiary) → id`**
- Operator‑assisted lock. Requires initiator == owner.

**`registerLock(owner, token, amount, unlockTime, permanent, beneficiary) → id`**
- Operator registers a lock for tokens already held by locker.

**`withdraw(id, to)`**
- Owner withdraws locked tokens after unlock (or reverts if permanent).

**`withdrawFor(id, owner, to)`**
- Operator‑assisted withdraw; requires initiator == owner.

**`claimFees(id, to) → (fee0, fee1)`**
- Beneficiary claims accumulated LP fees.

**`claimFeesFor(id, beneficiary, to) → (fee0, fee1)`**
- Operator‑assisted fee claim; requires initiator == beneficiary.

**`setBeneficiary(id, newBeneficiary)`**
- Owner changes beneficiary; accrued fees are paid out to previous beneficiary.

**`setBeneficiaryFor(id, owner, newBeneficiary)`**
- Operator‑assisted beneficiary change; requires initiator == owner.

---

## LunarQuoter (`src/contracts/LunarQuoter.sol`)

**`quoteExactInputSingle(ExactInputSingleParams params) → amountOut`**
- View quote for single‑hop exact‑input swap.

**`quoteExactOutputSingle(ExactOutputSingleParams params) → amountIn`**
- View quote for single‑hop exact‑output swap.

**`quoteExactInput(ExactInputParams params) → (amountOut, amounts[])`**
- Multi‑hop exact‑input quote; returns hop‑by‑hop amounts.

**`quoteExactOutput(ExactOutputParams params) → (amountIn, amounts[])`**
- Multi‑hop exact‑output quote; returns hop‑by‑hop amounts.

**`getAmountOut(amountIn, tokenIn, tokenOut, userModule, moduleMask, baseFeeConfig, data) → amountOut`**
- Legacy‑style single‑hop output estimate.

**`getAmountIn(amountOut, tokenIn, tokenOut, userModule, moduleMask, baseFeeConfig, data) → amountIn`**
- Legacy‑style single‑hop input estimate.

**`getAmountsOut(amountIn, tokenIn, path) → amounts[]`**
- Legacy‑style multi‑hop exact‑input amounts.

**`getAmountsIn(amountOut, tokenOut, path) → amounts[]`**
- Legacy‑style multi‑hop exact‑output amounts.

**`quote(params) → (amountIn, amountOut, amounts[])`**
- Convenience entry that routes to exact‑input or exact‑output based on params.

