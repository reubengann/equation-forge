---
name: cancel-and-factor-sums
overview: Enable cancelling a common factor like m from a fraction even when the numerator is an Add, and add a Factor action that can factor common multiplicative factors out of sums (with an optional Compute Engine hook if available).
todos:
  - id: cancel-common-factor-add-numerator
    content: Extend `cancelTerm` to cancel a selected factor across Divide when numerator is Add and factor exists in every addend.
    status: completed
  - id: cancel-across-equals
    content: Extend `cancelTerm` to cancel matching additive terms and multiplicative factors across a top-level Equal (explicit multi-select on both sides + Delete/Cancel).
    status: completed
  - id: factor-action
    content: Add `factorSelection` transform (best-effort CE factor/collect + common-factor fallback) and expose it via a new toolbar button in `ExpressionPad`.
    status: completed
  - id: tests
    content: Add unit + Playwright tests for cancelling m in additive numerator and for factoring common factors.
    status: completed
---

## Goal

Support the workflow in your example:

- Given something like `(-\mu_s m g \cos(\theta) + m g \sin(\theta))/m`, allow **Ctrl/Cmd+click one `m` in the numerator and the denominator `m`**, then **Delete/Cancel** to produce the numerator with `m` removed from every addend.
- Allow cancelling common parts across an equals sign (same explicit multi-select gesture):
  - **Additive terms**: `a + b = b + c` → cancel `b` → `a = c`
  - **Multiplicative factors**: `m a = m b` → cancel `m` → `a = b`
- Provide an explicit **Factor** action to rewrite sums like `-\mu_s m g \cos(\theta) + m g \sin(\theta)` into `m g ( -\mu_s \cos(\theta) + \sin(\theta) )` (and similar), so factoring is available even outside of fractions.

## What’s there today (key constraints)

- `cancelTerm` can cancel **matching factors across a fraction** only when the numerator/denominator expressions themselves contain the selected factor as a direct multiplicative factor. It currently removes from the entire numerator node:
```134:176:c:\repos\physics-derivation-pad\src\cancelTerm.ts
function cancelSelectedPairInFraction(
  tree: ExpressionTree,
  aId: string,
  bId: string
): { divideId: string; nextExpr: MJ } | null {
  // ...
  const numExpr = tree.nodesById[numId]?.json;
  const denExpr = tree.nodesById[denId]?.json;
  // ...
  const numFactorsRaw = factorsOf(numExpr);
  const denFactorsRaw = factorsOf(denExpr);
  // removeFactorOnce(...) from both
}
```

- For an `Add` numerator, `factorsOf(numExpr)` returns `[Add(...)]`, so cancellation fails.
- There is precedent for “try Compute Engine op if present” (`expandSubexpression` uses `.expand?.()`):
```94:103:c:\repos\physics-derivation-pad\src\expandSubexpression.ts
const expandedBox = skipCeExpand ? null : box(ceReady)?.expand?.();
```


## Implementation approach

### 1) Extend `cancelTerm` to cancel a factor common to all addends

- Enhance `cancelSelectedPairInFraction()` in [`src/cancelTerm.ts`](c:\repos\physics-derivation-pad\src\cancelTerm.ts):
  - Detect when the fraction numerator `numExpr` is an `Add`.
  - For the selected target factor (the canonicalized selected `m`), check whether **every addend** contains that factor in its multiplicative factor list.
    - Treat each addend as potentially `Negate(term)` and/or `Delimiter(term)`.
    - Extract `sign` (+1/-1) and the multiplicative factors (flatten `InvisibleOperator`).
  - If the factor is present in all terms:
    - Remove it **once per term**.
    - Rebuild each term (`sign` preserved) and rebuild the numerator `Add`.
    - Remove it once from the denominator factors (as today).
    - Rebuild the resulting fraction, normalizing away denominator `1`.
- Keep the existing multi-select UX (you chose this), so the cancellation is still explicit.

### 2) Cancel common terms across an equals sign (explicit multi-select)

- Extend the existing multi-select cancellation path in [`src/cancelTerm.ts`](c:\repos\physics-derivation-pad\src\cancelTerm.ts) to also detect when the selected pair lives on opposite sides of the same `Equal`.
- Two supported shapes:
  - **Additive-term cancel**: if both sides are `Add` (or can be treated as a singleton `Add`), remove one matching addend from each side, then normalize (`Add` collapses to 0/1-term forms).
  - **Multiplicative-factor cancel**: if both sides are `InvisibleOperator` (or can be treated as a singleton product), remove one matching factor from each side, then normalize (product collapses to 1/1-factor forms).
- Selection/trigger stays consistent with fractions: **Ctrl/Cmd+click one instance on each side**, then **Delete/Cancel**.

### 3) Add a “Factor” action (best-effort Compute Engine + deterministic fallback)

- Create a new transformation module (e.g. [`src/factorSelection.ts`](c:\repos\physics-derivation-pad\src\factorSelection.ts)):
  - Input: `tree` + `ExprSelection` (node or span).
  - Locate the selected expression MathJSON.
  - Best-effort: call `(box(toComputeEngine(expr)) as any)?.factor?.()` and/or `(box(...) as any)?.collect?.()` if those exist at runtime.
  - Deterministic fallback: if the target is an `Add` (or a span inside an `Add`):
    - Compute the **greatest common multiplicative factor list** across the selected addends.
      - Include numeric gcd when terms have numeric literals.
      - Handle `Negate(...)` by separating sign from factors.
    - Rewrite:
      - `Add(t1, t2, ...)` → `InvisibleOperator(commonFactor, Delimiter(Add(t1/commonFactor, ...)))`.
    - Run `normalizeMathJson()` to keep your dialect consistent.
  - Return a new `ExpressionTree` only if the transformation changes the expression.
- UI hook:
  - Add a new button to [`src/ui/components/MoveModeToolbar.tsx`](c:\repos\physics-derivation-pad\src\ui\components\MoveModeToolbar.tsx) (similar pattern to Expand/Evaluate).
  - Wire it in [`src/ui/components/ExpressionPad.tsx`](c:\repos\physics-derivation-pad\src\ui\components\ExpressionPad.tsx) with `canFactorSelection(...)` + `factorSelection(...)`.

### 4) Tests

- Unit tests:
  - Add cases to [`src/cancelTerm.test.ts`](c:\repos\physics-derivation-pad\src\cancelTerm.test.ts) for:
    - `\frac{-\mu_s m g \cos(\theta) + m g \sin(\theta)}{m}` where multi-select of a numerator `m` and denominator `m` cancels successfully.
    - Negative/sign cases (e.g. `\frac{-m a + m b}{m}` → `-a + b`).
    - Cross-equals additive cancellation (e.g. `a + b = b + c` with multi-select `b` on both sides → `a = c`).
    - Cross-equals multiplicative cancellation (e.g. `m a = m b` with multi-select `m` on both sides → `a = b`).
  - Add tests for factoring in a new `factorSelection.test.ts` or alongside existing selection transforms.
- E2E:
  - Extend [`tests/cancel-term.spec.ts`](c:\repos\physics-derivation-pad\tests\cancel-term.spec.ts) with a scenario matching your expression to ensure the exact UI workflow works.
  - Add a cancel-across-equals scenario (additive + multiplicative) using the same Ctrl/Cmd multi-select + Delete flow.

## Notes / assumptions

- We’ll preserve your existing “explicit multi-select” cancellation requirement and won’t introduce implicit single-click cancellation.
- Factoring will prioritize **common-factor extraction from sums** (what you need for the `m` and `mg` cases), while opportunistically using Compute Engine factor/collect if those APIs exist in the shipped CE version.