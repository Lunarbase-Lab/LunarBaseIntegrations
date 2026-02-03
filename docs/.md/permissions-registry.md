# Permissions Registry (Protocol-Level)

This registry constrains which swap flags a pool can accept from core/user modules.

## Resolution

- Each module declares its own swap flags via `modulePermissions()`.
- The registry defines allowed flags per pool (or defaults).
- `LunarFactory.createPair` enforces that module flags are a subset of the registry allowed set.
- The pool stores the effective flags at initialization and enforces them at runtime.

## Admin Controls

- `setDefaultSwapPerms(corePerms, userPerms)` sets protocol-wide limits.
- `setPoolSwapPerms(poolId, corePerms, userPerms)` overrides for a specific pool.
- `clearPoolSwapPerms(poolId)` reverts to defaults.

## Notes

- If no registry is set in the factory, no additional constraints are applied.
- Common use: restrict `LUNAR_SWAP_OVERRIDE_IN`/`LUNAR_SWAP_OVERRIDE_OUT` to vetted modules only.


## Core Bit (moduleMask = 1)

- Core module is mandatory; its bit is `1` in `moduleMask`.
- If `moduleMask` does not include core, pool creation must revert.
