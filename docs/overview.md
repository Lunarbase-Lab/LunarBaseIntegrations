# Overview

## Summary

LunarBase PropAMM is an on-chain proactive market maker that concentrates liquidity in a dynamic band around an operator-set price. It uses an off-chain price oracle and custom price curve to provide tight, continuously-updated quotes for any ERC-20/ERC-20 or Native/ERC-20 pair.

## Motivation

- **Unique value**: Operator-driven price updates allow the pool to track external market prices in real time, minimizing stale-quote risk and LVR and providing best quotes and tightest spreads for users.
- **Settlement quality**: Single-swap atomic execution with on-chain slippage protection (`amountOutMinimum`) and Permit2-based gasless approvals. Reentrancy-guarded and pausable.
- **Supported pairs**: Any ERC-20/ERC-20 pair and Native (ETH)/ERC-20 pairs.

## Architecture

```
User ──► CurvePMMPeriphery ──► CurvePMM (Core Pool)
              │                       │
              ├── Permit2 validation  ├── Quote computation
              ├── Token routing       ├── Reserve management
              └── Native ETH wrap     └── Operator state checks
```

**CurvePMM** (core pool) holds reserves, validates operator freshness, computes output amounts via the price curve, and executes token transfers.

**CurvePMMPeriphery** is the user-facing entry point. It resolves token addresses to the correct pool, validates Permit2 signatures, enforces slippage limits, and wraps/unwraps native ETH.
