---
name: fix-evaluate-integral-dx
overview: Make evaluating a selected definite integral work via the Compute Engine (CE), starting with numeric bounds (e.g. ∫₀² 1 dx → 2), then extending to symbolic bounds by assuming symbols are real and normalizing CE canonical output back into our MathJSON.
todos:
  - id: tests-numeric-definite-integrals
    content: Add unit tests for CE evaluation of simple definite integrals with numeric bounds (e.g. `\int_{0}^{2} 1 \,\mathrm{d}{x}` → `2`) and assert the result is MathJSON our `ExpressionTree` can render/parse.
    status: pending
  - id: normalize-ce-canonical-calculus
    content: If CE returns canonical calculus nodes we don't render (e.g. `Function/Block/Limits/EvaluateAt`), normalize them back into our supported MathJSON shapes before constructing an `ExpressionTree`.
    status: pending
  - id: tests-symbolic-bounds
    content: Add unit tests for definite integrals with symbolic bounds (e.g. `\int_{0}^{x_{0}} \,\mathrm{d}{x}` → `x_{0}`) as the next step after numeric bounds work.
    status: pending
  - id: assume-symbols-real-temporary-scope
    content: During evaluation, assume/declare all scalar symbols (including subscripted ones) are real in a temporary CE scope so typed operators (like definite integral limits) do not error with `unknown` types.
    status: pending
---

## Goal

- Make `evaluateSelection()` correctly evaluate selected definite integrals using CE, producing MathJSON we can render.
- Start with **numeric bounds** (e.g. `\int_{0}^{2} 1 \,\mathrm{d}{x}` → `2`), then extend to **symbolic bounds** (e.g. `\int_{0}^{x_{0}} \,\mathrm{d}{x}` → `x_{0}`) by providing CE the necessary type assumptions.

## What’s happening now

- `evaluateSelection()` calls `evaluateExpression()` in [`src/evaluateSelection.ts`](src/evaluateSelection.ts).
- `evaluateExpression()` delegates to the Compute Engine via `box(...).simplify()/evaluate()/N()` and currently accepts the first structurally-different result.
- For `['Integrate', 1, ['Tuple','x',0,['Subscript','x',0]]]`, CE may treat `x_0` as **type `unknown`**; definite integral limits expect a **numeric** type, so CE produces `['Error', ['ErrorCode', 'incompatible-type', 'number', 'unknown']]`.
- Separately, CE may return **canonical calculus forms** we don’t currently render (e.g. wrappers like `Function/Block`, or calculus nodes like `Limits` / `EvaluateAt`), which can break `ExpressionTree.create()` unless we normalize them.

## Approach

- **Test-first**:
- Add unit tests around “simple integrals” with numeric bounds, e.g. `\int_{0}^{2} 1 \,\mathrm{d}{x}`.
- Assert the evaluated result is MathJSON that our app can consume (i.e. it round-trips through `ExpressionTree.create(...)` and produces expected `latexPlain`).
- **Then fix evaluation plumbing** (without adding ad-hoc integral algebra rules):
- Tighten CE candidate acceptance so we don’t accept results that include `['Error', ...]`.
- Normalize CE’s canonical calculus nodes (e.g. `Function/Block/Limits/EvaluateAt`) back into MathJSON shapes our `ExpressionTree` understands.
- **Then add symbolic bounds support**:
- Use a temporary CE scope during evaluation and declare/assume scalar symbols are real so `x_0` (and friends) can be used as numeric bounds.
- If we keep representing subscripted identifiers as `['Subscript', ...]`, decide on a consistent mapping for CE typing (e.g. treat `x_0` as an atomic symbol during CE evaluation, then map back for display/selection).

## Files to change

- [`src/evaluateSelection.test.ts`](src/evaluateSelection.test.ts)
- Add numeric-bounds tests first (e.g. `\int_{0}^{2} 1 \,\mathrm{d}{x}`).
- Then add symbolic-bounds tests (e.g. `\int_{0}^{x_{0}} \,\mathrm{d}{x}`).
- [`src/evaluateSelection.ts`](src/evaluateSelection.ts)
- Add helper to detect `Error` nodes in candidate results.
- Extend `fromComputeEngine()` (or add a post-pass) to normalize CE canonical calculus nodes into our supported MathJSON operators.
- [`src/computeEngine.ts`](src/computeEngine.ts)
- Add a helper for “temporary scope + declare symbols real” (or equivalent assumptions) used only during evaluation, not during general parse.

## Test plan

- Run unit tests (Vitest) and ensure the new regression tests pass.
- Verify `evaluateSelection` continues to behave unchanged for non-integral selections (existing tests).