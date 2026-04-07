# Price Discovery

## On-Chain Quoting

`Pool` exposes a gas-free view function for computing swap output amounts:

```solidity
function quoteExactIn(
    address tokenIn,
    address tokenOut,
    uint256 amountIn
) external view returns (uint256 amountOut);
```

- **Gas cost**: 0 (view function, use via `eth_call`)
- **Return value**: `amountOut` — net output after fees

For direction-specific quoting and curve introspection, the ABI also exposes:

```solidity
function quoteXToY(uint256 dx) external view returns (uint256 dy, uint160 pNext, uint256 fee);
function quoteYToX(uint256 dy) external view returns (uint256 dx, uint160 pNext, uint256 fee);
function state() external view returns (uint160 pX96, uint48 fee, uint48 latestUpdateBlock);
function isFresh() external view returns (bool fresh);
function blockDelay() external view returns (uint48);
```

Integrators should gate execution on `isFresh()` or compare `state().latestUpdateBlock` with `blockDelay()` before trusting a quote for execution.

## API Endpoints

### Get Pairs

```http
GET /api/quote/pairs
```

Returns available trading pairs with token metadata.

**Response:**

```json
{
	"success": true,
	"data": [
		{
			"symbol": "ETH-USDC",
			"tokens": {
				"tokenX": {
					"address": "0x...",
					"name": "Ether",
					"symbol": "ETH",
					"decimals": 18
				},
				"tokenY": {
					"address": "0x...",
					"name": "USD Coin",
					"symbol": "USDC",
					"decimals": 18
				}
			}
		}
	]
}
```

### Quote Exact Input

```http
GET /api/quote/exact-in
```

**Query Parameters:**

| Parameter  | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| `tokenIn`  | `address` | Token address being sold      |
| `tokenOut` | `address` | Token address being bought    |
| `amountIn` | `uint256` | Amount in minimal units (wei) |

**Response:**

```json
{
	"success": true,
	"data": {
		"amountOut": "2500000000",
		"price": "2500.50",
		"priceImpact": "0.15",
		"fee": "0.003"
	}
}
```

## Rate Limiting

Public endpoints are rate-limited by IP. Check response headers:

| Header                  | Description                 |
| ----------------------- | --------------------------- |
| `X-RateLimit-Limit`     | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests          |
| `X-RateLimit-Reset`     | Reset time (Unix timestamp) |

## Error Responses

```json
{
	"success": false,
	"statusCode": 400,
	"error": "Bad Request",
	"message": "Invalid token address",
	"timestamp": 1708934400000
}
```
