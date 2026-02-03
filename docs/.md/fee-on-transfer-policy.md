# Fee-on-Transfer Policy

## Scope

Fee-on-transfer (FoT) tokens reduce the actual amount that reaches the pool.
This makes **exact-output** swaps unreliable because the input observed by the
pool differs from the input requested by the user.

## Policy

- **Supported:** exact-input swaps.
- **Not supported:** exact-output swaps for FoT pairs.

## Rationale

For FoT tokens, the pool only knows the real input after the transfer happens.
Exact-output quotes would be misleading and can fail to meet the output target.

## Implementation Notes

- Use `FeeOnTransferModule` on FoT pairs to compute output from the **observed**
  input at the pool.
- Router/Quoter should avoid exact-output paths for FoT pairs in UI/SDK.


## Router/Quoter Notes

- Exact-output with FoT tokens is unsupported because inputs are unknown before transfer.
- Use exact-input and set conservative `amountOutMinimum`.
