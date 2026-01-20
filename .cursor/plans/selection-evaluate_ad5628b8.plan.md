---
name: selection-evaluate
overview: Add an undoable “Evaluate” toolbar action that uses the CortexJS Compute Engine to evaluate the currently selected subexpression (node or contiguous span) and replace it in-place, with unit + Playwright tests.
todos:
  - id: core-eval-op
    content: Implement `evaluateSelection()` + `canEvaluateSelection()` with CE evaluate/N fallback and span splicing.
    status: completed
  - id: toolbar-ui
    content: Add Evaluate button to `MoveModeToolbar` and wire into `ExpressionPad` with undoable `commitJson()`.
    status: completed
  - id: unit-tests
    content: Add Vitest coverage for degrees trig, Add span splice, Multiply span splice, and no-op behavior.
    status: completed
  - id: e2e-tests
    content: Add Playwright specs verifying Evaluate button, span selection evaluation, and undo/redo.
    status: completed
---

## Goal

Implement **Selection Evaluation**: when the user has a selection inside the rendered math, clicking **Evaluate** will attempt to evaluate that selected subexpression via the Compute Engine and replace it in-place. This must be **undoable** (integrate with existing `useHistory`), and covered by **unit** and **e2e** tests.

## Current architecture (what we’ll leverage)

- **Selections** are represented as `ExprSelection` in [`src/selectionSemantics.ts`](c:/repos/physics-derivation-pad/src/selectionSemantics.ts):
- `{kind:"node", nodeId}`
- `{kind:"span", parentId, op: "Add"|"InvisibleOperator", start, end}`
- `{kind:"multi", nodeIds}`
- **Undo/redo** is already implemented via `commitJson()` → `commitHistory()` in [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx) and [`src/hooks/useHistory.ts`](c:/repos/physics-derivation-pad/src/hooks/useHistory.ts).
- **Other selection operations** (Expand/Cancel/Substitute) show the expected integration pattern:
- compute a target (or span), build a new MathJSON root via `setAtPath()` from [`src/movePath.ts`](c:/repos/physics-derivation-pad/src/movePath.ts), then call `commitJson(next.rootJson, { latex: next.latexPlain })`.

## Implementation approach

### 1) Core operation: evaluate a selection and return a new tree

Create a new module [`src/evaluateSelection.ts`](c:/repos/physics-derivation-pad/src/evaluateSelection.ts) that exports:

- `canEvaluateSelection(tree: ExpressionTree | null, sel: ExprSelection | null): boolean`
- `evaluateSelection(tree: ExpressionTree, sel: ExprSelection): ExpressionTree | null`

Behavior:

- **Node selection** (`kind:"node"`):
- Use `tree.pathById[nodeId] `and `setAtPath(tree.rootJson, path, evaluatedJson)`.
- **Span selection** (`kind:"span"`):
- Read the parent node’s MathJSON (must be `Add` or `InvisibleOperator`).
- Build a **segment expression** from the contiguous children `[start..end]`:
- If parent op is `Add`: segment is either single child or `["Add", ...segmentKids]`.
- If parent op is `InvisibleOperator`: segment is either single child or `["InvisibleOperator", ...segmentKids]`.
- Evaluate the segment, then **splice it back** into the parent children:
- `before + [evaluatedSegment] + after`.
- Normalize edge cases:
- `Add` with 1 child → that child; 0 children → `0`.
- `InvisibleOperator` with 1 child → that child; 0 children → `1`.

Compute Engine usage:

- Follow the same dialect bridging used by `expandSubexpression`/`cancelTerm`:
- map our `InvisibleOperator` ↔ CE `Multiply` before/after.
- Evaluation strategy (per your answers):
- Prefer exact when CE can (e.g. `1/2`).
- If the result isn’t exact/simpler, allow numeric approximation: attempt `expr.evaluate()` first; if it doesn’t change meaningfully or yields something non-replacing, fall back to `expr.N()`.
- Run through `normalizeMathJson()` from [`src/computeEngine.ts`](c:/repos/physics-derivation-pad/src/computeEngine.ts) after converting back.
- Treat “no change” as a no-op and return `null` (like `expandSubexpression`).

### 2) Toolbar wiring

Update [`src/ui/components/MoveModeToolbar.tsx`](c:/repos/physics-derivation-pad/src/ui/components/MoveModeToolbar.tsx):

- Add props `onEvaluate: () => void` and `canEvaluate: boolean`.
- Add a new `IconButton`:
- `label="Evaluate"`
- `testId="evaluate-button"`
- Use a Material Symbol like `calculate`.

Update [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx):

- Import `canEvaluateSelection` / `evaluateSelection`.
- Compute `canEvaluate` from the current `tree` + `selection`.
- Implement `onEvaluate` callback:
- If `!tree || !selection` return.
- Call `evaluateSelection(tree, selection)`.
- If it returns a new tree: `commitJson(next.rootJson, { latex: next.latexPlain })`.

Undoability:

- Because Evaluate commits via `commitJson()`, it will automatically be **undoable/redoable** via the existing history mechanism.

## Tests

### Unit tests (Vitest)

Add [`src/evaluateSelection.test.ts`](c:/repos/physics-derivation-pad/src/evaluateSelection.test.ts):

- **Exact trig degrees**: parse `\sin\left(30^{\circ}\right)`; select the node corresponding to the full `\sin(...)` and expect replacement to become `\frac{1}{2}` (or equivalent MathJSON).
- **Span splice in Add**: parse `a + 2 + 6`; build a span selection covering the `2` and `6` child indices under the `Add` parent; expect result latex to be `a + 8`.
- **Span splice in multiplication**: parse `2 3 x`; select the `2` and `3` factors as an `InvisibleOperator` span; expect `6 x` (or `6 \, x` depending on renderer) while keeping `x` untouched.
- **No-op**: selecting something that doesn’t evaluate (e.g. `x + 2` segment) returns `null`.

### E2E tests (Playwright)

Add [`tests/evaluate.spec.ts`](c:/repos/physics-derivation-pad/tests/evaluate.spec.ts):

- **Evaluate button computes selection**:
- Set equation `\sin\left(30^{\circ}\right) = x`.
- Click the `\sin\left(30^{\circ}\right)` node (`clickNodeByLatex`).
- Click toolbar `evaluate-button`.
- Expect rendered latex to be `\frac{1}{2} = x`.
- **Evaluate supports span selection + undo/redo**:
- Set equation `a + 2 + 6 = 0`.
- Click node `2` then press `Shift+ArrowRight` to expand to the `2 + 6` span.
- Click `evaluate-button` and expect `a + 8 = 0`.
- Press undo (toolbar `undo-button` or Ctrl/Cmd+Z) and expect original expression.
- Press redo and expect `a + 8 = 0` again.

## Files to change/add

- Add: [`src/evaluateSelection.ts`](c:/repos/physics-derivation-pad/src/evaluateSelection.ts)
- Add: [`src/evaluateSelection.test.ts`](c:/repos/physics-derivation-pad/src/evaluateSelection.test.ts)
- Update: [`src/ui/components/MoveModeToolbar.tsx`](c:/repos/physics-derivation-pad/src/ui/components/MoveModeToolbar.tsx)
- Update: [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx)
- Add: [`tests/evaluate.spec.ts`](c:/repos/physics-derivation-pad/tests/evaluate.spec.ts)

## Test plan

- Run unit tests (Vitest) for the new selection evaluation logic.
- Run Playwright e2e suite (or at least `tests/evaluate.spec.ts`) to verify toolbar behavior and undo/redo integration.