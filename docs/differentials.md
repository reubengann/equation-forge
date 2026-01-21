## Differentials: canonical forms and boundaries

We keep a single canonical LaTeX form for differentials outside of MathLive:

- Differential operator: `\mathrm{d}{x}`
- Derivative fraction: `\dfrac{\mathrm{d}{f}}{\mathrm{d}{x}}`
- Integral tail: `\int ... \,\mathrm{d}{x}`
- MathJSON: `["Differential", operand]` and `["FractionDerivative", ["Differential", ...], ["Differential", ...]]`

### Boundary conversions

- **To MathLive (set/prefill)**: use `toMathLiveLatex()` to convert canonical display → MathLive-friendly (`\differentialD x`).
- **From MathLive (read/submit)**: use `fromMathLiveLatex()` to scrub MathLive output and return canonical `\mathrm{d}{...}` (removes `d_upright` / `Nothing` aliases).

### Compute Engine & rendering

- `parse()` now normalizes incoming LaTeX to `\differentialD ...` before Compute Engine parse, so derivative fractions and integrals hit the custom dictionary.
- `ExpressionTree` emits differentials as `\mathrm{d}{x}` (also inside integrals and derivative fractions).

### Tests

- `src/infra/mathlive/differentialLatex.test.ts` covers the boundary helpers.
- E2E `tests/substitute.spec.ts` has regressions for differential prefill/accept-without-edit.
