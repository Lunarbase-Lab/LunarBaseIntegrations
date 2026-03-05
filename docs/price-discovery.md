# Price Discovery

## On-Chain Quoting

The periphery exposes a gas-free view function for computing swap output amounts:

```solidity
function quoteExactIn(QuoteParams calldata params) external view returns (uint256 amountOut);

struct QuoteParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
}
```

- **Gas cost**: 0 (view function, use via `eth_call`)
- **Return value**: `amountOut` — net output after fees
- **Does not revert**. Returns `0` when:
    - Operator state is stale (`block.number >= latestUpdateBlock + blockDelay`)
    - Input exceeds the maximum tradeable amount within the current active band

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
