---
name: term-cancellation
overview: Add a new “Term cancellation” operation that removes a selected term/factor only when it is equivalent to the identity for its context (0 in sums, 1 in products), plus a fraction-specific cancel that removes a common factor from numerator/denominator. Expose it via a toolbar button and the Delete key, with unit tests and a Playwright e2e.
todos:
  - id: tests-unit
    content: Write failing unit tests for cancelTerm (sum/product/fraction/no-op).
    status: completed
  - id: impl-cancelTerm
    content: Implement src/cancelTerm.ts with CE-based equivalence checks + tree rewrites.
    status: completed
  - id: ui-toolbar-keybind
    content: Wire cancelTerm into ExpressionPad (Delete/Backspace) and add toolbar IconButton with disabled state.
    status: completed
  - id: tests-e2e
    content: Add Playwright spec covering Delete key + toolbar button for term cancellation.
    status: completed
  - id: run-tests
    content: Run vitest + playwright and fix any failures/flakes.
    status: completed
---

## Goal

Enable “term cancellation” from a selection:

- Remove a **selected Add term** only if that term is **equivalent to 0** (e.g. selecting the whole `(a-a)` group).
- Remove a **selected product factor** only if that factor is **equivalent to 1**.
- If selection is within a `Divide`, allow cancelling a **common factor** between numerator and denominator (e.g. `\frac{a b}{a c} -> \frac{b}{c}`).

## Where this plugs in

- Keyboard shortcuts are handled in [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx) (`onKeyDown` around lines ~596+).
- Toolbar buttons live in [`src/ui/components/MoveModeToolbar.tsx`](src/ui/components/MoveModeToolbar.tsx) and are passed down from `ExpressionPad`.
- Expression mutation utilities follow the existing “pure transform returns new `ExpressionTree`” pattern (e.g. [`src/expandSubexpression.ts`](src/expandSubexpression.ts), [`src/moveExpression/applyMoveAdditive.ts`](src/moveExpression/applyMoveAdditive.ts)).

## Design

### New pure transform

Add [`src/cancelTerm.ts`](src/cancelTerm.ts) exporting:

- `cancelTerm(tree: ExpressionTree, selection: ExprSelection | null): ExpressionTree | null`
- `canCancelTerm(tree: ExpressionTree | null, selection: ExprSelection | null): boolean`

Behavior (in priority order):
1) **Fraction cancellation**

- If selection is a node under the nearest ancestor `Divide`, determine whether it lies under numerator or denominator.
- Convert numerator/denominator into factor lists:
- if side is `['InvisibleOperator', ...]` use its factors, else treat as single-factor list.
- Find a factor on the opposite side structurally equal to the selected factor (after unwrapping `Delimiter` wrappers).
- Remove one instance from both sides; rebuild numerator/denominator with `['InvisibleOperator', ...]` when needed; normalize `Divide(x, 1) -> x` and `Divide(1, y)` stays a `Divide`.

2) **Sum term removal**

- Only if selection is a **direct child of an `Add`**.
- Compute whether the selected term is “equivalent to 0”:
- Try Compute Engine simplification via `box()` from [`src/computeEngine.ts`](src/computeEngine.ts) (similar to how expansion uses CE in `expandSubexpression`).
- Normalize back to project dialect (`Multiply` → `InvisibleOperator`) and run `normalizeMathJson()`.
- Treat as removable if simplified expression is `0` or `['Negate', 0]`.
- Remove that child from the `Add` and normalize the resulting `Add` (collapse singletons).

3) **Product factor removal**

- Only if selection is a **direct child of an `InvisibleOperator`** product.
- Same CE-based simplification check for “equivalent to 1”.
- Remove that factor; normalize product (collapse singleton; empty → `1`).

Notes:

- We’ll keep equality checks intentionally conservative (structural equality + delimiter unwrapping) to match your chosen “self-zero-only” semantics.
- We’ll reuse small helpers (deep MJ equality, CE dialect mapping) patterned after [`src/expandSubexpression.ts`](src/expandSubexpression.ts).

## UI wiring

### Toolbar

Update [`src/ui/components/MoveModeToolbar.tsx`](src/ui/components/MoveModeToolbar.tsx):

- Add props: `onCancelTerm`, `canCancelTerm`.
- Add an `IconButton` (Material Symbol like `backspace` or `remove_circle`) with `testId="cancel-term-button"`.

### Delete key

Update [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx):

- In `onKeyDown`, handle `e.key === 'Delete'` (and also `Backspace` for robustness) when `mode === 'render'`.
- If `cancelTerm()` returns a new tree:
- commit via the existing `commitJson(next.rootJson, { latex: next.latexPlain })` path
- `preventDefault()` so the browser doesn’t navigate on Backspace.
- Compute `canCancelTerm` via `useMemo` similarly to `canExpand` / `canSubstitute` and pass into toolbar.

## Unit tests (TDD)

Add [`src/cancelTerm.test.ts`](src/cancelTerm.test.ts) using existing helpers in [`src/testHelpers.ts`](src/testHelpers.ts):

- **sum_zero_term**: `a + 0 + b` selecting the `0` node removes it → latex contains `a + b`.
- **sum_equivalent_zero_group**: `b + (a - a)` selecting the `Delimiter` term removes it → latex becomes `b`.
- **product_one_factor**: `1 = a 1 b` selecting `1` removes it → latex contains `1 = a b`.
- **fraction_cancel_common_factor**: `\frac{a b}{a c}` selecting the numerator `a` cancels → latex becomes `\frac{b}{c}`.
- **no_op**: selecting a non-cancellable node returns `null`.

## E2E test

Add [`tests/cancel-term.spec.ts`](tests/cancel-term.spec.ts) using existing Playwright helpers in [`tests/helpers/dragMathlive.ts`](tests/helpers/dragMathlive.ts):

- `setEquation(page, 'a + (b - b) = c')`
- click the `(b-b)` delimiter term (by latex match via the `ExpressionTree`-based helper, or by finding a node whose latex contains `b - b`)
- press `Delete`
- assert rendered latex becomes `a = c` (whitespace-normalized) via `getRenderedLatex()`.
- Also assert the toolbar button is enabled and works (click `cancel-term-button` on a fresh setup) to cover both entry points.

## Run/verify

After implementation:

- Run unit tests: `npm run test:run`
- Run e2e tests: `npm run test:e2e`
- If anything flakes due to selection targeting, adjust the e2e to use the node-id rect helpers (same approach as drag tests) for stable clicking.

## Files to change/add

- Add: [`src/cancelTerm.ts`](src/cancelTerm.ts)
- Add: [`src/cancelTerm.test.ts`](src/cancelTerm.test.ts)
- Update: [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx)
- Update: [`src/ui/components/MoveModeToolbar.tsx`](src/ui/components/MoveModeToolbar.tsx)
- Add: [`tests/cancel-term.spec.ts`](tests/cancel-term.spec.ts)