# Overview

## Summary

LunarBase PropAMM is an on-chain proactive market maker that concentrates liquidity in a dynamic band around an operator-set price. It uses an off-chain price oracle and custom price curve to provide tight, continuously-updated quotes for any ERC-20/ERC-20 or Native/ERC-20 pair.

## Motivation

- **Unique value**: Operator-driven price updates allow the pool to track external market prices in real time, minimizing stale-quote risk and LVR and providing best quotes and tightest spreads for users.
- **Settlement quality**: Single-swap atomic execution with on-chain slippage protection (`amountOutMinimum`) and Permit2-based gasless approvals. Reentrancy-guarded and pausable.
- **Supported pairs**: Any ERC-20/ERC-20 pair and Native (ETH)/ERC-20 pairs.

## Architecture

```
User / LP / Operator / Owner
              │
              ▼
             Pool
              ├── Quote functions: quoteExactIn, quoteXToY, quoteYToX
              ├── Swap execution: swapExactIn, swapExactIn + Permit2, swapExactInNative
              └── Pool state: upd, state, isFresh, getXReserve, getYReserve
```

**Pool** is now the sole on-chain integration surface. It holds reserves, validates operator freshness, computes output amounts via the price curve, executes swaps, records LP requests and positions, and exposes treasury and partner fee controls.

For ERC-20 swaps, the ABI exposes both a direct `swapExactIn` entry point and an overload that takes Permit2 data plus a signature. For native pools, callers use `swapExactInNative` directly on the same contract.

## Core Read Interface

```solidity
function X() external view returns (address);
function Y() external view returns (address);
function state() external view returns (uint160 pX96, uint48 fee, uint48 latestUpdateBlock);
function isFresh() external view returns (bool fresh);
function getXReserve() external view returns (uint112);
function getYReserve() external view returns (uint112);
function blockDelay() external view returns (uint48);
```

Use these getters to identify the pair, inspect the latest operator-set price and fee state, and decide whether a quote is fresh enough to trade against.
