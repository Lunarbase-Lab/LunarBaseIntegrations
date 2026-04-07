# Security

## Protections

- **Reentrancy guard**: OpenZeppelin `ReentrancyGuardTransient` on all state-mutating functions
- **Access control**: OpenZeppelin `Ownable` for admin functions; up to 5 immutable operator addresses for price updates
- **Pausable**: Owner can pause the unified `Pool`; mutating entry points revert while paused
- **Staleness check**: `blockDelay` ensures swaps only execute on fresh operator prices
- **Overflow protection**: Solidity 0.8.31 with built-in overflow/underflow checks
- **Slippage protection**: `amountOutMinimum` on all swap functions

## Known Limitations

- Operator state must be refreshed within `blockDelay` blocks; integrators should check `isFresh()` or inspect `state().latestUpdateBlock` before acting on a quote
- The same `Pool` contract now combines quoting, swaps, LP lifecycle, and fee operations, so admin and pause state affect a broader write surface than in the split periphery/core design

## Dependencies

| Dependency             | Usage                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| OpenZeppelin Contracts | Ownable, SafeERC20, Math, SafeCast, ReentrancyGuardTransient, Pausable         |
| Permit2                | Optional ERC-20 swap path via overloaded `swapExactIn(..., permit, signature)` |

## Audits

None.
