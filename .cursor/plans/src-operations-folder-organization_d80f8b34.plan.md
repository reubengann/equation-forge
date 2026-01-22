---
name: src-operations-folder-organization
overview: Organize root-level operation modules (e.g., factor/cancel/evaluate/expand/substitute/flip/applyBothSides) into a dedicated src/operations/ folder with small, discoverable subfolders, keeping core utilities in src/ for now and moving tests alongside implementations.
todos:
  - id: create-ops-folders
    content: Add src/operations/ with algebra/ and equations/ subfolders (and optional barrel index exports).
    status: completed
  - id: move-ops-and-tests
    content: Move the operation modules + their colocated *.test.ts files into the new folders, updating relative imports as needed (or add root re-export shims).
    status: in_progress
  - id: update-call-sites
    content: Update imports across UI and other modules to reference the new locations (either directly or via src/operations barrel exports).
    status: pending
  - id: verify-tests
    content: Run Vitest unit tests AND Playwright e2e specs; both must pass to accept the re-org (this is a refactor-only change).
    status: pending
---

## Proposed folder taxonomy (minimal churn)

Create a new top-level folder [`src/operations/`](c:/repos/physics-derivation-pad/src/operations/) and move only the user-facing “operation” modules into it.

## Non-negotiable constraint

- **All unit tests and e2e tests must continue to pass.** This change is a pure refactor (file moves + import updates), so green tests are the acceptance criteria.

Suggested subfolders:

- **`src/operations/algebra/`**: operations that rewrite an expression tree via algebraic rules
- [`src/factorSelection.ts`](c:/repos/physics-derivation-pad/src/factorSelection.ts) → `src/operations/algebra/factorSelection.ts`
- [`src/cancelTerm.ts`](c:/repos/physics-derivation-pad/src/cancelTerm.ts) → `src/operations/algebra/cancelTerm.ts`
- [`src/evaluateSelection.ts`](c:/repos/physics-derivation-pad/src/evaluateSelection.ts) → `src/operations/algebra/evaluateSelection.ts`
- [`src/expandSubexpression.ts`](c:/repos/physics-derivation-pad/src/expandSubexpression.ts) → `src/operations/algebra/expandSubexpression.ts`
- [`src/substitute.ts`](c:/repos/physics-derivation-pad/src/substitute.ts) → `src/operations/algebra/substitute.ts`
- **`src/operations/equations/`**: operations that require a top-level equation
- [`src/flipEquation.ts`](c:/repos/physics-derivation-pad/src/flipEquation.ts) → `src/operations/equations/flipEquation.ts`
- [`src/applyBothSides.ts`](c:/repos/physics-derivation-pad/src/applyBothSides.ts) → `src/operations/equations/applyBothSides.ts`

Keep the “core” building blocks where they are for now (your choice):

- `src/ExpressionTree.ts`, `src/movePath.ts`, `src/computeEngine.ts`, `src/selectionSemantics.ts` stay in `src/`

This matches what I saw in the code: the operations are “leaf” modules that import core utilities (e.g., `factorSelection` imports `ExpressionTree`, `movePath`, `computeEngine`, `selectionSemantics`).

## Test colocation

Since you selected **move tests with the code**, move the paired tests with each module:

- `src/factorSelection.test.ts` → `src/operations/algebra/factorSelection.test.ts`
- `src/cancelTerm.test.ts` → `src/operations/algebra/cancelTerm.test.ts`
- `src/evaluateSelection.test.ts` → `src/operations/algebra/evaluateSelection.test.ts`
- `src/expandSubexpression.test.ts` → `src/operations/algebra/expandSubexpression.test.ts`
- `src/substitute.test.ts` → `src/operations/algebra/substitute.test.ts`
- `src/flipEquation.test.ts` → `src/operations/equations/flipEquation.test.ts`
- `src/applyBothSides.test.ts` → `src/operations/equations/applyBothSides.test.ts`

## Import hygiene and ergonomics

To avoid deep relative imports proliferating over time, add a small barrel export:

- `src/operations/index.ts` re-exports public ops (and optionally per-subfolder `index.ts` files).

Then UI/components can import from `src/operations` instead of `../../..` paths.

Two migration options (pick one during implementation):

- **Option A (clean break)**: update all imports to new paths immediately.
- **Option B (compat shims)**: keep the old root files (e.g., `src/factorSelection.ts`) as thin re-exports from the new location, so existing imports keep working while you migrate gradually. (This is a good fit if there are many call sites.)

## Verification

- **Run unit tests (Vitest)** and fix any import/path fallout until green.
- **Run Playwright e2e specs** and fix any runtime import/path fallout until green.
- Treat any failing test as a blocker: adjust exports/imports (or use compat re-export shims) until the full suite is passing.

## Follow-up (optional, later)

If `src/` is still crowded after this, the next low-risk step is carving out a `src/core/` folder for `ExpressionTree`, `movePath`, `selectionSemantics`, and similar utilities. This is intentionally deferred to keep this change small and focused.