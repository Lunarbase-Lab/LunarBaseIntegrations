# Quoter Fee Policy

## Summary

- `core` fee is always applied.
- `user` fee is applied only when the user module sets `LUNAR_SWAP_OVERRIDE_FEE`
  and provides a fee quote.
- When user fee is present, the quoter **sums** fee quotes:
  - `inBps` and `outBps` are added.
  - `protocolShareBps` uses the max of both quotes.

## Rationale

This keeps core base/dynamic fees mandatory, while allowing user modules to
add extra fees for wrapper tokens or special behaviors.

## Where Implemented

- `LunarRouter`: uses core preview fee, then sums in user fee if override flag set.
- `LunarQuoter`: same policy for quote-only paths.

## Notes

- User modules **cannot** reduce core fees.
- If a user module does not override fee, only core fee is used.


## Protocol Share

- `protocolShareBps` is taken from the **sum** of core + user fee quotes.
- The protocol share uses **max(core, user)** to avoid under-reporting.
- Protocol fees are paid out immediately to `protocolTreasury` on swap.
