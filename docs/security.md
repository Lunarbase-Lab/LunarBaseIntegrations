# Security

## Protections

- **Reentrancy guard**: OpenZeppelin `ReentrancyGuardTransient` on all state-mutating functions
- **Access control**: OpenZeppelin `Ownable` for admin functions; up to 5 immutable operator addresses for price updates
- **Pausable**: Owner can pause the contract — all swaps revert when paused
- **Staleness check**: `blockDelay` ensures swaps only execute on fresh operator prices
- **Overflow protection**: Solidity 0.8.31 with built-in overflow/underflow checks
- **Slippage protection**: `amountOutMinimum` on all swap functions

## Known Limitations

- Operator must update state every `blockDelay` blocks or quotes return `0` and swaps revert with `StalePrice()`

## Dependencies

| Dependency             | Usage                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| OpenZeppelin Contracts | Ownable, SafeERC20, Math, SafeCast, ReentrancyGuard, Pausable                |
| Permit2                | Uniswap canonical deployment at `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## Audits

None.
