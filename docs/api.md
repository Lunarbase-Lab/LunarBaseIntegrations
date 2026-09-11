# Hosted REST API

A hosted instance has its own chain, configured pools and rollout schedule. Discover its pools through `/quote/config` and `/quote/pairs`; the [deployment registry](../mainnet/addresses.json) remains the contract address reference.

The existing hosted API base URL is `https://api-pmm.lunarbase.gg/api`, with Swagger at `/api/v1`. Confirm that the chosen host serves the intended chain before using it. Adding a Base pool to this repository does not configure a hosted instance.

## Routes and authentication

Paths below are relative to `/api`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/quote/config` | Public | Configured pool symbols/addresses and `actualCallers` |
| GET | `/quote/pairs` | Public | Symbols and token X/Y metadata, including decimals |
| GET | `/quote/permit2/nonce?signer=0x...` | Partner | Find an unused Permit2 bitmap nonce |
| GET | `/quote/exact-in` | Partner | Calculate an exact-input quote |
| POST | `/quote/exact-in/approve/calldata` | Partner | Encode the direct-allowance or native-input call |
| POST | `/quote/exact-in/permit/calldata` | Partner | Encode an ERC-20 Permit2 call |
| POST | `/quote/exact-in/calldata` | Partner | Combined route; permit fields select the Permit2 overload |

Partner routes require an enabled, unexpired Partner-tier (or higher) key in `X-API-Key`. Public routes accept optional API keys. Rate limits are configurable; defaults are 20 requests/minute for public access and 500 for partners. Use `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and, on HTTP 429, `Retry-After`.

## Quote request

| Field | Type | Meaning |
| --- | --- | --- |
| `symbol` | optional string | A symbol returned by this host; specify it when a token pair is ambiguous |
| `tokenIn`, `tokenOut` | address strings | Actual pool tokens; `address(0)` denotes native currency only in a native-token pool |
| `amountIn` | decimal integer string | Raw input token units, using that token's decimals |
| `slippageBps` | integer, 1–9999 | Minimum-output tolerance; denominator 10,000 |

For Base ETH/USDC, native ETH has 18 decimals and USDC has 6: 1 ETH is `"1000000000000000000"`, while 1 USDC is `"1000000"`. WETH is a different address and is not an alias for native ETH in this pool.

The minimum is calculated with integer rounding:

```text
amountOutMinimum = floor(amountOut * (10000 - slippageBps) / 10000)
```

The API returns `ZERO_AMOUNT` if this result is zero. Slippage basis points are unrelated to the contract's Q24 directional fee representation.

## Calldata request

All calldata routes accept the quote fields plus:

| Field | Type | Meaning |
| --- | --- | --- |
| `recipient` | address string | Recipient of the output |
| `deadline` | integer | Unix timestamp in seconds |
| `permit2Nonce` | optional integer | Permit2 nonce; required on the permit route |
| `permit2Signature` | optional hex string | 65-byte signature; required on the permit route |

On the combined route, omit both permit fields for direct allowance/native input, or supply both for Permit2. The approve route does not accept permit fields. The permit route is intended for ERC-20 input. The backend selects the native entrypoint when `tokenIn` is `address(0)`.

The response's `router` is the Pool address, and `callData` is encoded for its current swap entrypoints. Before submitting, verify the chain, pool, caller, token pair, minimum output and deadline. Direct ERC-20 input requires allowance to the Pool; Permit2 requires ERC-20 allowance to Permit2 and a signature whose spender is the Pool. The Permit2 owner is the immediate caller of the Pool. See [settlement](settlement.md).

Native input requires transaction `value = amountIn`; ERC-20 input requires `value = 0`. The response does not supply a transaction value field.

**Calldata deadline compatibility:** a hosted deployment may reject a valid Unix-second deadline with HTTP 400 (`deadline already expired`) because of a seconds/milliseconds mismatch. If this occurs, encode the swap directly with the [trading ABI](../abi/Pool.trading.abi.json). Keep the on-chain deadline in seconds; sending milliseconds would create an unintended, extremely long validity period.

## Responses and errors

Quote routes return a reason envelope. Successful responses contain `symbol`, `tokenIn`, `tokenOut`, `amountIn`, `amountOut`, `amountOutMinimum`, `blockAge`, `router`, and optionally `callData`:

```json
{"success":true,"reason":{"code":"OK"},"data":{}}
```

Here `{}` abbreviates the fields described above. Amounts are decimal strings, including the nonce returned by the nonce endpoint. Do not convert token amounts to JavaScript `Number`.

Business errors return HTTP 200 with `success: false`:

```json
{"success":false,"reason":{"code":"STALE_PRICE","detail":"Price is stale","extra":{"blockAge":3}}}
```

| Code | Meaning |
| --- | --- |
| `STALE_PRICE` | Cached operator update is at least two blocks old |
| `SWAP_IMPOSSIBLE` | Pair/state errors caught by the quote handler, or outdated block data |
| `PAUSED` | Cached pool state is paused |
| `ZERO_AMOUNT` | Slippage-adjusted minimum is zero |
| `UNKNOWN_ERROR` | Calculation or calldata encoding failed |

Validation, authentication, rate limiting and server failures use HTTP errors (including 400, 403, 429 and 500), generally with `success`, `statusCode`, `error`, `message`, optional `extra`, and `timestamp`. Check HTTP status before the reason envelope; proxies may also return non-JSON errors.

Unknown or ambiguous pool lookup can return an HTTP error instead of a `SWAP_IMPOSSIBLE` envelope. Discover configured symbols first and still handle both error forms.

## Quote parity boundaries

The hosted quote API has no caller field and calculates quotes with multiplier one. A non-whitelisted caller may receive less on-chain when `blacklistFeeMultiplier()` exceeds one. `actualCallers` is informational and does not make the API quote caller-aware.

For execution, obtain an on-chain quote with `eth_call.from` equal to the immediate Pool caller, or build an off-chain snapshot with that caller's actual multiplier. An aggregator contract is the caller when it calls the Pool. Keep `amountOutMinimum` in the final transaction and simulate the complete call.

The API's `blockAge >= 2` rule is a separate cache policy from the Pool's configurable `blockDelay()`. A REST success is not proof of on-chain freshness, available allowance, fee-accounting capacity or transaction success. See [price discovery](price-discovery.md) and [off-chain integration](offchain-integration.md).

## Permit2 nonce handling

Permit2 SignatureTransfer uses unordered bitmap nonces. The nonce endpoint scans for an unused bit; it does not reserve that nonce. Concurrent clients can receive the same nonce. Coordinate nonce reservations across pending signatures and recheck on-chain consumption; do not assume `nonce + 1` is unused.

The nonce request accepts a JSON integer although the response uses a decimal string. JavaScript clients must reject nonces above `Number.MAX_SAFE_INTEGER` before converting for this REST route; a direct contract integration can use the full uint256 nonce. Do not reuse a nonce merely because the swap has not yet confirmed.
