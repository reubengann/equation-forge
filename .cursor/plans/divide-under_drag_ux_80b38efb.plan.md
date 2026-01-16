---
name: Divide-under drag UX
overview: Add a multiplicative cross-'=' drag hit-zone model that shows a horizontal “divide-under” indicator when hovering over most of an expression, while reserving small left/right edge zones for the existing vertical insertion indicator; execute the three outcomes via applyMoveMultiplicative using TDD.
todos:
  - id: tdd-planner-hit-zones
    content: Add planMove tests for multiplicative cross-equal hit-zones and implement new drop kind `ontoSideRootWhole` plus left/right edge-zone logic.
    status: pending
  - id: tdd-ui-overlay
    content: Update App insert overlay to render a horizontal underline for `ontoSideRootWhole`, while keeping vertical insertion for edge drops.
    status: pending
    dependencies:
      - tdd-planner-hit-zones
  - id: tdd-executor-3-outcomes
    content: Add applyMoveMultiplicative tests for (divide whole), (reciprocal before), (reciprocal after); implement branching based on targetSlot/null.
    status: pending
    dependencies:
      - tdd-planner-hit-zones
  - id: update-integration-tests
    content: "Adjust existing integration tests to pass `targetSlot: null` for whole-division cross-equal multiplicative moves and ensure no regressions."
    status: pending
    dependencies:
      - tdd-executor-3-outcomes
---

# Multiplicative divide-under insertion indicator

## Goal

When dragging a multiplicative factor (e.g. `m`) across `=` onto an expression like `x^2 + v_x`, show:

- **Vertical insertion line** only in small left/right edge zones (or outside the expression), producing multiplication by the reciprocal on that side.
- **Horizontal underline** under the expression when hovering over its “main body”, producing division of the whole expression by the factor.

This specifically fixes the confusing current behavior where the insertion indicator lands at an interior child boundary even though the resulting operation is whole-expression division.

## Current behavior (what we’ll change)

- `planMove` synthesizes multiplicative `MoveAcrossEqual` plans but often forces `insertIndex: 1`, so the UI overlay in `App.tsx` always draws a vertical line at the right edge.
- `App.tsx`’s `renderInsertOverlay()` only supports vertical line rendering.
- `applyMoveMultiplicative` divides the destination side root by the moved factor (or multiplies if the moved factor came from a denominator), but it **does not** currently distinguish “divide the whole side” vs “insert reciprocal as a multiplicative factor before/after”.

## Design

### 1) Extend the planner’s representation

In [`src/planMove.ts`](src/planMove.ts):

- Extend `MovePlan`’s cross-equal drop union to include an explicit “whole-expression” target:
- `drop: { kind: "ontoSideRootWhole"; replaceId; replaceParentId; replaceSlot }`
- Keep existing `drop.kind === "ontoSideRoot"` with `insertIndex: 0 | 1` for left/right vertical insertion.

### 2) Add hit-zones for multiplicative cross-equal

In [`src/planMove.ts`](src/planMove.ts), for `mode === "multiplicative"` cross-equal planning:

- Measure the destination side-root rect (`rectFor(sideRootId)`).
- Use your chosen thresholds:
- **Outside threshold**: reuse existing `PAD = 6` (your choice).
- **Edge zones inside the rect**: reserve small left/right zones; default `EDGE_ZONE_PX = 12` (tweakable constant).
- Decide intent:
- If pointer is inside the rect but within an edge zone → plan `ontoSideRoot` with `insertIndex` 0 (left) or 1 (right).
- If pointer is inside the rect and not in an edge zone → plan `ontoSideRootWhole`.
- If pointer is outside the rect (by `PAD`) but still on that side → plan `ontoSideRoot` (before/after based on which side).
- If rects are missing → fall back to the current safer heuristic (keep behavior stable).

### 3) Render the new indicator in the UI

In [`src/App.tsx`](src/App.tsx):

- Update `describeMovePlan()` to print a useful message for `ontoSideRootWhole`.
- Update `computeInsertX()` / `targetRectForPlan()` / `renderInsertOverlay()`:
- For `ontoSideRootWhole`, render a **horizontal line** across the target rect’s width, positioned just below the target rect.
- For `ontoSideRoot` with `insertIndex`, keep the existing vertical line behavior.

### 4) Execute the 3 outcomes in the move executor

In [`src/moveExpression/applyMoveMultiplicative.ts`](src/moveExpression/applyMoveMultiplicative.ts):

- Keep existing cross-equal removal logic (remove `m` from its origin).
- Distinguish destination update when the hover target is the destination side-root:
- **Whole** (`targetSlot == null`, coming from `ontoSideRootWhole`) → apply to entire side root (for numerator factor this is `Divide(destExpr, movedExpr)`).
- **Edge insert** (`targetSlot === 0` or `1`) → multiply the side root by the appropriate reciprocal factor placed **before** or **after** the expression:
- Before: `(1/m) * (dest)`
- After: `(dest) * (1/m)`
- Ensure `(dest)` is wrapped with a delimiter when needed (e.g. `Add`) so the resulting LaTeX matches the user’s expectation.

## TDD steps (tests first)

### Planner tests

In [`src/planMove.test.ts`](src/planMove.test.ts):

- Add tests for `x^2 + v_x = m a` (multiplicative mode) dragging `m` over the LHS side-root with three pointer positions:
- inside main body → `MoveAcrossEqual.drop.kind === "ontoSideRootWhole"`
- inside left edge zone → `ontoSideRoot` with `insertIndex: 0`
- inside right edge zone → `ontoSideRoot` with `insertIndex: 1`

### Executor tests

In [`src/moveExpression/applyMoveMultiplicative.test.ts`](src/moveExpression/applyMoveMultiplicative.test.ts) and/or [`src/moveExpression/moveIntegration.test.ts`](src/moveExpression/moveIntegration.test.ts):

- Add/adjust tests to cover:
- Whole division result: `\frac{x^{2} + v_{x}}{m} = a` (use `targetSlot: null`).
- Left edge insertion: `\frac{1}{m}(x^{2} + v_{x}) = a`.
- Right edge insertion: `(x^{2} + v_{x})\frac{1}{m} = a`.
- Update any existing multiplicative tests that currently pass `targetSlot: 0/1` but were implicitly “whole division”, to now use `targetSlot: null`.

## Files to change

- [`src/planMove.ts`](src/planMove.ts)
- [`src/App.tsx`](src/App.tsx)
- [`src/moveExpression/applyMoveMultiplicative.ts`](src/moveExpression/applyMoveMultiplicative.ts)
- Tests:
- [`src/planMove.test.ts`](src/planMove.test.ts)
- [`src/moveExpression/applyMoveMultiplicative.test.ts`](src/moveExpression/applyMoveMultiplicative.test.ts)
- [`src/moveExpression/moveIntegration.test.ts`](src/moveExpression/moveIntegration.test.ts)

## Implementation todos

- **tdd-planner-hit-zones**: Add failing `planMove` tests for inside/main-body vs edge-zones and implement the new drop kind + hit-zone logic.
- **tdd-ui-overlay**: Render the new horizontal underline indicator for `ontoSideRootWhole` in `App.tsx`.
- **tdd-executor-3-outcomes**: Add failing `applyMoveMultiplicative` tests for the three outcomes and implement the reciprocal-before/after vs divide-whole branching.
- **update-integration-tests**: Update table-driven integration tests to use `targetSlot: null` for whole-division cross-equal cases; keep existing product-insertion behavior intact.