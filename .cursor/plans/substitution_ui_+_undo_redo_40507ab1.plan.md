---
name: Substitution UI + Undo/Redo
overview: Add a substitution workflow that replaces a selected subexpression with a user-entered RHS expression, plus undo/redo for any equation-changing operation (Add/Update, drag moves, substitution). Tree manipulation will be implemented TDD-first in a new module.
todos:
  - id: tdd-substitute
    content: Create `src/substitute.test.ts` for single/all substitution; implement `src/substitute.ts` to pass.
    status: completed
  - id: history
    content: Implement history state + `commitJson`, `undo`, `redo` in `src/App.tsx`; route Add/Update and moves through commits.
    status: completed
  - id: substitute-ui
    content: Add Substitute toolbar button + modal (selected LHS + MathField RHS + scope toggle) and wire OK to substitution + commit.
    status: completed
  - id: shortcuts
    content: Add keyboard shortcuts for undo/redo and toolbar buttons; prevent triggering while typing in inputs/MathField.
    status: completed
---

## Goals

- Add a **Substitute** command: when a node like `\vec{F}` is selected, open a modal showing `selected =` on the left and an existing-style LaTeX entry field on the right; on OK, parse RHS and substitute into the current equation.
- Support **scope toggle**: replace only the selected occurrence, or all occurrences that structurally match the selected subexpression.
- Add **undo/redo** that works for any equation-changing operation: Add/Update, drag moves (applyMove), and substitution.

## Current code leverage

- Parsing LaTeX → MathJSON already exists in `App.tsx` via `ce.parse(latex, { canonical: false })` (see `onAddEquation()`), and tests use `treefromLatex()` / `makeMJfromLatex()` in `src/testHelpers.ts`.
- Every `ExpressionTree` node has `pathById[id]: number[]` and `nodesById[id].json: MJ`, which lets us do deterministic immutable replacement of subtrees.

## Design

### 1) New tree-manipulation module (TDD)

- Add `src/substitute.ts` exporting something like:
- `type SubstituteScope = "single" | "all"`
- `substitute(args: { tree: ExpressionTree; targetId: string; replacement: MJ; scope: SubstituteScope }): ExpressionTree | null`
- Implementation approach:
- **Single occurrence**: use `tree.pathById[targetId] `and an immutable `setAtPath(rootJson, path, replacement)` to produce a new root MathJSON; return `ExpressionTree.create(newRoot)`.
- **All occurrences**: compute `targetJson = tree.nodesById[targetId].json`; find all node IDs whose `nodesById[id].json `is deep-equal to `targetJson`. Apply replacements to all matching paths. To avoid path invalidation, apply replacements **deepest-first** (sort paths by descending length), using immutable set-at-path each time.
- Return `null` if `targetId` not found or path missing.
- Tests: add `src/substitute.test.ts` (Vitest), covering:
- Replacing a symbol once (e.g. in `a + a = b`, select the left `a`, scope=single ⇒ `c + a = b`).
- Replacing all occurrences (same input, scope=all ⇒ `c + c = b`).
- Physics example: `\vec{F}=\vec{F}_{g}+\vec{N}` select `\vec{F}` scope=single/all (they’re equivalent here) replace with parsed `m \ddot{\vec{r}}` ⇒ `m \ddot{\vec{r}}=\vec{F}_{g}+\vec{N}` (assert via `latexPlain` or via MathJSON shape).

### 2) App state changes: history (undo/redo)

- In `src/App.tsx`, introduce history state for equation-changing commits. Recommended shape:
- `type History = { past: MJ[]; present: MJ | null; future: MJ[] }`
- Derive/render `ExpressionTree` from `present` when committing.
- Add helpers in `App.tsx`:
- `commitJson(next: MJ, opts?: { latex?: string })` that:
- pushes current `present` into `past` (if non-null)
- sets `present = next`
- clears `future`
- rebuilds tree via `ExpressionTree.create(next)`
- clears selection and renders (`renderTree`, `setInfoFromTree`)
- `undo()` pops from `past` into `present`, pushing old `present` into `future`.
- `redo()` pops from `future` into `present`, pushing old `present` into `past`.
- Wire commits:
- `onAddEquation()` uses `commitJson(json, { latex })`.
- In `onDisplayPointerUp()`, when `applyMove()` produces `next`, commit via `commitJson(next.rootJson, { latex: next.latexPlain })` (or directly store `MJ` from `next.rootJson`).
- Substitution OK similarly commits the substituted tree’s `rootJson`.

### 3) Substitute modal UI + toolbar command

- Add a new toolbar button in the existing toolbar block in `App.tsx` (near the move mode buttons) to trigger substitution.
- Enable button only when `tree != null` and `selection?.kind === "node"`.
- Modal behavior:
- Overlay div with a centered panel.
- Left side: render the selected node’s LaTeX (use `tree.nodesById[selectedId].latex`) plus a literal `=`.
- Right side: a `MathField` input (same component you already use at top) for the RHS.
- Controls: OK / Cancel.
- Add a scope toggle (radio buttons or segmented control): **This occurrence** vs **All occurrences**.
- On OK:
- read RHS latex, `ce.parse(rhsLatex, { canonical: false })`, get `expr.json as MJ`
- call `substitute({ tree, targetId: selection.nodeId, replacement, scope })`
- if success: `commitJson(result.rootJson, { latex: result.latexPlain })`
- if parse/substitute fails: show a small inline error message in the modal, do not commit.

### 4) Keyboard shortcuts

- Add window keydown handlers in `App.tsx` for:
- Undo: `Ctrl+Z` (and `Meta+Z` for mac compatibility)
- Redo: `Ctrl+Y` and `Ctrl+Shift+Z` (and mac `Meta+Shift+Z`)
- Ensure shortcuts don’t fire when focus is inside a `MathField` (check activeElement / composedPath).

## Files to change/add

- Add: `src/substitute.ts`
- Add: `src/substitute.test.ts`
- Update: `src/App.tsx` (history state, undo/redo actions/buttons/shortcuts, substitution modal UI and wiring)
- Potentially update: `src/App.css` if you prefer modal styles there (optional; can be inline like existing UI).

## Implementation todos

- **tdd-substitute**: Add `src/substitute.test.ts` failing tests for single/all substitution; implement `src/substitute.ts` until passing.
- **history**: Add history state + `commitJson/undo/redo` in `src/App.tsx`; rewire Add/Update and applyMove commits.
- **substitute-ui**: Add toolbar Substitute button + modal with MathField RHS and scope toggle; hook OK to `substitute()` + `commitJson()`.
- **shortcuts**: Add Ctrl/Meta Z/Y/Shift-Z handlers and guard against typing focus.
