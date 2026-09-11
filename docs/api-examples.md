# API and Swap Examples

These examples cover Base ETH/USDC quotes, native swaps, direct ERC-20 allowance and Permit2. Use a Partner API key for the hosted quote/calldata routes. Keep API keys and signing credentials in your server environment.

The TypeScript swap helper loads [Pool.trading.abi.json](../abi/Pool.trading.abi.json) from the repository root and uses Viem 2.x. Set `API_BASE` to the intended host's `/api` URL, `LUNARBASE_API_KEY`, `BASE_RPC_URL`, and `PRIVATE_KEY` for the wallet examples. The quote-only examples do not require a signing key.

## JavaScript / Node.js 18+

Set `API_BASE` to the intended instance's `/api` URL and `LUNARBASE_API_KEY` to a Partner API key. Keep this key on the server.

```javascript
const apiBase = process.env.API_BASE?.replace(/\/$/, '');
const apiKey = process.env.LUNARBASE_API_KEY;
if (!apiBase || !apiKey) throw new Error('Set API_BASE and LUNARBASE_API_KEY');

async function api(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'X-API-Key': apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${payload?.message ?? response.statusText}`);
  }
  if (!payload?.success) {
    throw new Error(`${payload?.reason?.code ?? 'INVALID_RESPONSE'}: ${payload?.reason?.detail ?? ''}`);
  }
  return payload.data;
}

const tokenIn = '0x0000000000000000000000000000000000000000'; // native ETH
const tokenOut = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC
const pairs = await api('/quote/pairs');
const matching = pairs.filter(({ tokens }) =>
  tokens.tokenX.address.toLowerCase() === tokenIn.toLowerCase() &&
  tokens.tokenY.address.toLowerCase() === tokenOut.toLowerCase());
if (matching.length !== 1) throw new Error('Select a unique configured ETH/USDC pool');

const query = new URLSearchParams({
  symbol: matching[0].symbol,
  tokenIn,
  tokenOut,
  amountIn: '1000000000000000000', // 1 ETH, eighteen decimals
  slippageBps: '50',
});
const quote = await api(`/quote/exact-in?${query}`);
const expectedPool = '0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99';
if (quote.router.toLowerCase() !== expectedPool.toLowerCase()) {
  throw new Error('Host returned a different pool');
}
console.log({
  pool: quote.router,
  amountOutRaw: BigInt(quote.amountOut),
  minimumOutRaw: BigInt(quote.amountOutMinimum),
  blockAge: quote.blockAge,
});
```

The host may not list this pool yet. In that case, use the contract directly with the published ABI. A matching address alone does not identify a chain; select Base (`8453`) explicitly in the execution client.

## Complete Swaps with TypeScript and Viem

The helper discovers the hosted symbol and checks the expected Base pool. It obtains a fresh on-chain quote from the actual wallet caller, because a hosted quote uses multiplier one. `prepareSwap` returns both prices and a proposed minimum; `executeSwap` explicitly sends the prepared transaction after another simulation.

Choose `encoding: 'local'` to encode with the ABI, or `'hosted'` to request `/approve/calldata` or `/permit/calldata`. Hosted encoding must preserve the requested swap and meet the caller-aware minimum. A hosted deadline-unit error stops preparation; switching to local encoding is an explicit choice, and deadlines always remain Unix seconds. See [API limitations](api.md#calldata-request).

Pass `amountOutMinimum` when preserving a price limit already accepted by your caller. Preparation never lowers that value. Otherwise the proposed minimum comes from the caller-aware quote and the selected slippage. The initial hosted quote is informational.

```typescript
import { readFileSync } from 'node:fs';
import {
  createPublicClient, createWalletClient, encodeFunctionData, erc20Abi,
  http, isAddressEqual, parseAbi, zeroAddress,
  type Abi, type Account, type Address, type Hex,
} from 'viem';
import { base } from 'viem/chains';

// Run from this repository's root. No code below runs a transaction on import.
const poolAbi = JSON.parse(readFileSync('abi/Pool.trading.abi.json', 'utf8')) as Abi;
export const POOL = '0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99' as const;
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
const bitmapAbi = parseAbi(['function nonceBitmap(address owner, uint256 word) view returns (uint256)']);
const permitTypes = {
  TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' }, { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ],
} as const;

type Flow = 'native' | 'approve' | 'permit2';
type Pair = { symbol: string; tokens: { tokenX: { address: Address }; tokenY: { address: Address } } };
type Quote = {
  symbol: string; router: Address; tokenIn: Address; tokenOut: Address;
  amountIn: string; amountOut: string; amountOutMinimum: string; callData?: Hex;
};
type Options = {
  flow: Flow; amountIn: bigint; slippageBps: number; recipient: Address;
  encoding: 'local' | 'hosted'; amountOutMinimum?: bigint; ttlSeconds?: number;
  permitNonce?: bigint;
};
type Prepared = {
  to: typeof POOL; data: Hex; value: bigint; caller: Address; deadline: bigint;
  amountOutMinimum: bigint; callerAmountOut: bigint; hostedAmountOut: bigint; permitNonce?: bigint;
};
const uint = (value: string) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Expected unsigned decimal integer');
  const result = BigInt(value);
  if (result >= 1n << 256n) throw new Error('Integer exceeds uint256');
  return result;
};
const maximum = (...values: bigint[]) => values.reduce((a, b) => a > b ? a : b);

export function createSwapExample(config: {
  apiBase: string; apiKey: string; rpcUrl: string; account: Account;
  // Atomically reserve the key; production storage must survive workers/restarts.
  // Keep it reserved while any signature can still execute; the API reserves nothing.
  reserveNonce?: (key: string) => Promise<boolean>;
}) {
  const { account } = config;
  const rpc = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({ chain: base, account, transport: http(config.rpcUrl) });
  async function api<T>(path: string, body?: object): Promise<T> {
    const response = await fetch(`${config.apiBase.replace(/\/$/, '')}${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15_000),
      headers: { 'X-API-Key': config.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload?.message ?? response.statusText)}`);
    if (!payload?.success) throw new Error(`${payload?.reason?.code ?? 'INVALID_RESPONSE'}: ${payload?.reason?.detail ?? ''}`);
    return payload.data as T;
  }
  async function checkChain() {
    if (await rpc.getChainId() !== base.id || await wallet.getChainId() !== base.id) {
      throw new Error('Both clients must use Base (8453)');
    }
  }
  async function unusedNonce(nonce: bigint) {
    if (nonce < 0n || nonce >= 1n << 256n) throw new Error('Invalid Permit2 nonce');
    const bitmap = await rpc.readContract({
      address: PERMIT2, abi: bitmapAbi, functionName: 'nonceBitmap',
      args: [account.address, nonce >> 8n],
    });
    if ((bitmap & (1n << (nonce & 255n))) !== 0n) throw new Error('Permit2 nonce already consumed');
  }
  async function receipt(hash: Hex) {
    const result = await rpc.waitForTransactionReceipt({ hash });
    if (result.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
    return result;
  }

  // Explicitly broadcasts approval(s). Call BEFORE preparing a quote/signature.
  // Native ETH input needs no approval; approve USDC to the Pool or to Permit2.
  async function approveUsdc(flow: 'approve' | 'permit2', amountIn: bigint) {
    if (amountIn <= 0n) throw new Error('amountIn must be positive');
    await checkChain();
    const spender = flow === 'permit2' ? PERMIT2 : POOL;
    const allowance = await rpc.readContract({
      address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address, spender],
    });
    if (allowance >= amountIn) return;
    for (const amount of allowance > 0n ? [0n, amountIn] : [amountIn]) {
      const { request } = await rpc.simulateContract({
        account, address: USDC, abi: erc20Abi, functionName: 'approve', args: [spender, amount],
      });
      await receipt(await wallet.writeContract(request));
    }
  }

  async function prepareSwap(options: Options): Promise<Prepared> {
    const { flow, amountIn, slippageBps, recipient, encoding } = options;
    const ttl = options.ttlSeconds ?? 120;
    if (amountIn <= 0n || amountIn >= 1n << 256n || !Number.isInteger(slippageBps)
        || slippageBps < 1 || slippageBps > 9999 || !Number.isInteger(ttl) || ttl < 1 || ttl > 3600
        || (options.amountOutMinimum ?? 0n) < 0n || isAddressEqual(recipient, zeroAddress)) {
      throw new Error('Invalid amount, slippage, recipient or validity window');
    }
    await checkChain();
    const [x, y] = await Promise.all(['X', 'Y'].map(functionName => rpc.readContract({
      address: POOL, abi: poolAbi, functionName,
    }) as Promise<Address>));
    if (!isAddressEqual(x, zeroAddress) || !isAddressEqual(y, USDC)) throw new Error('Unexpected on-chain pair');
    const pairs = await api<Pair[]>('/quote/pairs');
    const matching = pairs.filter(p => isAddressEqual(p.tokens.tokenX.address, zeroAddress)
      && isAddressEqual(p.tokens.tokenY.address, USDC));
    if (matching.length !== 1) throw new Error('Select one configured Base ETH/USDC symbol');
    const tokenIn = flow === 'native' ? zeroAddress : USDC;
    const tokenOut = flow === 'native' ? USDC : zeroAddress;
    const fields = { symbol: matching[0].symbol, tokenIn, tokenOut, amountIn: amountIn.toString(), slippageBps };
    const query = new URLSearchParams(Object.entries(fields).map(([key, value]) => [key, String(value)]));
    function validateQuote(q: Quote) {
      if (!isAddressEqual(q.router, POOL) || q.symbol !== fields.symbol
          || !isAddressEqual(q.tokenIn, tokenIn) || !isAddressEqual(q.tokenOut, tokenOut)
          || uint(q.amountIn) !== amountIn || uint(q.amountOutMinimum) === 0n
          || uint(q.amountOutMinimum) > uint(q.amountOut)) throw new Error('Quote does not match request');
    }
    const quote = await api<Quote>(`/quote/exact-in?${query}`);
    validateQuote(quote);
    // The hosted quote uses multiplier 1. eth_call.from selects this wallet's fee.
    const callerAmountOut = await rpc.readContract({
      account: account.address, address: POOL, abi: poolAbi, functionName: 'quoteExactIn',
      args: [tokenIn, tokenOut, amountIn],
    }) as bigint;
    // The caller-aware quote sets the proposed floor; the REST quote is informational.
    // Inspect the returned quote/minimum before explicitly calling executeSwap.
    const floor = maximum(options.amountOutMinimum ?? 0n,
      callerAmountOut * BigInt(10_000 - slippageBps) / 10_000n);
    if (floor === 0n) throw new Error('Minimum output rounded to zero');
    const deadline = (await rpc.getBlock()).timestamp + BigInt(ttl); // Unix SECONDS
    if (deadline > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Deadline exceeds safe JSON integer range');
    let permit: { permitted: { token: Address; amount: bigint }; nonce: bigint; deadline: bigint } | undefined;
    let signature: Hex | undefined;
    if (flow === 'permit2') {
      if (!config.reserveNonce) throw new Error('Provide an atomic nonce reservation function');
      const nonce = options.permitNonce ?? uint((await api<{ nonce: string }>(
        `/quote/permit2/nonce?signer=${account.address}`)).nonce);
      if (encoding === 'hosted' && nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Hosted JSON nonce exceeds safe integer range; choose local encoding explicitly');
      }
      await unusedNonce(nonce);
      const key = `${base.id}:${PERMIT2.toLowerCase()}:${account.address.toLowerCase()}:${nonce}`;
      if (!await config.reserveNonce(key)) throw new Error('Nonce reserved; coordinate a different unused nonce');
      permit = { permitted: { token: USDC, amount: amountIn }, nonce, deadline };
      signature = await wallet.signTypedData({
        domain: { name: 'Permit2', chainId: base.id, verifyingContract: PERMIT2 },
        types: permitTypes, primaryType: 'PermitTransferFrom', message: { ...permit, spender: POOL },
      });
    }
    function encode(amountOutMinimum: bigint) {
      const params = { tokenIn, tokenOut, recipient, amountIn, amountOutMinimum, deadline };
      return flow === 'native'
        ? encodeFunctionData({ abi: poolAbi, functionName: 'swapExactInNative', args: [tokenOut, recipient, amountOutMinimum, deadline] })
        : encodeFunctionData({ abi: poolAbi, functionName: 'swapExactIn', args: permit ? [params, permit, signature] : [params] });
    }
    let amountOutMinimum = floor;
    let data = encode(floor);
    if (encoding === 'hosted') {
      // A seconds/milliseconds bug may reject this request. Do not change units or silently retry locally.
      const encoded = await api<Quote>(`/quote/exact-in/${permit ? 'permit' : 'approve'}/calldata`, {
        ...fields, recipient, deadline: Number(deadline),
        ...(permit ? { permit2Nonce: Number(permit.nonce), permit2Signature: signature } : {}),
      });
      validateQuote(encoded);
      amountOutMinimum = uint(encoded.amountOutMinimum);
      if (amountOutMinimum < floor) throw new Error('Hosted calldata weakens the minimum; prepare a new explicit local request');
      if (encoded.callData?.toLowerCase() !== encode(amountOutMinimum).toLowerCase()) {
        throw new Error('Hosted calldata differs from the requested swap');
      }
      data = encoded.callData;
    }
    const prepared = { to: POOL, data, value: flow === 'native' ? amountIn : 0n,
      caller: account.address, deadline, amountOutMinimum, callerAmountOut,
      hostedAmountOut: uint(quote.amountOut), permitNonce: permit?.nonce };
    // Includes actual allowance, balance, recipient ETH acceptance and Pool state checks.
    await rpc.call({ account: account.address, to: POOL, data, value: prepared.value });
    return prepared;
  }

  // Explicitly broadcasts exactly the prepared call after re-simulation.
  async function executeSwap(prepared: Prepared) {
    await checkChain();
    if (!isAddressEqual(prepared.caller, account.address) || !isAddressEqual(prepared.to, POOL)) {
      throw new Error('Prepared call belongs to another wallet or pool');
    }
    if ((await rpc.getBlock()).timestamp >= prepared.deadline) throw new Error('Prepare a new quote: deadline reached');
    if (prepared.permitNonce !== undefined) await unusedNonce(prepared.permitNonce);
    const transaction = { account, to: POOL, data: prepared.data, value: prepared.value };
    await rpc.call(transaction);
    return receipt(await wallet.sendTransaction(transaction));
  }
  return { prepareSwap, approveUsdc, executeSwap };
}
```

### Using the three payment flows

Put the following code after the helper. Calling `approveUsdc` can send approval transactions; calling `executeSwap` sends the swap. The three functions below show explicit usage and are not invoked automatically.

The in-memory nonce reservation below is limited to one process session. Coordinate a durable reservation store across production workers and restarts, and keep a nonce reserved while its signature can still execute. The nonce endpoint only finds an unused bitmap bit. If a signed preparation fails, allocate another unused, unreserved nonce through `permitNonce` rather than assuming the previous signature disappeared.

```typescript
import { privateKeyToAccount } from 'viem/accounts';
// Put this after createSwapExample in the same TypeScript file.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const reserved = new Set<string>(); // Only for this single-process example session.
const swaps = createSwapExample({
  account,
  apiBase: process.env.API_BASE!,
  apiKey: process.env.LUNARBASE_API_KEY!,
  rpcUrl: process.env.BASE_RPC_URL!,
  reserveNonce: async key => {
    if (reserved.has(key)) return false;
    reserved.add(key);
    return true;
  },
});

// These functions broadcast only when you explicitly call one of them.
async function nativeEthToUsdc() {
  const prepared = await swaps.prepareSwap({
    flow: 'native', amountIn: 1_000_000_000_000_000n, // 0.001 ETH
    recipient: account.address, slippageBps: 50, encoding: 'local',
  });
  console.log(prepared.callerAmountOut, prepared.amountOutMinimum);
  return swaps.executeSwap(prepared);
}

async function usdcToEthWithApprove() {
  const amountIn = 1_000_000n; // 1 USDC
  await swaps.approveUsdc('approve', amountIn);
  const prepared = await swaps.prepareSwap({
    flow: 'approve', amountIn, recipient: account.address,
    slippageBps: 50, encoding: 'local',
  });
  console.log(prepared.callerAmountOut, prepared.amountOutMinimum);
  return swaps.executeSwap(prepared);
}

async function usdcToEthWithPermit2() {
  const amountIn = 1_000_000n;
  await swaps.approveUsdc('permit2', amountIn);
  const prepared = await swaps.prepareSwap({
    flow: 'permit2', amountIn, recipient: account.address,
    slippageBps: 50, encoding: 'local',
  });
  console.log(prepared.callerAmountOut, prepared.amountOutMinimum);
  return swaps.executeSwap(prepared);
}
```

Native input sends `value = amountIn`. Both USDC-input paths send `value = 0` and receive native ETH. Direct allowance targets the Pool; the Permit2 path targets Permit2 for allowance and the Pool as the signature's spender. Approve first and prepare the price afterward, so approval confirmation does not age the swap quote.

## Python 3 + requests

```python
import os
import requests

api_base = os.environ["API_BASE"].rstrip("/")
api_key = os.environ["LUNARBASE_API_KEY"]

def api(path, params=None):
    response = requests.get(
        f"{api_base}{path}", params=params,
        headers={"X-API-Key": api_key}, timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        reason = payload.get("reason", {})
        raise RuntimeError(f"{reason.get('code')}: {reason.get('detail', '')}")
    return payload["data"]

token_in = "0x0000000000000000000000000000000000000000"
token_out = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
pairs = [p for p in api("/quote/pairs")
         if p["tokens"]["tokenX"]["address"].lower() == token_in.lower()
         and p["tokens"]["tokenY"]["address"].lower() == token_out.lower()]
if len(pairs) != 1:
    raise RuntimeError("Select a unique configured ETH/USDC pool")
quote = api("/quote/exact-in", {
    "symbol": pairs[0]["symbol"], "tokenIn": token_in, "tokenOut": token_out,
    "amountIn": "1000000000000000000", "slippageBps": 50,
})
if quote["router"].lower() != "0x0000efc4ec03a7c47d3a38a9be7ff1d52dd01b99":
    raise RuntimeError("Host returned a different pool")
print(int(quote["amountOut"]), int(quote["amountOutMinimum"]))
```

### Signing Permit2 in Python

Install `eth-account` in addition to `requests`. This helper uses [`encode_typed_data`](https://eth-account.readthedocs.io/en/stable/eth_account.html#eth_account.messages.encode_typed_data) and returns a 65-byte hex signature for Base USDC input. The account signing must also be the immediate Pool caller. Obtain and reserve an unused Permit2 nonce before signing; the same nonce-coordination rules apply as in the TypeScript flow.

```python
from eth_account.messages import encode_typed_data

PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
POOL = "0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"


def uint256(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError("Use an integer or decimal string")
    if isinstance(value, str) and (not value or not value.isascii() or not value.isdecimal()):
        raise ValueError("Use an unsigned decimal string")
    result = int(value)
    if not 0 <= result < 2**256:
        raise ValueError("Value does not fit uint256")
    return result


def sign_permit2_transfer(account, amount_in, nonce, deadline):
    """Authorize this account's Base USDC transfer to the Pool spender."""
    amount_in, nonce, deadline = map(uint256, (amount_in, nonce, deadline))
    if not (0 < amount_in < 2**256 and 0 <= nonce < 2**256 and 0 < deadline < 2**256):
        raise ValueError("Invalid Permit2 integer")
    signable = encode_typed_data(
        domain_data={"name": "Permit2", "chainId": 8453, "verifyingContract": PERMIT2},
        message_types={
            "TokenPermissions": [
                {"name": "token", "type": "address"},
                {"name": "amount", "type": "uint256"},
            ],
            "PermitTransferFrom": [
                {"name": "permitted", "type": "TokenPermissions"},
                {"name": "spender", "type": "address"},
                {"name": "nonce", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
            ],
        },
        message_data={
            "permitted": {"token": USDC, "amount": amount_in},
            "spender": POOL,
            "nonce": nonce,
            "deadline": deadline,
        },
    )
    return "0x" + bytes(account.sign_message(signable).signature).hex()


def permit_calldata_payload(account, symbol, amount_in, nonce, deadline, slippage_bps=50):
    """Body for POST /quote/exact-in/permit/calldata, after reserving the nonce."""
    nonce, deadline = map(uint256, (nonce, deadline))
    # This REST endpoint accepts JSON numbers; keep compatibility with its JS parser.
    if not 0 <= nonce <= 2**53 - 1 or deadline > 2**53 - 1:
        raise ValueError("Nonce or deadline is too large for REST; encode the call directly")
    if type(slippage_bps) is not int or not 1 <= slippage_bps <= 9999:
        raise ValueError("slippage_bps must be an integer from 1 to 9999")
    return {
        "symbol": symbol,
        "recipient": account.address,
        "tokenIn": USDC,
        "tokenOut": "0x0000000000000000000000000000000000000000",
        "amountIn": str(uint256(amount_in)),
        "slippageBps": slippage_bps,
        "deadline": deadline,
        "permit2Nonce": nonce,
        "permit2Signature": sign_permit2_transfer(account, amount_in, nonce, deadline),
    }
```

`permit_calldata_payload(...)` returns the JSON body for `/quote/exact-in/permit/calldata`. Supply a discovered symbol, raw USDC amount, reserved nonce and Unix-second deadline. The payload binds the Permit2 token/amount and Pool spender; it does not replace output protection. Verify the returned router and calldata, apply the caller-aware minimum, and simulate before submission as shown in the TypeScript flow. ERC-20 allowance to Permit2 is still required.

## Retrying Rate-Limited API Requests

Use a bounded retry for HTTP 429 and respect `Retry-After`. Other HTTP errors and business-error envelopes still need the handling shown above. This helper retries API requests; do not use it to blindly resend transactions or allocate a new nonce while an earlier signature or transaction may still execute.

```javascript
export async function fetchWithRateLimitRetry(url, init = {}, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === attempts - 1) return response;
    const retryAfter = response.headers.get('Retry-After');
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const date = retryAfter === null ? NaN : Date.parse(retryAfter);
    const waitMs = Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1000;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  throw new Error('attempts must be positive');
}
```

All token amounts remain decimal strings or `bigint` in JavaScript and integers in Python. Slippage uses basis points with denominator 10,000; it is separate from the Pool's Q24 fee scale. A deadline limits time, while `amountOutMinimum` limits execution price.
