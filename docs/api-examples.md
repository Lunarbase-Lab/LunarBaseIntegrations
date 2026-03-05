# Dark Pools API - Integration Examples

### JavaScript/TypeScript with Viem

```typescript
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const API_BASE = "https://api.yourdomain.com/api";

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const CURVE_PMM_PERIPHERY = "0xActualRouterAddress";

// Permit2 signature helper
async function signPermit2Transfer(
	account: Account,
	permit: {
		permitted: {
			token: string;
			amount: string;
		};
		spender: string;
		nonce: string;
		deadline: number;
	},
	chainId: number,
): Promise<string> {
	return await account.signTypedData({
		domain: {
			name: "Permit2",
			chainId,
			verifyingContract: PERMIT2,
		},
		types: {
			TokenPermissions: [
				{ name: "token", type: "address" },
				{ name: "amount", type: "uint256" },
			],
			PermitTransferFrom: [
				{ name: "permitted", type: "TokenPermissions" },
				{ name: "spender", type: "address" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		},
		primaryType: "PermitTransferFrom",
		message: {
			permitted: {
				token: permit.permitted.token,
				amount: BigInt(permit.permitted.amount),
			},
			spender: CURVE_PMM_PERIPHERY,
			nonce: BigInt(permit.nonce),
			deadline: BigInt(permit.deadline),
		},
	});
}

// Get quote
async function getQuote(tokenIn: string, tokenOut: string, amountIn: string, slippageBps: number = 50) {
	const params = new URLSearchParams({
		tokenIn,
		tokenOut,
		amountIn,
		slippageBps: slippageBps.toString(),
	});

	const response = await fetch(`${API_BASE}/quote/exact-in?${params}`);
	const data = await response.json();

	// Check HTTP status
	if (!response.ok) {
		throw new Error(`HTTP ${data.statusCode}: ${data.message}`);
	}

	// Check business logic success
	if (!data.success) {
		const { code, detail, extra } = data.reason;
		throw new Error(`${code}: ${detail}${extra ? ` (${JSON.stringify(extra)})` : ""}`);
	}

	return data.data;
}

// Execute swap
async function executeSwap(
	walletClient: WalletClient,
	account: Account,
	tokenIn: string,
	tokenOut: string,
	amountIn: string,
	recipient: string,
	slippageBps: number = 50,
) {
	const deadline = Math.floor(Date.now() / 1000) + 300; // +5 minutes
	const isNative = tokenIn === "0x0000000000000000000000000000000000000000";

	let permit2Nonce: string | undefined;
	let permit2Signature: string | undefined;

	// Get Permit2 signature only for ERC20 tokens
	if (!isNative) {
		// 1. Get nonce
		const nonceResp = await fetch(`${API_BASE}/quote/permit2/nonce?signer=${account.address}`);
		const nonceData = await nonceResp.json();

		if (!nonceData.success) {
			throw new Error("Failed to get nonce");
		}

		permit2Nonce = parseInt(nonceData.data.nonce);

		// 2. Sign Permit2
		permit2Signature = await signPermit2Transfer(
			account,
			{
				permitted: {
					token: tokenIn,
					amount: amountIn,
				},
				spender: CURVE_PMM_PERIPHERY,
				nonce: nonceData.data.nonce,
				deadline,
			},
			walletClient.chain.id,
		);
	}

	// 3. Get calldata
	const calldataResp = await fetch(`${API_BASE}/quote/exact-in/calldata`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			recipient,
			tokenIn,
			tokenOut,
			amountIn,
			slippageBps,
			deadline,
			...(permit2Nonce !== undefined && { permit2Nonce }),
			...(permit2Signature && { permit2Signature }),
		}),
	});

	const calldataData = await calldataResp.json();

	if (!calldataResp.ok) {
		throw new Error(`HTTP ${calldataData.statusCode}: ${calldataData.message}`);
	}

	if (!calldataData.success) {
		const { code, detail } = calldataData.reason;
		throw new Error(`${code}: ${detail}`);
	}

	// 4. Execute transaction
	const hash = await walletClient.sendTransaction({
		account,
		to: calldataData.data.router,
		data: calldataData.data.callData,
		value: isNative ? BigInt(amountIn) : 0n,
	});

	return hash;
}

// Example usage
async function main() {
	const account = privateKeyToAccount("0x...");
	const client = createWalletClient({
		account,
		chain: base,
		transport: http(),
	});

	try {
		// Get quote for 1 ETH -> USDC
		const quote = await getQuote(
			"0x0000000000000000000000000000000000000000", // ETH
			"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
			parseEther("1").toString(),
			50, // 0.5% slippage
		);

		console.log("Quote:", {
			amountOut: quote.amountOut,
			amountOutMinimum: quote.amountOutMinimum,
			blockAge: quote.blockAge,
		});

		// Execute swap
		const hash = await executeSwap(
			client,
			account,
			quote.tokenIn,
			quote.tokenOut,
			quote.amountIn,
			account.address,
			50,
		);

		console.log("Transaction hash:", hash);
	} catch (error) {
		console.error("Error:", error.message);
	}
}
```

### Python

```python
import requests
from typing import Optional
from eth_account import Account
from eth_account.messages import encode_structured_data

API_BASE = 'https://api.yourdomain.com/api'
PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
CURVE_PMM_PERIPHERY = '0xYourRouterAddress'

def sign_permit2_transfer(
    account: Account,
    token: str,
    amount: str,
    nonce: str,
    deadline: int,
    chain_id: int
) -> str:
    """Sign Permit2 transfer"""
    message = {
        'domain': {
            'name': 'Permit2',
            'chainId': chain_id,
            'verifyingContract': PERMIT2,
        },
        'types': {
            'EIP712Domain': [
                {'name': 'name', 'type': 'string'},
                {'name': 'chainId', 'type': 'uint256'},
                {'name': 'verifyingContract', 'type': 'address'},
            ],
            'TokenPermissions': [
                {'name': 'token', 'type': 'address'},
                {'name': 'amount', 'type': 'uint256'},
            ],
            'PermitTransferFrom': [
                {'name': 'permitted', 'type': 'TokenPermissions'},
                {'name': 'spender', 'type': 'address'},
                {'name': 'nonce', 'type': 'uint256'},
                {'name': 'deadline', 'type': 'uint256'},
            ],
        },
        'primaryType': 'PermitTransferFrom',
        'message': {
            'permitted': {
                'token': token,
                'amount': int(amount),
            },
            'spender': CURVE_PMM_PERIPHERY,
            'nonce': int(nonce),
            'deadline': deadline,
        },
    }

    encoded = encode_structured_data(message)
    signed = account.sign_message(encoded)
    return signed.signature.hex()

def get_quote(
    token_in: str,
    token_out: str,
    amount_in: str,
    slippage_bps: int = 50
):
    """Get swap quote"""
    params = {
        'tokenIn': token_in,
        'tokenOut': token_out,
        'amountIn': amount_in,
        'slippageBps': slippage_bps,
    }

    response = requests.get(f'{API_BASE}/quote/exact-in', params=params)
    data = response.json()

    # Check HTTP status
    if not response.ok:
        raise Exception(f"HTTP {data['statusCode']}: {data['message']}")

    # Check business logic
    if not data['success']:
        reason = data['reason']
        raise Exception(f"{reason['code']}: {reason['detail']}")

    return data['data']

# Example usage
if __name__ == '__main__':
    quote = get_quote(
        '0x0000000000000000000000000000000000000000',  # ETH
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  # USDC
        '1000000000000000000',  # 1 ETH
        50  # 0.5% slippage
    )

    print(f'Quote: {quote}')
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
