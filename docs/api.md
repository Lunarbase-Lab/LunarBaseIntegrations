# Dark Pools API - Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Base URL & Endpoints](#base-url--endpoints)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Response Format](#response-format)
6. [Endpoints](#endpoints)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Overview

Dark Pools API provides access to a Proprietary AMM (Automated Market Maker) for getting quotes and executing token swaps.

**Key Features:**

- RESTful API with JSON responses
- Rate limiting by IP and API key
- TypeScript type safety with TypeBox
- OpenAPI/Swagger documentation
- Real-time price updates
- Permit2 integration for gasless approvals
- BigInt support (all amounts returned as strings)

---

## Base URL & Endpoints

### Production

```
https://api-pmm.lunarbase.gg/api
```

### Swagger UI

```
https://api-pmm.lunarbase.gg/api/v1
```

---

## Authentication

### Public Endpoints

Public endpoints are accessible without an API key, but rate limited (100 req/min per IP).

### Partner Endpoints (commented out in current version)

Require API key in header:

```
X-API-Key: sk_partner_your_key_here
```

Or:

```
Authorization: Bearer sk_partner_your_key_here
```

---

## Rate Limiting

All responses include rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1709638800
```

**Limits:**

- Public (by IP): 100 requests/minute
- Partner (with API key): 500 requests/minute

**When limit exceeded:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{
  "success": false,
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "extra": {
    "retryAfterMs": 42000
  },
  "timestamp": 1709638758123
}
```

---

## Response Format

API uses **two response formats** depending on the endpoint:

### 1. Success Envelope (Health endpoints)

Used for health checks and informational endpoints.

**Success:**

```json
{
	"success": true,
	"data": {
		// your data here
	}
}
```

**Error:**

```json
{
	"success": false,
	"statusCode": 400,
	"error": "Bad Request",
	"message": "Invalid input data",
	"extra": {
		/* additional info */
	},
	"timestamp": 1709638758123
}
```

### 2. Reason Envelope (Quote endpoints)

Used for quote and swap endpoints. **Always returns HTTP 200**, check `success` field.

**Success:**

```json
{
	"success": true,
	"reason": {
		"code": "OK"
	},
	"data": {
		"tokenIn": "0x0000000000000000000000000000000000000000",
		"tokenOut": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"amountIn": "1000000000000000000",
		"amountOut": "2120099686",
		"amountOutMinimum": "1908089717",
		"blockAge": 0,
		"router": "0xc9160c609cb928551a8dfa188a991f833424b0d3"
	}
}
```

**Business Logic Error (HTTP 200):**

```json
{
	"success": false,
	"reason": {
		"code": "STALE_PRICE",
		"detail": "Price is stale",
		"extra": {
			"blockAge": 5,
			"priceBlock": 1000,
			"currentBlock": 1005
		}
	}
}
```

**⚠️ Important:** Quote endpoints can also return HTTP 400/500 for validation errors and internal server errors! Always check both HTTP status AND `success` field.

**Validation Error (HTTP 400):**

```json
{
	"success": false,
	"statusCode": 400,
	"error": "Bad Request",
	"message": "Invalid tokenIn address",
	"extra": {
		"tokenIn": "invalid"
	},
	"timestamp": 1709638758123
}
```

**Reason Codes (HTTP 200 responses):**

- `OK` - Successful operation
- `STALE_PRICE` - Price data is stale (blockAge >= 2)
- `SWAP_IMPOSSIBLE` - Cannot execute swap (unknown token, same tokens, etc.)
- `PAUSED` - PMM is paused
- `ZERO_AMOUNT` - Zero amount after applying slippage
- `UNKNOWN_ERROR` - Unknown error during calculation

---

## Endpoints

### Quote

#### GET `/api/quote/pairs`

Returns available trading pairs.

**Response:**

```json
{
	"success": true,
	"reason": { "code": "OK" },
	"data": [
		{
			"symbol": "ETH-USDC",
			"tokens": {
				"tokenX": {
					"address": "0x0000000000000000000000000000000000000000",
					"name": "Ether",
					"symbol": "ETH",
					"decimals": 18
				},
				"tokenY": {
					"address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
					"name": "USD Coin",
					"symbol": "USDC",
					"decimals": 6
				}
			}
		}
	]
}
```

---

#### GET `/api/quote/permit2/nonce?signer=0x...`

Get current nonce for Permit2.

**Query Parameters:**

- `signer` (string, required): Ethereum address of the signer

**Example:**

```
GET /api/quote/permit2/nonce?signer=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Response:**

```json
{
	"success": true,
	"reason": { "code": "OK" },
	"data": {
		"signer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
		"nonce": "1"
	}
}
```

---

#### GET `/api/quote/exact-in`

Get quote for exact input amount.

**Query Parameters:**

- `tokenIn` (string, required): Input token address (use `0x0000000000000000000000000000000000000000` for native token)
- `tokenOut` (string, required): Output token address
- `amountIn` (string, required): Input amount in wei (e.g., "1000000000000000000" for 1 ETH)
- `slippageBps` (integer, required): Slippage in basis points (50 = 0.5%, max 9999)

**Example:**

```
GET /api/quote/exact-in?tokenIn=0x0000000000000000000000000000000000000000&tokenOut=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&amountIn=1000000000000000000&slippageBps=50
```

**Response (Success):**

```json
{
	"success": true,
	"reason": { "code": "OK" },
	"data": {
		"tokenIn": "0x0000000000000000000000000000000000000000",
		"tokenOut": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"amountIn": "1000000000000000000",
		"amountOut": "2120099686",
		"amountOutMinimum": "2109499671",
		"blockAge": 0,
		"router": "0xc9160c609cb928551a8dfa188a991f833424b0d3"
	}
}
```

**Response (Validation Error - HTTP 400):**

```json
{
	"success": false,
	"statusCode": 400,
	"error": "Bad Request",
	"message": "Invalid tokenIn address",
	"extra": {
		"tokenIn": "not-an-address"
	},
	"timestamp": 1709638758123
}
```

**Response (Stale Price - HTTP 200):**

```json
{
	"success": false,
	"reason": {
		"code": "STALE_PRICE",
		"detail": "Price is stale",
		"extra": {
			"blockAge": 3,
			"priceBlock": 1000,
			"currentBlock": 1003
		}
	}
}
```

**Response (PMM Paused - HTTP 200):**

```json
{
	"success": false,
	"reason": {
		"code": "PAUSED",
		"detail": "PMM is currently paused"
	}
}
```

---

#### POST `/api/quote/exact-in/calldata`

Get calldata for swap execution.

**Body Parameters:**

```json
{
	"recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
	"tokenIn": "0x0000000000000000000000000000000000000000",
	"tokenOut": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	"amountIn": "1000000000000000000",
	"slippageBps": 50,
	"deadline": 1709638800,
	"permit2Nonce": 1, // Required for ERC20 tokenIn
	"permit2Signature": "0x..." // Required for ERC20 tokenIn
}
```

**⚠️ Important:** `permit2Nonce` and `permit2Signature` are **required only for ERC20 tokens**. For native token (ETH), these fields are optional and will be ignored.

**Response:**

```json
{
	"success": true,
	"reason": { "code": "OK" },
	"data": {
		"tokenIn": "0x0000000000000000000000000000000000000000",
		"tokenOut": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		"amountIn": "1000000000000000000",
		"amountOut": "2120099686",
		"amountOutMinimum": "2109499671",
		"blockAge": 0,
		"router": "0xc9160c609cb928551a8dfa188a991f833424b0d3",
		"callData": "0x3593564c000000000000000000000000..."
	}
}
```

---

## Error Handling

### Two Types of Errors

**1. HTTP Errors (400, 500)**
For validation errors and server errors. Check HTTP status code.

```json
{
	"success": false,
	"statusCode": 400,
	"error": "Bad Request",
	"message": "Invalid tokenIn address",
	"extra": { "tokenIn": "invalid" },
	"timestamp": 1709638758123
}
```

**2. Business Logic Errors (HTTP 200)**
For application-level errors (stale price, paused, etc.). Always HTTP 200, check `success` field.

```json
{
	"success": false,
	"reason": {
		"code": "STALE_PRICE",
		"detail": "Price is stale",
		"extra": { "blockAge": 3 }
	}
}
```

### Error Handling Flow

```typescript
const response = await fetch(url);
const data = await response.json();

// Check HTTP status first
if (!response.ok) {
	// HTTP error (400, 500, etc.)
	throw new Error(`HTTP ${data.statusCode}: ${data.message}`);
}

// Then check success field
if (!data.success) {
	// Business logic error
	const { code, detail } = data.reason;
	throw new Error(`${code}: ${detail}`);
}

// Success - use data
return data.data;
```

---

## Best Practices

### 1. Error Handling

```typescript
// Always check both HTTP status AND success field
const response = await fetch(url);
const data = await response.json();

if (!response.ok) {
	// HTTP error (400, 500)
	throw new Error(`HTTP ${data.statusCode}: ${data.message}`);
}

if (!data.success) {
	// Business logic error (200 with success: false)
	const { code, detail } = data.reason;
	throw new Error(`${code}: ${detail}`);
}

// Now safe to use data.data
```

### 7. Permit2 Nonce Management

**Don't** request nonce from API for every swap:

```typescript
❌ // Bad: API call for each swap
for (const swap of swaps) {
  const { nonce } = await getNonce(signer);
  await executeSwap(..., nonce, ...);
}
```

**Do** fetch once and increment locally:

```typescript
✅ // Good: Fetch once, increment locally
let currentNonce = await getNonce(signer);

for (const swap of swaps) {
  const signature = await signPermit2(account, {
    token: swap.tokenIn,
    amount: swap.amountIn,
    nonce: currentNonce.toString(),
    deadline,
  });

  await executeSwap(..., currentNonce, signature);

  currentNonce++; // Increment locally
}
```

**Production approach with Redis:**

```typescript
import Redis from 'ioredis';

class Permit2NonceManager {
  private redis: Redis;
  private cacheKey = (signer: string) => `permit2:nonce:${signer.toLowerCase()}`;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get current nonce (from cache or API)
   */
  async getNonce(signer: string): Promise {
    // Try cache first
    const cached = await this.redis.get(this.cacheKey(signer));
    if (cached !== null) {
      return parseInt(cached);
    }

    // Fetch from API
    const response = await fetch(
      `${API_BASE}/quote/permit2/nonce?signer=${signer}`
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error('Failed to get nonce');
    }

    const nonce = parseInt(data.data.nonce);

    // Cache with 1 hour TTL
    await this.redis.setex(this.cacheKey(signer), 3600, nonce.toString());

    return nonce;
  }

  /**
   * Get next nonce and increment in cache
   */
  async getNextNonce(signer: string): Promise {
    const key = this.cacheKey(signer);

    // Try atomic increment
    const nonce = await this.redis.incr(key);

    // If first time (nonce === 1), fetch from API
    if (nonce === 1) {
      const actualNonce = await this.getNonce(signer);
      await this.redis.setex(key, 3600, actualNonce.toString());
      return actualNonce;
    }

    // Refresh TTL
    await this.redis.expire(key, 3600);

    return nonce - 1; // Return value before increment
  }

  /**
   * Reset cache (use when nonce mismatch detected)
   */
  async resetNonce(signer: string): Promise {
    await this.redis.del(this.cacheKey(signer));
  }
}

// Usage
const nonceManager = new Permit2NonceManager(redis);

async function executeMultipleSwaps(swaps: Swap[]) {
  for (const swap of swaps) {
    try {
      const nonce = await nonceManager.getNextNonce(signer);

      const signature = await signPermit2Transfer(
        account,
        { ...swap, nonce: nonce.toString(), deadline },
        chainId
      );

      await executeSwap(..., nonce, signature);

    } catch (error) {
      if (error.message.includes('nonce')) {
        // Reset cache on nonce mismatch
        await nonceManager.resetNonce(signer);
        throw error;
      }
    }
  }
}
```

**Why this matters:**

- Reduces API calls: 1 instead of N for N swaps
- Faster execution: no network roundtrip
- Rate limit friendly: stays within 100 req/min easily
- Handles concurrent swaps correctly with Redis atomic operations

**Important:** Always handle nonce mismatch errors by resetting cache and refetching from API.

````

### 3. Slippage

```typescript
const SLIPPAGE = {
  LOW: 10,      // 0.1% - for stable pairs
  MEDIUM: 50,   // 0.5% - standard
  HIGH: 100,    // 1.0% - for volatile pairs
  MAX: 500,     // 5.0% - maximum for large trades
};
````

### 4. Deadline

```typescript
// Always use deadline for MEV protection
const DEADLINE_OFFSET = 5 * 60; // 5 minutes

function getDeadline(): number {
	return Math.floor(Date.now() / 1000) + DEADLINE_OFFSET;
}
```

### 5. BigInt Handling

```typescript
// API returns amounts as strings to support BigInt
const amountOut = BigInt(quote.amountOut); // ✅
const amountOut = parseInt(quote.amountOut); // ❌ precision loss

// Format for display
function formatAmount(amount: string, decimals: number): string {
	const value = BigInt(amount);
	const divisor = BigInt(10 ** decimals);
	return (Number(value) / Number(divisor)).toFixed(decimals);
}
```

### 6. Rate Limiting with Retry

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
	for (let i = 0; i < maxRetries; i++) {
		const response = await fetch(url);

		if (response.status === 429) {
			const retryAfter = parseInt(response.headers.get("Retry-After") || "60");
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
			continue;
		}

		return response;
	}

	throw new Error("Max retries exceeded");
}
```

**Rate Limit Increase:**
Contact us for Partner API key with higher limits.

---

## Changelog

### v0.1.0 (Current)

- ✅ Quote exact-in endpoint
- ✅ Swap calldata generation
- ✅ Permit2 nonce lookup
- ✅ Reason envelope for business logic errors
- ✅ Rate limiting with headers
- ✅ BigInt support (all amounts as strings)
