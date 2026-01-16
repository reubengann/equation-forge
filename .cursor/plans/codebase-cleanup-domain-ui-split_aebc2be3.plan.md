---
name: codebase-cleanup-domain-ui-split
overview: Refactor toward a clear domain/ui/infra architecture, prioritizing the drag/move pipeline. The goal is to move policy/logic out of hooks/helpers/App into pure domain modules while keeping Playwright e2e tests unchanged.
todos:
  - id: extract-move-selection-policy
    content: Create `src/domain/move/moveSelectionPolicy.ts` and move selection/promotion/collapse rules out of `useDragMove.ts` and `useSelection.ts`.
    status: completed
  - id: split-planMove
    content: Split `src/planMove.ts` into smaller domain modules under `src/domain/move/` and keep a re-export shim at the old path.
    status: completed
  - id: move-plan-adapters
    content: Move `describeMovePlan` / `planToApplyMoveTarget` into domain adapters; leave overlay rendering in UI; keep shims for compatibility.
    status: completed
  - id: infra-mathlive
    content: Move MathLive shadow DOM utilities into `src/infra/mathlive/` with old-path shims.
    status: completed
  - id: app-decomposition
    content: After drag pipeline refactor, split `App.tsx` into UI components and keep orchestration only.
    status: completed
  - id: tests-verify
    content: Run unit tests and Playwright e2e to ensure behavior unchanged; adjust unit test imports if paths move.
    status: completed
---

## Key findings (from review)

- **Domain policy is duplicated across UI + domain**:
- `useDragMove.ts` contains substantial selection/move policy (e.g. `collapseMultiplicativeSelection` and additive/multiplicative special-cases) that overlaps with `planMove.ts` and `selectionSemantics.ts`.
- Vector/factor/product promotion rules appear in multiple places (e.g. `useDragMove.ts` and `planMove.ts`).
- **`planMove.ts` is already “pure-ish” but monolithic**: it mixes geometric hit-zones, hover-target resolution, and move-intent policy in one file.
- **Some “adapter” logic lives in helpers/hooks**: mapping `MovePlan -> applyMove args` (`planToApplyMoveTarget`) and move-mode fallback decisions are in `useDragMove.ts` / `helpers/dragHelpers.ts` but are domain decisions.

## Target architecture

- **Functional core / imperative shell**:
- **Domain** (`src/domain/**`): pure, testable modules operating on `ExpressionTree`, IDs, pointers, rect-providers.
- **Infra** (`src/infra/**`): MathLive shadow DOM querying/hit-testing and other DOM-measurement functions.
- **UI** (`src/ui/**`): React components/hooks; should mostly call domain functions and render overlays.
- Keep compatibility via **re-export shims** at old paths during the migration so churn is controlled and e2e selectors/behavior don’t change.

## Concrete refactor steps

### 1) Extract “move selection policy” into a domain module

Create [`c:\repos\physics-derivation-pad\src\domain\move\moveSelectionPolicy.ts`](c:\repos\physics-derivation-pad\src\domain\move\moveSelectionPolicy.ts) with small, explicit functions:

- `normalizeSelectedIdsForMove({ tree, selectedIds, mode, hoverId }): string[]`
- Moves the logic currently in `useDragMove.ts` (`collapseMultiplicativeSelection` and the “don’t promote when hovering inside same product” rule).
- Also absorbs the “additive mode: promote product if direct child of Equal” rule that appears in both `useDragMove.ts` and `planMove.ts`.
- `hasVectorAncestor(tree, nodeId): boolean` / `isVectorNode(info): boolean`
- Deduplicate vector checks used in `planMove.ts` and `useDragMove.ts`.
- Optional: `normalizeDragHandleId(tree, nodeId): string`
- Unify `movePath.ts`’s `bubbleDragHandleId()` (Negate) with `selectionSemantics.normalizeSelection()` (Negate/Subscript/OverVector).

Update:

- [`c:\repos\physics-derivation-pad\src\hooks\useDragMove.ts`](c:\repos\physics-derivation-pad\src\hooks\useDragMove.ts) to call `normalizeSelectedIdsForMove()` instead of in-hook policy.
- [`c:\repos\physics-derivation-pad\src\hooks\useSelection.ts`](c:\repos\physics-derivation-pad\src\hooks\useSelection.ts) to use the same policy when computing `dragIds` (so selection + drag agree by construction).

### 2) Split `planMove.ts` into focused domain modules

Refactor [`c:\repos\physics-derivation-pad\src\planMove.ts`](c:\repos\physics-derivation-pad\src\planMove.ts) into:

- `src/domain/move/planMove.ts` (public entry: `planMove(args): MovePlan | null`)
- `src/domain/move/planMoveGeometry.ts` (rect math, hit-zones, slot computation)
- `src/domain/move/planMoveHoverTarget.ts` (resolve hover target logic)

Keep **existing external API** by turning the old `src/planMove.ts` into a re-export shim:

- `export * from "./domain/move/planMove";`

### 3) Move “plan adapters” out of UI helpers

Split [`c:\repos\physics-derivation-pad\src\helpers\dragHelpers.ts`](c:\repos\physics-derivation-pad\src\helpers\dragHelpers.ts) by responsibility:

- **Domain**:
- `src/domain/move/movePlanAdapters.ts`:
- `planToApplyMoveTarget(plan): { hoverId; targetSlot } | null`
- `describeMovePlan(plan): string`
- **UI/Infra**:
- `src/infra/mathlive/rectProvider.ts` (e.g. `createRectProvider`)
- `src/ui/drag/renderInsertOverlay.ts` (overlay rendering stays UI)

Again, keep `src/helpers/dragHelpers.ts` as a temporary shim re-exporting the moved functions until imports are updated.

### 4) Relocate MathLive shadow helpers into `infra`

Move [`c:\repos\physics-derivation-pad\src\mathliveShadow.ts`](c:\repos\physics-derivation-pad\src\mathliveShadow.ts) to `src/infra/mathlive/mathliveShadow.ts` and keep a shim at the old path.

### 5) Reduce `App.tsx` to orchestration (follow-on)

After the drag pipeline is domain-driven:

- Extract UI pieces from [`c:\repos\physics-derivation-pad\src\App.tsx`](c:\repos\physics-derivation-pad\src\App.tsx) into `src/ui/components/**` (toolbar, modals, math display panel), leaving `App.tsx` as composition + wiring.
- Any remaining non-UI decisions should go to `src/domain/**`.

## Safety / tests

- **E2E tests unchanged**: keep DOM structure/testids stable; refactor via shims and internal wiring changes.
- **Unit tests**: update import paths as needed; add focused unit tests for the new policy module (to lock down behavior previously “implicitly tested” via hooks).

## Immediate hotspots to address first

- `useDragMove.ts` policy block (`collapseMultiplicativeSelection`, mode fallback, hover-in-same-product exception).
- `planMove.ts` contains similar “promote product when Additive + Equal” logic and vector guards; these should be single-sourced.
- `movePath.ts`’s `bubbleDragHandleId()` should align with `selectionSemantics.normalizeSelection()` to avoid subtle disagreement about what is draggable.
