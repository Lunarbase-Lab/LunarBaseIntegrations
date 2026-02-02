# LunarBase Protocol — Full Technical Documentation

This document is a complete reference for LunarBase. It is intended for:

- Smart contract developers integrating with core contracts.
- Backend developers building order/quote/swap flows.
- Frontend developers wiring user flows and UI.

It includes:

- Protocol architecture and roles.
- Module system (core + user modules) and permissions.
- Pool address determinism.
- Fee accounting (base, dynamic, protocol share, LP fee manager).
- Detailed per-function reference for all contracts in scope.
- Data flow, call chains, and state changes.

Scope covered (functions and flows):

- `src/contracts/LunarFactory/**`
- `src/contracts/LunarFees/**`
- `src/contracts/LunarModule/**`
- `src/contracts/LunarPool/**`
- `src/contracts/LunarBaseLiquidityLocker.sol`
- `src/contracts/LunarQuoter.sol`
- `src/contracts/LunarRouter.sol`
- `src/contracts/LunarVault.sol`
- All related interfaces in `src/interfaces/**`

---

## 1. Architecture Summary

LunarBase is a V2-style AMM with explicit fee buckets and a modular hook system:

- **Pools are individual contracts** (one per pair configuration).
- **Fees are recorded in pool currencies** (token0/token1), separate from reserves.
- **Core module is mandatory** and always runs, supplying base+dynamic fees and access control.
- **User module is optional**, selected at pool creation for custom behavior (wrappers, FoT, etc.).
- **Delta accounting is enforced** for swaps to validate module-reported deltas.
- **Partner token gating** prevents unauthorized first pool creation for partner tokens.

Key contracts:

- `LunarFactory`: pool deployment + registry.
- `LunarPool`: AMM, fees, deltas, module hooks.
- `LunarRouter`: user entrypoint for liquidity + swaps.
- `LunarQuoter`: view-only quotes.
- `LunarCoreModule`: fees, partner gating, access layer.
- `LunarLpFeeManager`: global LP fee tracking.
- `LunarBaseLiquidityLocker`: LP locks with beneficiary fee claims.
- `LunarVault`: vault wrapper for pool + fee payout policy.

---

## 2. Roles and Operator Addresses

Recommended roles:

- **Factory Owner**: manages routers, core module, permissions registry, locker.
- **Core Owner**: manages dynamic fee configs, protocol fee share, treasury.
- **Protocol Fee Operator**: can update protocol share bps.
- **Partner Registry Operator**: manages partner allowlist.
- **Locker Owner**: manages locker operators.
- **Vault Owner**: manages vault fee payout and recipient.

---

## 3. Pool Identity and Deterministic Address

Pools are uniquely identified by:

- `token0`, `token1` (sorted)
- `userModule`
- `moduleMask`
- `baseFeeConfig`

The pool address is deterministic via CREATE2 clone:

- `salt = keccak(token0, token1, userModule, moduleMask, baseFeeHash)`
- `baseFeeHash = keccak(baseFeeConfig)`
- `pair = CREATE2(factory, salt, init_code_hash)`

### Flow (Pool Address)

```
Input: tokenA, tokenB, userModule, moduleMask, baseFeeConfig
  -> sort token0/token1
  -> compute baseFeeHash
  -> compute CREATE2 salt
  -> compute CREATE2 address
Output: pool address
```

---

## 4. Module System

### 4.1 Core Module (Mandatory)

Responsibilities:

- Base fee + dynamic fee calculation.
- Partner token gating.
- Access control for vault-only pools.
- Protocol fee routing (treasury + share).

### 4.2 User Module (Optional)

Capabilities:

- Override swap parameters (input/output).
- Provide fee override (additive to core fee).
- Wrapper tokens (WETH, wstETH, ERC4626, FoT).

### 4.3 Module Mask

Each pool has a module mask to enable hook categories:

- SWAP
- LIQUIDITY
- ACCESS
- INITIALIZE

### 4.4 Permissions Registry

Optional registry used by the factory:

- Per-pool allowed swap flags for core and user modules.
- Enforced during `createPair` if registry is set.

---

## 5. Fee Model

### 5.1 Base Fee

`BaseFeeConfig { baseFee, wToken0, wToken1 }`

- Weights must sum to 1,000,000,000 bps.
- Non-partners can only use preset configs.
- Partners can use arbitrary configs (up to 100%).

### 5.2 Dynamic Fee

Dynamic fee uses:

- Global or per-pool config (half-life, max cap, etc.).
- Per-pool state: activity, lastUpdate, dynBps.
- Swap pulse derived from output vs reserve.

### 5.3 Protocol Fee

Protocol fee = `protocolShareBps` of total swap fee.

- Paid immediately to `protocolTreasury` each swap.

### 5.4 LP Fee Distribution

LP fees are tracked in a global fee manager:

- `accFeePerShare` per pool.
- `feeDebt` per account for non-dilution.
- Claims always reflect only new fee accruals.

---

## 6. Delta Accounting

Delta accounting enforces:

- Swaps report expected deltas via module hook return.
- Pool verifies actual delta == expected delta.
- Constant product invariant is also checked.

This prevents silent balance manipulation by modules or token quirks.

---

## 7. Detailed Contract and Function Reference

Each function includes:

- **Purpose**
- **Parameters**
- **Returns**
- **Flow** (step-by-step)
- **Call Chain** (key external calls)

### 7.1 LunarFactory

#### `setOwner(newOwner)`

- Purpose: transfer factory ownership.
- Params: `newOwner`.
- Returns: none.
- Flow: check owner -> update -> emit.
- Call chain: none.

#### `setCoreModule(newCore)`

- Purpose: update core module address.
- Params: `newCore`.
- Flow: only owner -> validate -> update.
- Call chain: none.

#### `setRouter(router, allowed)`

- Purpose: whitelist router for msgSender resolution.
- Params: router, allowed.
- Flow: owner -> update mapping -> emit.

#### `setPermissionsRegistry(registry)`

- Purpose: set optional PermissionsRegistry.
- Params: registry.
- Flow: owner -> update -> emit.

#### `setLocker(newLocker)`

- Purpose: set protocol locker.
- Params: newLocker.
- Flow: owner or lockerOperator -> update -> emit.

#### `setLockerOperator(newOperator)`

- Purpose: set locker operator.
- Params: newOperator.
- Flow: owner -> update -> emit.

#### `allPairsLength()`

- Purpose: returns pool count.
- Returns: `pairCount`.

#### `createPair(tokenA, tokenB, userModule, moduleMask, baseFeeConfig)`

- Purpose: deploy a new pool.
- Flow:
  1. Validate moduleMask.
  2. Sort tokens.
  3. Compute PoolId and ensure not exists.
  4. Deploy clone via CREATE2.
  5. Register pool in core module.
  6. Validate module permissions with registry.
  7. Initialize pool with core/user modules.
  8. Emit PairCreated.
- Call chain: core module `registerPool` -> pool `initialize` -> permission registry (optional).

#### `computePoolAddress(tokenA, tokenB, userModule, moduleMask, baseFeeConfig)`

- Purpose: predict deterministic pool address.
- Returns: predicted address.

#### `getPair(tokenA, tokenB, userModule, moduleMask, baseFeeConfig)`

- Purpose: lookup pool address.
- Returns: address or zero.

#### `pairInitCodeHash()`

- Purpose: returns init code hash for clone.

---

### 7.2 LunarPermissionsRegistry

#### `setOwner(newOwner)`

- Purpose: transfer registry ownership.

#### `setDefaultSwapPerms(corePerms, userPerms)`

- Purpose: set defaults for pools without overrides.

#### `setPoolSwapPerms(poolId, corePerms, userPerms)`

- Purpose: set overrides for a pool.

#### `clearPoolSwapPerms(poolId)`

- Purpose: remove overrides.

#### `resolveSwapPerms(poolId)`

- Purpose: returns allowed swap flags.

---

### 7.3 LunarPool

#### `initialize(token0, token1, coreModule, userModule, moduleMask, coreSwapPerms, userSwapPerms)`

- Purpose: set pool config after deployment.
- Flow: set state -> resolve treasury + fee manager -> call initialize hook.

#### `getReserves()`

- Returns current reserves (excluding fees).

#### `decimals()`

- Returns 18 for LP token.

#### `setProtocolFeeTo(to)`

- Purpose: update protocol fee recipient.

#### `setVault(vault, vaultOnly)`

- Purpose: configure vault restriction.

#### `setFeeManager(manager)`

- Purpose: update fee manager.

#### `mint(to)`

- Purpose: mint LP tokens from supplied liquidity.
- Flow:
  1. Access + liquidity hooks.
  2. Compute deltas vs reserves+fees.
  3. Mint LP tokens.
  4. Update reserves.

#### `burn(to)`

- Purpose: burn LP tokens and return liquidity.
- Flow:
  1. Access hook.
  2. Compute amounts from reserves.
  3. Burn LP.
  4. Transfer tokens.
  5. Update reserves.

#### `swap(amount0Out, amount1Out, to, data)`

- Purpose: swap with hooks + fees.
- Flow:
  1. Access hook.
  2. Derive swap context.
  3. Call module hooks (core + user).
  4. Apply out-fee and transfer outputs.
  5. Optional flash callback.
  6. Calculate inputs, fees, deltas.
  7. Verify delta + invariant.
  8. Update reserves.
  9. Payout protocol fees.
- Call chain: core/user module, flash callback, fee manager.

#### `take(currency, to, amount)`

- Purpose: allow modules to pull currency during swap.

#### `collectProtocolFees(to)`

- Purpose: transfer accumulated protocol fees.

#### `collectFees(to, amount0, amount1)`

- Purpose: transfer LP fee buckets to fee manager.

LP Token functions:

- `transfer`, `approve`, `transferFrom` (standard ERC20 style).

---

### 7.4 LunarRouter

#### `pairFor(tokenA, tokenB, userModule, moduleMask, cfg)`

- Purpose: returns pool address.

#### `createPair(params)`

- Purpose: calls factory to create pool.

#### `addLiquidity(params)`

- Purpose: add liquidity, create pool if needed.
- Flow: calc optimal -> pull tokens -> mint LP.

#### `addLiquidityAndLock(params)`

- Purpose: add liquidity and lock LP in locker.

#### `lockLiquidity(token, amount, unlockTime, permanent, beneficiary)`

- Purpose: lock tokens directly in locker.

#### `lockLiquidityFor(owner, token, amount, unlockTime, permanent, beneficiary)`

- Purpose: lock for another owner.

#### `setLockBeneficiary(id, newBeneficiary)`

- Purpose: update lock beneficiary.

#### `withdrawLocked(id, to)`

- Purpose: withdraw LP from locker.

#### `claimLockedFees(id, to)`

- Purpose: claim fees for lock.

#### `removeLiquidity(params)`

- Purpose: burn LP and withdraw tokens.

#### `swapExactTokensForTokens(params)`

- Purpose: single-hop exact input.

#### `swapExactInputSingle(params)`

- Purpose: single-hop exact input (path params).

#### `swapExactInput(params)`

- Purpose: multi-hop exact input.

#### `swapExactOutputSingle(params)`

- Purpose: single-hop exact output.

#### `swapExactOutput(params)`

- Purpose: multi-hop exact output.

---

### 7.5 LunarQuoter

#### `quoteExactInputSingle(params)`

- Purpose: quote single-hop exact input.

#### `quoteExactOutputSingle(params)`

- Purpose: quote single-hop exact output.

#### `quoteExactInput(params)`

- Purpose: quote multi-hop exact input.

#### `quoteExactOutput(params)`

- Purpose: quote multi-hop exact output.

#### `getAmountOut(...)` / `getAmountIn(...)`

- Purpose: explicit single-hop quotes.

#### `getAmountsOut(...)` / `getAmountsIn(...)`

- Purpose: explicit multi-hop quotes.

#### `quote(amountA, reserveA, reserveB)`

- Purpose: V2-style quote.

---

### 7.6 LunarCoreModule

#### `beforeAction(moduleType, pair, caller, data)`

- Purpose: core hook entrypoint.
- Swap path returns `LunarSwapReturn` with fee quote.

#### `afterAction(...)`

- Purpose: core post-hook (no-op).

#### `modulePermissions()`

- Purpose: declare swap permissions for core.

#### `previewFee(pair, ctx)`

- Purpose: view-only fee quote.

#### `setOwner(newOwner)`

- Purpose: transfer core ownership.

#### `setFactory(newFactory)`

- Purpose: update authorized factory.

#### `setProtocolTreasury(treasury)`

- Purpose: update fee recipient.

#### `setProtocolFeeOperator(operator)`

- Purpose: update fee operator.

#### `setLpFeeManager(manager)`

- Purpose: update LP fee manager.

#### `setProtocolShareBps(bps)`

- Purpose: update protocol fee share.

#### `setChameleonOperator(pair, operator, enabled)`

- Purpose: allow baseFee updates by operator.

#### `setVaultConfig(pair, vault, enabled)`

- Purpose: set vault and enable access restrictions.

#### `updateChameleonBaseFee(pair, cfg)`

- Purpose: update baseFee for chameleon pools.

#### `registerPool(pair, token0, token1, cfg, caller)`

- Purpose: validate and register a new pool.

---

### 7.7 Dynamic Fee Submodule

#### `setDefaultDynConfig(cfg)`

- Purpose: update global dynamic fee config.

#### `setPoolDynConfig(pair, cfg)`

- Purpose: override per pool.

---

### 7.8 Partner Registry Submodule

#### `grantPartnerPermissions(partner)`

- Purpose: allow partner address.

#### `revokePartnerPermissions(partner)`

- Purpose: revoke partner address.

#### `checkPartnerPermissions(ctx)`

- Purpose: verify partner identity.

#### `checkTokenPermissions(token, actor[, salt])`

- Purpose: verify CREATE2 partner token address.

---

### 7.9 LunarLpFeeManager

#### `onFeesAccrued(pool, fee0, fee1, lpSupply)`

- Purpose: update pool fee accumulators.

#### `onBalanceChange(pool, account, oldBalance, newBalance)`

- Purpose: update account fee debts.

#### `claim(pool, to)`

- Purpose: transfer accrued fees to `to`.

#### `preview(pool, account)`

- Purpose: view fees for account.

---

### 7.10 LunarBaseLiquidityLocker

#### `setOperator(operator, allowed)`

- Purpose: manage locker operators.

#### `lock(token, amount, unlockTime, permanent, beneficiary)`

- Purpose: lock tokens owned by caller.

#### `lockFor(owner, token, amount, unlockTime, permanent, beneficiary)`

- Purpose: lock tokens for another owner.

#### `registerLock(owner, token, amount, unlockTime, permanent, beneficiary)`

- Purpose: register lock when tokens already in locker.

#### `withdraw(id, to)`

- Purpose: withdraw non-permanent lock.

#### `withdrawFor(id, owner, to)`

- Purpose: withdraw for owner.

#### `claimFees(id, to)`

- Purpose: claim fees by beneficiary.

#### `claimFeesFor(id, beneficiary, to)`

- Purpose: claim fees on behalf of beneficiary.

#### `setBeneficiary(id, newBeneficiary)`

- Purpose: change beneficiary.

#### `setBeneficiaryFor(id, owner, newBeneficiary)`

- Purpose: change beneficiary on behalf.

---

### 7.11 LunarVault

#### `setOwner(newOwner)`

- Purpose: transfer vault ownership.

#### `setFeeRecipient(recipient)`

- Purpose: set fee recipient.

#### `setFeePayoutBps(bps)`

- Purpose: update payout share.

#### `deposit(amount0, amount1, minShares, to)`

- Purpose: deposit liquidity into pool via vault.

#### `withdraw(shares, amount0Min, amount1Min, to)`

- Purpose: burn shares, withdraw liquidity.

#### `collectFees()`

- Purpose: pull fees from pool and allocate to users/recipient.

#### `claimFees(to)`

- Purpose: claim user fees.

---

## 8. Integration Guide (Frontend/Backend)

### 8.1 Creating a Pool

1. Select tokens (tokenA/tokenB).
2. Choose userModule (or address(0)).
3. Choose moduleMask and baseFeeConfig.
4. Call `LunarFactory.createPair` or via `LunarRouter.createPair`.

### 8.2 Adding Liquidity

1. Use `LunarRouter.addLiquidity`.
2. Approve tokens to router (ERC20).
3. If using native, ensure it is at path edge.

### 8.3 Swaps

- Single-hop: `swapExactTokensForTokens` or `swapExactInputSingle`.
- Multi-hop: `swapExactInput` / `swapExactOutput` using `PathKey[]`.

### 8.4 Quoting

- Use `LunarQuoter` for view-only amounts.

### 8.5 Locker

- Use `addLiquidityAndLock` or direct `lockLiquidity`.
- Beneficiary claims fees until unlock.

### 8.6 Vault

- Deposit/withdraw using vault functions.
- Vault can enforce exclusive liquidity.

---

## 9. Security Considerations

- User modules are powerful; pool permissions should be enforced with `PermissionsRegistry`.
- Delta accounting + invariant checks protect against token quirks.
- Protocol treasury is updated by core module; pools auto-sync it.

---

## 10. Appendix: Call Chains (High Level)

### Swap (Single Hop)

```
Router.swapExactInputSingle
  -> Pool.swap
    -> CoreModule.beforeAction (swap)
    -> UserModule.beforeAction (swap)
    -> Pool fee accounting + delta checks
    -> Core/User afterAction
```

### Swap (Multi Hop)

```
Router.swapExactInput
  -> Pool.swap (per hop)
    -> Core/User module hooks
```

### Liquidity + Lock

```
Router.addLiquidityAndLock
  -> Pool.mint
  -> Locker.registerLock
```

---
