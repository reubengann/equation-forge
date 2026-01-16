---
name: merge-into-fraction
overview: Enable a multiplicative drag move that merges a factor into the numerator of a fraction within the same product (e.g., \vec{F}\frac{1}{m} = \vec{a} → \frac{\vec{F}}{m} = \vec{a}), using TDD and adding an e2e test.
todos:
  - id: tdd-unit-test
    content: Add failing unit test for \vec{F} * (1/m) → \vec{F}/m in applyMoveMultiplicative
    status: in_progress
  - id: planmove-merge-plan
    content: Add MergeIntoFractionNumerator plan kind + tests and map it to (hoverId=Divide, targetSlot=null)
    status: pending
  - id: executor-merge-logic
    content: Implement merge-into-fraction numerator logic in applyMoveMultiplicative
    status: pending
  - id: e2e-test
    content: Augment Playwright spec to cover drag \vec{F} onto numerator 1
    status: pending
  - id: verify
    content: Run vitest + playwright, fix regressions
    status: pending
---

## Behavior (what will change)

- In **multiplicative** mode, when dragging a factor `X` that is a sibling of a fraction `\frac{A}{B}` inside the same product, dropping **on the numerator region** will merge the factor into the numerator: `X \cdot \frac{A}{B} → \frac{X A}{B}`.
- This applies to **any** fraction (not just `\frac{1}{m}`), but only when the drop is on the **numerator hit-zone**.

## Unit-test-first approach

- Add a failing unit test in [`c:/repos/physics-derivation-pad/src/moveExpression/applyMoveMultiplicative.test.ts`](c:/repos/physics-derivation-pad/src/moveExpression/applyMoveMultiplicative.test.ts) covering exactly:
- Input: `\vec{F} \frac{1}{m} = \vec{a}`
- Action: select `\vec{F}`, hover the numerator (`1`) / fraction, and perform a multiplicative “merge into numerator” drop
- Expected: `\frac{\vec{F}}{m} = \vec{a}`

## Planner changes (so the UI can produce the right hover/slot)

- Extend the `MovePlan` union in [`c:/repos/physics-derivation-pad/src/planMove.ts`](c:/repos/physics-derivation-pad/src/planMove.ts) with a new plan kind (e.g. `MergeIntoFractionNumerator`).
- In `planMove()` (multiplicative mode), add an early detection:
- If the selected node is a direct child of a multiplicative container (`InvisibleOperator`/`Multiply`)
- And the hover is inside a sibling `Divide` node
- And the pointer is in the **numerator subtree / rect**
- Then return `MergeIntoFractionNumerator` with the ids needed.
- Add a focused unit test in [`c:/repos/physics-derivation-pad/src/planMove.test.ts`](c:/repos/physics-derivation-pad/src/planMove.test.ts) that supplies simple rects for numerator/denominator and asserts the new plan is produced.

## Drag plumbing updates

- Update [`c:/repos/physics-derivation-pad/src/helpers/dragHelpers.ts`](c:/repos/physics-derivation-pad/src/helpers/dragHelpers.ts):
- `planToApplyMoveTarget()` maps `MergeIntoFractionNumerator` to `{ hoverId: <divideId>, targetSlot: null }` (reusing `targetSlot: null` as “merge into numerator” when hovering a `Divide`).
- `describeMovePlan()` and overlay helpers handle the new plan kind (overlay can be a no-op to keep this minimal).

## Executor changes (actual tree rewrite)

- Update [`c:/repos/physics-derivation-pad/src/moveExpression/applyMoveMultiplicative.ts`](c:/repos/physics-derivation-pad/src/moveExpression/applyMoveMultiplicative.ts) to recognize:
- `hoverId` is a `Divide` node, and `targetSlot === null`, and the moved node is a sibling factor in the same product.
- Implement rewrite:
- Remove moved factor from the product container.
- Replace the `Divide` node’s numerator with `normalizeMul([oldNumerator, movedExpr])`, with the special-case simplification `1 * X → X`.
- Re-normalize the surrounding product (`normalizeMul`) so leftover `1`s don’t remain.

## E2E test augmentation

- Add a new case to [`c:/repos/physics-derivation-pad/tests/moves.drag.spec.ts`](c:/repos/physics-derivation-pad/tests/moves.drag.spec.ts):
- Set equation to `\vec{F} \frac{1}{m} = \vec{a}`
- Set mode to `multiplicative`
- Drag from `\vec{F}` to the numerator `1` (ensures numerator hit-zone)
- Expect rendered LaTeX contains `\frac{\vec{F}}{m} = \vec{a}`

## Verification

- Run unit tests: `npm run test:run`
- Run e2e: `npm run test:e2e`
- Fix any lints or type errors (notably in `MovePlan` exhaustiveness) until all tests pass.
