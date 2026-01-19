---
name: Expand subexpression
overview: Add an “Expand” toolbar action that expands the currently selected node-subexpression using the Compute Engine where possible (with acceptable canonical reordering), plus a custom bilinear distribution rule for `DotProduct` over `Add` to support vector dot expansion.
todos:
  - id: tests-expand-scalar
    content: Write a failing Vitest case for expanding a(b+c)=1 by selecting the product node and asserting latexPlain becomes a b + a c = 1 (allowing canonical spacing).
    status: completed
  - id: tests-expand-dotproduct
    content: Write a failing Vitest case for expanding \vec{a} \cdot (\vec{b}+\vec{c}) by selecting the DotProduct node and asserting latexPlain becomes \vec{a} \cdot \vec{b} + \vec{a} \cdot \vec{c}.
    status: completed
  - id: impl-expand-helper
    content: Implement `expandSubexpression(tree, targetId)` with dot-product distribution + Compute Engine `.expand()` + `normalizeMathJson()` + subtree replacement.
    status: completed
  - id: ui-expand-button
    content: Add Expand button to MoveModeToolbar and wire it in ExpressionPad with enable/disable based on node selection.
    status: completed
  - id: stabilize-and-polish
    content: Handle no-op expansion gracefully and ensure normalization doesn’t break vectors/dot products; fix any lints.
    status: completed
---

## What we have today

- **Selections exist already**: `ExpressionPad` uses `useSelection()` and stores either a node or span selection.
- **Compute Engine integration exists**: parsing/normalization is centralized in [`src/computeEngine.ts`](src/computeEngine.ts), including custom `Vector` and `DotProduct` latex dictionary entries and post-parse MathJSON normalization.
- **Tree rewrites already exist**: subtree replacement uses `tree.pathById[targetId] `+ `setAtPath()` (see [`src/movePath.ts`](src/movePath.ts) and e.g. [`src/substitute.ts`](src/substitute.ts)).

## Proposed behavior

- **Enable Expand only for node selections** (per your answer).
- When the user presses **Expand**:
- Extract the selected MathJSON subtree.
- Apply **custom bilinear dot-product distribution**:
- `DotProduct(Add(a1,a2), b)` → `Add(DotProduct(a1,b), DotProduct(a2,b))`
- `DotProduct(a, Add(b1,b2))` → `Add(DotProduct(a,b1), DotProduct(a,b2))`
- recurse until no longer applicable.
- Then call Compute Engine expansion for standard algebraic distributivity (multiply over add, powers of sums) via `ce.box(expr).expand()`.
- Normalize the resulting MathJSON back into this app’s dialect via `normalizeMathJson()`.
- Replace the selected subtree in the root and re-render.

## TDD plan (unit tests first)

- Add new unit tests (Vitest) that:
- Build a tree from LaTeX using `treefromLatex()` (from [`src/testHelpers.ts`](src/testHelpers.ts)).
- Select a target node id robustly (using `findNodeId()` and/or parent relationships).
- Call a new `expandSubexpression(tree, targetId)` helper and assert on `latexPlain`.

Test cases:

- `a\left(b+c\right)=1` expands (when selecting the `a(b+c)` product node) to something like `a b + a c = 1` (canonical ordering acceptable).
- `\vec{a} \cdot (\vec{b} + \vec{c})` expands (selecting the `DotProduct` node) to `\vec{a} \cdot \vec{b} + \vec{a} \cdot \vec{c}`.

## UI wiring

- Add an **Expand** button to [`src/ui/components/MoveModeToolbar.tsx`](src/ui/components/MoveModeToolbar.tsx) using the existing `IconButton` pattern.
- In [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx):
- Compute `canExpand` from `tree` and `selection.kind === "node"` (and optionally the selected node’s op).
- Add `onExpand` handler that runs `expandSubexpression()` and commits the new root via the existing `commitJson()` path.

## Implementation notes / edge handling

- If expansion is a no-op (expanded subtree deep-equals original), return `null` and do nothing.
- If Compute Engine cannot box/expand some custom operator shapes, we’ll:
- run dot-product distribution in our own code first;
- and/or map `InvisibleOperator` ⇄ `Multiply` only for the Compute Engine call, then normalize back.

## Files to change/add

- Add: [`src/expandSubexpression.ts`](src/expandSubexpression.ts)
- Add: [`src/expandSubexpression.test.ts`](src/expandSubexpression.test.ts)
- Update: [`src/ui/components/MoveModeToolbar.tsx`](src/ui/components/MoveModeToolbar.tsx)
- Update: [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx)
- Possibly update: [`src/computeEngine.ts`](src/computeEngine.ts) (only if we want a small exported helper like `expandWithCE(mj)`)