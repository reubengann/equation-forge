---
name: Factor constants out of integrals
overview: Enable multiplicative moves that factor a selected multiplicative factor out of an integral’s integrand, placing it before/after the integral depending on drop position. Fix the current mis-planning/no-op behavior by adding a dedicated move plan kind and executor support, with unit + e2e coverage.
todos:
  - id: add-plan-kind
    content: Add new MovePlan kind `FactorOutOfIntegrate` and update adapters/overlay.
    status: completed
  - id: planmove-detect-integrate
    content: Teach `planMove` (multiplicative mode) to generate `FactorOutOfIntegrate` when dragging a factor from an integral’s integrand; compute before/after from pointer vs integral rect.
    status: completed
  - id: applymove-integrate-factorout
    content: Implement Integrate factor-out handling in `applyMoveMultiplicative` to rewrite integrand and wrap the integral with the moved factor.
    status: completed
  - id: unit-tests
    content: Add unit tests for planning + execution (planMove + moveIntegration).
    status: completed
  - id: e2e-tests
    content: Add Playwright drag tests for before/after factoring out of integrals.
    status: completed
  - id: run-tests
    content: Run `npm run test:run` and `npm run test:e2e` to verify all tests pass.
    status: completed
---

## What’s broken (root cause)

- Dragging a factor from an integral’s integrand while in **multiplicative** mode currently falls through to the generic non-container target logic in `planMove`, which returns **`WrapIntoAddThenInsert`** and (wrongly) targets the `Equal` node as the “parent to wrap under”.
- On pointer-up, `useDragMove` keeps **multiplicative** mode (because the involved containers are not `Add`), then `applyMoveMultiplicative()` receives `hoverId = Integrate` and `targetSlot = 0|1` but has **no Integrate handling**, so it returns `null` ⇒ no-op.

## Proposed behavior

- In **multiplicative** mode, if the selection is a factor inside the **integrand product** of an `Integrate` node, dragging that factor to the integral should create a plan to **factor it out**.
- Placement rule (per your requirement):
- If pointer is **left** of the integral symbol ⇒ factor goes **before** the integral.
- If pointer is **right** of the integral symbol ⇒ factor goes **after** the integral.
- No “constant w.r.t. d{x}” check (per your earlier answer): we allow factoring regardless of whether the factor syntactically contains the integration variable.

## Implementation details

### 1) Add a dedicated move-plan kind

- Extend `MovePlan` in [`src/domain/move/planMove.ts`](src/domain/move/planMove.ts) with something like:
- `kind: "FactorOutOfIntegrate"`
- `integrateId: string`
- `fromMulId: string` (the product container inside the integrand)
- `movedId: string`
- `fromIndex: number`
- `insertIndex: 0|1` (0=before integral, 1=after)

### 2) Plan it in `planMove()` (multiplicative mode)

- In [`src/domain/move/planMove.ts`](src/domain/move/planMove.ts), add an early multiplicative-only branch:
- Detect nearest `Integrate` ancestor for `hoverId` (or for `movedId`), and ensure `movedId` is inside that integrate’s **integrand subtree** (child 0 of `Integrate`).
- Ensure the moved node’s parent is a multiplicative container (`InvisibleOperator`/`Multiply`) within the integrand.
- Compute `insertIndex` based on pointer position vs the integrate rect:
- Use `rectFor(integrateId)` and treat `pointer.x < rect.left` as `insertIndex=0` else `insertIndex=1`.
- Return `FactorOutOfIntegrate` instead of `WrapIntoAddThenInsert`.

### 3) Execute it in the multiplicative move executor

- Add a new Integrate-specific path in [`src/moveExpression/applyMoveMultiplicative.ts`](src/moveExpression/applyMoveMultiplicative.ts):
- Recognize `hoverId` that is (or is within) an `Integrate` node when `targetSlot` is `0|1`.
- Remove the selected factor from the integrand product (normalize remaining factors to `1` if none).
- Wrap the updated `Integrate` with a product containing the moved factor:
- `insertIndex=0`: `movedFactor * Integrate(updated)`
- `insertIndex=1`: `Integrate(updated) * movedFactor`
- Preserve grouping with `Delimiter` when multiplying by an `Add`/`Equal` payload (same spirit as existing cross-equal multiplicative code).

### 4) Wire plan adapters + overlay

- Update [`src/domain/move/movePlanAdapters.ts`](src/domain/move/movePlanAdapters.ts):
- `describeMovePlan()` for `FactorOutOfIntegrate`
- `planToApplyMoveTarget()` to return `{ hoverId: integrateId, targetSlot: insertIndex }`
- Update [`src/ui/drag/renderInsertOverlay.ts`](src/ui/drag/renderInsertOverlay.ts):
- Treat `FactorOutOfIntegrate` like an edge-insert: draw the vertical line at the integral’s left/right edge.

## Tests

### Unit tests

- Add/extend `planMove` tests in [`src/planMove.test.ts`](src/planMove.test.ts):
- Given `v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`
- Selecting a factor inside the integrand product and hovering the integral should yield `FactorOutOfIntegrate` (and **must not** set `replaceParentId` to the `Equal`).
- Add executor tests (table-driven) in [`src/moveExpression/moveIntegration.test.ts`](src/moveExpression/moveIntegration.test.ts):
- `targetSlot=0` ⇒ factor appears before the integral
- `targetSlot=1` ⇒ factor appears after the integral

### E2E (Playwright)

- Extend [`tests/moves.drag.spec.ts`](tests/moves.drag.spec.ts) with two new cases (multiplicative mode):
- Drag a factor (e.g. `2`) to **left** of the integral rect (negative `dx` bias) ⇒ expect `2` before the integral.
- Drag the same factor to **right** of the integral rect (positive/no bias) ⇒ expect it after.

## Verification (after implementation)

- Run unit tests: `npm run test:run`
- Run e2e tests: `npm run test:e2e` (or scoped to the new test file if desired)

## Expected outcome

- Factoring multiplicative constants out of integrals works via drag-and-drop.
- The planner no longer emits `WrapIntoAddThenInsert` targeting the `Equal` for this interaction.
- Unit + e2e tests cover both before/after placements and prevent regressions.