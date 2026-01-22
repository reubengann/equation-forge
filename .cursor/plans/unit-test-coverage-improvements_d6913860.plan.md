---
name: unit-test-coverage-improvements
overview: Run the existing Vitest V8 coverage report for the unit test suite and add targeted new node-only unit tests for currently-untested pure-logic modules (geometry/hover/plan adapters/overlay calculations) to meaningfully improve line + branch coverage.
todos:
  - id: run-coverage
    content: Run `npm run test:coverage` and inspect `coverage/index.html` + console output to identify the lowest-covered files/branches.
    status: completed
  - id: add-geometry-tests
    content: Add `src/domain/move/planMoveGeometry.test.ts` covering slot computation + multiplicative drop kind edge cases.
    status: completed
  - id: add-hover-target-tests
    content: Add `src/domain/move/planMoveHoverTarget.test.ts` using `ExpressionTree.create(...)` fixtures + stubbed rects.
    status: completed
  - id: add-move-plan-adapter-tests
    content: Add `src/domain/move/movePlanAdapters.test.ts` covering `describeMovePlan` + `planToApplyMoveTarget` branch logic.
    status: completed
  - id: add-overlay-helper-tests
    content: Add `src/ui/drag/renderInsertOverlay.test.ts` focusing on pure helpers (`computeInsertX`, `targetRectForPlan`) without invoking DOM APIs.
    status: completed
---

# Unit test coverage report + gap-driven test additions

## What you already have

- Coverage is already wired up via `npm run test:coverage` in [`package.json`](package.json).
- Unit tests currently run in **Node** and only match `src/**/*.test.ts` per [`vitest.config.ts`](vitest.config.ts):
- `test.environment: "node"`
- `test.include: ["src/**/*.test.ts"]`
- `coverage.provider: "v8"`, `coverage.reporter: ["text", "html"]`
- `coverage.include: ["src/moveExpression/applyMove.ts", "src/**/*.ts"] `(no `tsx` coverage)

## Run the coverage report

- Run: `npm run test:coverage`
- Outputs:
- Console text summary (from the `text` reporter)
- HTML report at `coverage/index.html`
- On Windows, you can open the report quickly with: `start coverage/index.html`

## Gaps worth targeting (node-only, pure logic)

From the current file layout + config, the biggest ROI additions are **pure `.ts` modules without dedicated tests** (no DOM, no React):

- [`src/domain/move/planMoveGeometry.ts`](src/domain/move/planMoveGeometry.ts)
- [`src/domain/move/planMoveHoverTarget.ts`](src/domain/move/planMoveHoverTarget.ts)
- [`src/domain/move/movePlanAdapters.ts`](src/domain/move/movePlanAdapters.ts)
- [`src/ui/drag/renderInsertOverlay.ts`](src/ui/drag/renderInsertOverlay.ts) (specifically the pure helpers like `computeInsertX`/`targetRectForPlan`)

## Add concrete new tests (high-signal cases)

### 1) `planMoveGeometry` (new file: `src/domain/move/planMoveGeometry.test.ts`)

- `computeSlotByMidpoints`
- returns 0 when pointer is left of the first midpoint
- returns n when pointer is right of all midpoints
- skips children whose rect is `null` and still produces a sensible slot
- `determineMultiplicativeDropKind`
- returns `null` if the side root rect is missing
- outside-left vs outside-right returns `kind:"ontoSideRoot"` with `insertIndex` 0/1
- inside rect and wide-enough triggers left/right edge-zone insertion
- inside rect but *too narrow* falls back to `kind:"ontoSideRootWhole"`

### 2) `planMoveHoverTarget` (new file: `src/domain/move/planMoveHoverTarget.test.ts`)

Use small `ExpressionTree.create(...)` fixtures and a stub `rectFor(nodeId)`.

- `isAncestorOrSelf` basic ancestry truth table
- `resolveHoverTarget`
- when hovering inside nested container ops, chooses the **closest** container whose rect contains the pointer, otherwise falls back to the closest structural container
- when hovering over an `Equal`:
- if both side rects exist, prefer unambiguous containment
- for overlap/gap/ambiguous containment, fall back to the equal sign midpoint (`midX(eqRect)`)
- if one side rect is missing, use midpoint fallback (avoid “choosing” the side that happens to have a rect)
- returns `{kind:"add"}` when the chosen side root is a container op; otherwise `{kind:"replace"}`

### 3) `movePlanAdapters` (new file: `src/domain/move/movePlanAdapters.test.ts`)

- `describeMovePlan`
- one test per `plan.kind`, plus `null` plan
- `MoveAcrossEqual` sub-branches (`intoAdd`, `ontoSideRootWhole`, edge insert)
- `planToApplyMoveTarget`
- verifies the slot conversion logic for `ReorderAdd` (`toIndex` vs `fromIndex` adjustment)
- verifies `MoveAcrossEqual` mapping across its drop kinds

### 4) `renderInsertOverlay` pure helpers (new file: `src/ui/drag/renderInsertOverlay.test.ts`)

Avoid `renderInsertOverlay` itself (needs DOM); instead test:

- `computeInsertX`
- `ReorderAdd` slot conversion behaves as expected
- `InsertIntoAdd` uses correct slot
- `WrapIntoAddThenInsert` uses left/right edge based on `insertIndex`
- `MoveAcrossEqual`:
- `intoAdd` delegates to add-slot insertion
- `ontoSideRootWhole` returns `null` (no vertical line)
- special-case `Negate` visual rect selection via `rectForVisual` (a Negate node uses its child rect)
- `targetRectForPlan` returns the expected target rect per plan kind

## Optional (after you see the report)

- If you want to prevent regressions, add coverage thresholds in [`vitest.config.ts`](vitest.config.ts) (lines/branches/functions) once we see current baseline.

## Definition of done

- `npm run test:coverage` produces `coverage/index.html` and shows materially higher coverage for the modules above.
- New tests are deterministic (no DOM), fast, and cover key branching logic.