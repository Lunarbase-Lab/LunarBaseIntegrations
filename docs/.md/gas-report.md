# Gas Report (gasleft-based)

Source: `test/GasReport.t.sol` using `gasleft()` around calls and `emit GasReport(...)`.
Method: gasUsed = `startGas - gasleft()` before emit, so the event emission cost is **not included**.

Bench setup:
- Compiler: solc 0.8.28 (Foundry auto-detect)
- Optimizations: enabled (see `foundry.toml`)
- BaseFeeConfig: `baseFee=25`, `wToken0=5000`, `wToken1=5000`
- DynamicFee: disabled
- Protocol share: 20% (2000 bps)
- Tokens: ERC20 mocks, 18 decimals

## Factory / Pool

| Function | Gas |
| --- | ---: |
| factory.createPair.preset | 292,495 |
| factory.createPair.partner | 290,073 |
| pool.mint | 118,823 |
| pool.swap.exactIn | 91,961 |
| pool.burn | 24,701 |

## Router

| Function | Gas |
| --- | ---: |
| router.createPair.preset.AB | 297,839 |
| router.createPair.preset.BC | 247,412 |
| router.addLiquidity | 190,824 |
| router.addLiquidity.secondPool | 183,991 |
| router.removeLiquidity | 58,071 |
| router.swapExactTokensForTokens | 119,305 |
| router.swapExactTokensForTokens.user | 103,505 |
| router.swapExactInputSingle | 95,547 |
| router.swapExactOutputSingle | 116,022 |
| router.swapExactInput.multiHop | 215,974 |
| router.swapExactOutput.multiHop | 239,716 |

## Notes

- `router.createPair.preset.AB/BC` creates two pools for the multi-hop path.
- `factory.createPair.partner` was executed from the partner address (vm.prank).
- `router.swapExactTokensForTokens.user` was executed from `alice` (not owner).
- Swap metrics are measured on pools after liquidity is added.
- Values depend on the current Foundry/solc settings and may differ under other configurations.


## Native Paths

- Gas numbers are for ERC20 paths. Native paths include extra wrap/unwrap and refund overhead.
