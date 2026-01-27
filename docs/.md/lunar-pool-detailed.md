# LunarPool — Full Execution & State Detail (Max Detail)

This document is a deep, step‑by‑step reference for `src/contracts/LunarPool/LunarPool.sol`. It enumerates:
- Exact execution flow per function.
- All state variables read/written.
- Internal calls and external call chains.
- Invariants and failure conditions.

Notation:
- **S:** state variables read/written.
- **E:** external calls.
- **I:** internal function calls.

---

## 0. Contract State Overview

### Storage
- `token0`, `token1` (`Currency`): pool currencies.
- `reserve0`, `reserve1` (`uint112`): AMM reserves excluding fee buckets.
- `fees0`, `fees1` (`uint128`): LP fee buckets.
- `protocolFees0`, `protocolFees1` (`uint128`): protocol fee buckets.
- `coreModule`, `userModule` (`address`): core and optional user module.
- `protocolFeeTo` (`address`): current protocol fee receiver.
- `feeManager` (`address`): LP fee manager.
- `vault` (`address`), `vaultOnly` (`bool`): vault settings.
- `moduleMask` (`uint8`): enabled module types.
- `coreSwapPerms`, `userSwapPerms` (`uint8`): allowed swap flags.
- `initialized` (`bool`): initialization guard.
- `swapInProgress` (`bool`): swap reentrancy guard for module `take`.
- `totalSupply` (`uint256`): LP total supply.
- `balanceOf[address]` (`mapping`): LP balances.
- `allowance[address][address]` (`mapping`): LP allowances.

### Events
- `Mint`, `Burn`, `Swap`, `Sync`
- `FeesAccrued`, `ProtocolFeesAccrued`, `FeesCollected`
- `ProtocolFeeToSet`, `VaultSet`, `FeeManagerSet`
- `Transfer`, `Approval`

---

## 1. `initialize(...)`

**Signature:**
```
initialize(Currency _token0, Currency _token1, address _coreModule, address _userModule,
           uint8 _moduleMask, uint8 _coreSwapPerms, uint8 _userSwapPerms)
```

**Purpose:** Configure a newly deployed pool clone.

**Reads/Writes:**
- **S read:** `initialized`
- **S write:** `token0`, `token1`, `coreModule`, `userModule`, `moduleMask`, `coreSwapPerms`, `userSwapPerms`, `protocolFeeTo`, `feeManager`, `initialized`

**Flow:**
1. Require `initialized == false`.
2. Resolve caller via `LunarMsgSender.msgSender()`.
3. Store pool configuration parameters.
4. Pull `protocolTreasury` and `lpFeeManager` from `coreModule`.
5. Require feeManager != 0.
6. Set `initialized = true`.
7. Emit `FeeManagerSet`.
8. Call `_callAfter(INITIALIZE, caller, "")`.

**External Calls:**
- **E:** `ILunarCoreModule(protocolTreasury, lpFeeManager)`
- **E:** `ILunarModule.afterAction` (core/user) through `_callAfter`.

---

## 2. `getReserves()` / `decimals()`

- `getReserves()` reads `reserve0`, `reserve1`.
- `decimals()` always returns 18.

---

## 3. Admin Setters

### `setProtocolFeeTo(address to)`
- **S read:** `coreModule`
- **S write:** `protocolFeeTo`
- **Checks:** `msg.sender == coreModule`
- **Emit:** `ProtocolFeeToSet`

### `setVault(address vault_, bool vaultOnly_)`
- **S write:** `vault`, `vaultOnly`
- **Checks:** `msg.sender == coreModule`
- **Emit:** `VaultSet`

### `setFeeManager(address manager)`
- **S write:** `feeManager`
- **Checks:** `msg.sender == coreModule`, `manager != 0`
- **Emit:** `FeeManagerSet`

---

## 4. Liquidity: `mint(address to)`

**Purpose:** Mint LP tokens based on new liquidity provided to the pool.

**Reads/Writes:**
- **S read:** `initialized`, `reserve0/1`, `fees0/1`, `protocolFees0/1`, `totalSupply`
- **S write:** `totalSupply`, `balanceOf`, `reserve0/1`

**Flow:**
1. Require `initialized == true`.
2. Resolve caller via `LunarMsgSender.msgSender()`.
3. `_callBefore(ACCESS, ...)` with `AccessAction.Mint`.
4. `_callBefore(LIQUIDITY, ...)` with `LunarLiquidityContext`.
5. Fetch balances via `token0.balanceOfSelf()`, `token1.balanceOfSelf()`.
6. Compute delta amounts = balances − reserves − fee buckets.
7. Require amount0 > 0 and amount1 > 0.
8. If `totalSupply == 0`:
   - `liquidity = sqrt(amount0 * amount1) - MIN_LIQUIDITY`
   - `_mint(address(0), MIN_LIQUIDITY)`
9. Else:
   - `liquidity = min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1)`
10. Require `liquidity > 0`.
11. `_mint(to, liquidity)`.
12. Update reserves via `_updateReserves(balance0, balance1)`.
13. `_callAfter(LIQUIDITY, caller, "")`.
14. Emit `Mint`.

**Internal Calls:** `_callBefore`, `_mint`, `_updateReserves`, `_callAfter`.

**External Calls:** module hooks, token transfers (implicit in balances), fee manager updates via `_mint` (calls `_updateLpAccount`).

---

## 5. Liquidity: `burn(address to)`

**Purpose:** Burn LP tokens held by pool and return proportional reserves.

**Reads/Writes:**
- **S read:** `initialized`, `balanceOf[address(this)]`, `reserve0/1`, `totalSupply`
- **S write:** `balanceOf`, `totalSupply`, `reserve0/1`

**Flow:**
1. Require `initialized == true`.
2. Resolve caller via `LunarMsgSender.msgSender()`.
3. `_callBefore(ACCESS, AccessAction.Burn)`.
4. Read `liquidity = balanceOf[address(this)]`.
5. Require liquidity > 0.
6. Compute amounts = liquidity * reserve / totalSupply.
7. Require amounts > 0.
8. `_burn(address(this), liquidity)`.
9. Transfer tokens out to `to`.
10. Update reserves with current balances.
11. `_callAfter(LIQUIDITY, caller, "")`.
12. Emit `Burn`.

---

## 6. Swap: `swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)`

**Purpose:** Execute swap with module hooks, fee calculation, delta accounting, invariant checks.

**Reads/Writes:**
- **S read:** `initialized`, `reserve0/1`, `fees0/1`, `protocolFees0/1`, `token0/1`, `coreModule`, `userModule`, `coreSwapPerms`, `userSwapPerms`, `moduleMask`
- **S write:** `fees0/1`, `protocolFees0/1`, `reserve0/1`, `swapInProgress`

**Flow (Detailed):**
1. Require `initialized == true`.
2. Resolve caller via `LunarMsgSender.msgSender()`.
3. Require `amount0Out > 0 || amount1Out > 0`.
4. Load reserves and token addresses.
5. Require `to` not equal to token0/token1 address.
6. `_callBefore(ACCESS, AccessAction.Swap)`.
7. Set `swapInProgress = true`.
8. Read pool balances (before swap): `balance0Before`, `balance1Before`.
9. Compute effective reserves: `reserve + fees + protocolFees`.
10. Compute `amount0In/amount1In` using balance delta over effective reserves.
11. Build `LunarSwapContext` with tokenIn/tokenOut depending on direction.
12. Call `_callBeforeSwap` to gather `LunarSwapReturn`:
    - coreModule beforeAction
    - userModule beforeAction
    - merge & enforce permissions
13. Determine fee quote:
    - use module fee quote if present
    - else default (0s)
14. Determine `amount0OutFinal/amount1OutFinal`:
    - overridden if `LUNAR_SWAP_OVERRIDE_OUT` set.
15. Check liquidity:
    - if override not set, require out < reserves.
16. Compute out‑fees and transfer outputs to `to`.
17. If `data` present, decode `FlashCallbackData` and call `lunarFlashCallback`.
18. Re-read balances after outputs.
19. Compute input amounts:
    - If override_in set, use override.
    - Else compute from balance deltas minus reserves/fees.
20. Input check (unless `SKIP_INPUT_CHECK`): require some input.
21. Compute input fees using `quote.inBps`.
22. `_accrueFees(fee0In, fee1In, fee0Out, fee1Out, protocolShareBps)`.
23. If delta accounting is enabled:
    - If module did not set delta, compute fallback delta.
    - Compute actual delta via `LunarDeltaLib.actualDelta`.
    - Compute expected delta via `_expectedSwapDelta`.
    - Require exact match else revert `BadSwapDelta`.
24. Enforce constant product invariant on effective balances.
25. `_updateReserves(balance0, balance1)`.
26. `_payoutProtocolFees()` (immediate transfer).
27. `_callAfter(SWAP, caller, data)`.
28. `swapInProgress = false`.
29. Emit `Swap`.

**External Calls:**
- module hooks
- token transfers
- flash callback
- fee manager

**State Changes:**
- `fees0/1` and `protocolFees0/1` updated.
- `reserve0/1` updated.
- `protocolFeeTo` may be refreshed to latest treasury.

---

## 7. `take(Currency currency, address to, uint256 amount)`

**Purpose:** Allow modules to pull currency from pool during swap.
- Requires `swapInProgress == true`.
- Requires caller is core or user module.
- Requires currency == token0 or token1.
- Transfers currency to recipient.

**State:** no storage changes.

---

## 8. Fee Handling

### `_expectedSwapDelta(ctx, swapRet, token0Addr)`
- Computes expected balance delta signs based on swap direction.

### `collectProtocolFees(address to)`
- Only `protocolFeeTo` can call.
- Transfers `protocolFees0/1` to `to`, resets buckets to 0.

### `collectFees(address to, uint128 amount0, uint128 amount1)`
- Only `feeManager` can call.
- Checks available buckets.
- Transfers out, decrements buckets, emits `FeesCollected`.

### `_accrueFees(...)`
- Compute total fees (in + out).
- Split into protocol and LP share using `protocolShareBps`.
- Update buckets: `fees0/1`, `protocolFees0/1`.
- Notify `feeManager` via `onFeesAccrued` if LP fees > 0.

### `_payoutProtocolFees()`
- Pull latest `protocolTreasury` from core.
- If changed, update `protocolFeeTo`.
- Transfer `protocolFees0/1` to treasury and reset buckets.

---

## 9. Internal Helpers

### `_updateReserves(balance0, balance1)`
- Computes effective balances = balance − fees − protocol fees.
- Writes `reserve0/1` and emits `Sync`.

### `_lpSupply()`
- Returns `totalSupply − balanceOf[address(0)]`.

### `_updateLpAccount(account, oldBalance, newBalance)`
- Calls `feeManager.onBalanceChange` for non-zero accounts.

### `_callBefore(mtype, caller, data)`
- Calls `beforeAction` on core and user module (if enabled by mask).
- Returns last module’s response.

### `_callBeforeSwap(caller, ctx)`
- Calls core/user swap hooks and merges via `_mergeSwapReturns`.

### `_decodeSwapReturn(data)`
- ABI-decodes `LunarSwapReturn` if data not empty.

### `_mergeSwapReturns(coreRet, userRet)`
- Enforces swap permission flags.
- ORs flags, merges overrides.
- Enforces delta accounting for every swap.

### `_sumFeeQuotes(base, extra)`
- Adds `inBps`, `outBps`, `protocolShareBps` with caps.

### `_capBps(a, b)`
- Caps sum at `LUNAR_BPS_DEN - 1`.

### `_callAfter(mtype, caller, data)`
- Calls `afterAction` on core and user module if enabled.

### `_maskAllows(mtype)`
- Checks moduleMask includes SWAP/LIQUIDITY/ACCESS/INITIALIZE.

---

## 10. LP Token Functions

### `_mint(to, amount)`
- Updates balances + totalSupply (unchecked).
- Calls `_updateLpAccount`.
- Emits `Transfer(0x0, to, amount)`.

### `_burn(from, amount)`
- Updates balances + totalSupply (unchecked).
- Calls `_updateLpAccount`.
- Emits `Transfer(from, 0x0, amount)`.

### `transfer(to, amount)` / `approve(spender, amount)` / `transferFrom(from, to, amount)`
- Standard ERC20-like behavior.
- `transferFrom` enforces allowance if not max.

### `_transfer(from, to, amount)`
- Validates balances and `to != 0`.
- Updates balances and fee manager.
- Emits `Transfer`.

---

## 11. Invariants & Safety Checks

- **Initialization**: `initialize` only once.
- **Swap input check**: optional but enabled unless module asks to skip.
- **Delta accounting**: enforced for every swap.
- **Invariant**: effective balance product must not decrease.
- **Fee bucket isolation**: reserves exclude fee buckets.
- **Vault gating**: enforced via access module in core (not directly here).

---

## 12. Call Chain Summary (Swap)

```
Router.swap* -> Pool.swap
  -> _callBefore(ACCESS)
  -> _callBeforeSwap (core + user)
  -> fee calc, output transfer
  -> optional flash callback
  -> input calc
  -> _accrueFees
  -> delta check
  -> invariant check
  -> _updateReserves
  -> _payoutProtocolFees
  -> _callAfter(SWAP)
```

---
