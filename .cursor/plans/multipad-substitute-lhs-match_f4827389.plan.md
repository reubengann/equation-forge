---
name: multipad-substitute-lhs-match
overview: Enhance the Substitute modal in multi-pad mode so it can suggest substitution sources from other pads whose equation LHS matches the currently selected term, and allow one-click insertion of the matching RHS.
todos:
  - id: propagate-other-pad-snapshots
    content: Pass other pads’ snapshots (with displayed pad indices) into each ExpressionPad from DerivationPage.
    status: completed
  - id: mathjson-match-utils
    content: Add canonicalize+deep-equal helpers for best-effort LHS matching (unwrap Delimiter, drop identities, simplify double-negate).
    status: completed
  - id: compute-suggestions
    content: In ExpressionPad, compute candidate substitutions by scanning other pads’ Equal(lhs,rhs) snapshots and matching lhs to the selected node’s json.
    status: completed
  - id: modal-suggestion-ui
    content: Extend SubstituteModal UI to show matching-pad suggestions and allow click-to-fill replacement field (with test ids).
    status: completed
  - id: tests
    content: Add unit tests for matching and a Playwright multi-pad test proving cross-pad substitution works end-to-end.
    status: completed
---

# Multi-pad substitute: suggest definitions by LHS match

## What we have today

- Each pad persists a snapshot `{ latex, rootJson }` after committing/rendering.
```87:90:c:\repos\physics-derivation-pad\src\ui\components\ExpressionPad.tsx
export type ExpressionPadSnapshot = {
  latex: string;
  rootJson: MJ;
};
```

- The multi-pad page stores an array of pads with optional snapshots, and renders one `ExpressionPad` per item.
```9:10:c:\repos\physics-derivation-pad\src\pages\DerivationPage.tsx
type Pad = { id: string; snapshot?: ExpressionPadSnapshot };
```
```215:219:c:\repos\physics-derivation-pad\src\pages\DerivationPage.tsx
<ExpressionPad
  key={pad.id}
  initialSnapshot={pad.snapshot}
  onSnapshot={(snapshot) => updateSnapshot(pad.id, snapshot)}
/>
```

- Substitution is currently “manual”: the modal pre-fills the replacement input with the selected node’s own LaTeX, then applies the parsed replacement into the current pad’s tree.

## Desired UX

When the Substitute modal is opened in a pad and a term is selected (e.g. `N` in pad (4)), the modal should show a list of *other pads* whose root is an equation `Equal(lhs, rhs)` and whose `lhs` matches the selected term (best-effort, ignoring superficial wrappers). Clicking a suggestion should fill the replacement input with that pad’s `rhs`.

## Implementation approach

### 1) Share other pads’ snapshots with each `ExpressionPad`

- Extend `ExpressionPadProps` with an optional prop like:
  - `otherPadSnapshots?: Array<{ padIndex: number; snapshot: ExpressionPadSnapshot }>`
  - (padIndex is the displayed `(idx+1)` number)
- In `DerivationPage`, compute this list for each rendered pad (all pads excluding itself) and pass it down.
- Keep the prop optional so `DebugPage` continues to work unchanged.

### 2) Best-effort LHS matching

- Add a small MathJSON canonicalization helper, used only for matching, to ignore “cosmetic” differences:
  - unwrap `Delimiter` recursively (`(x)` vs `x`)
  - drop additive identity terms (remove `0` from `Add`)
  - drop multiplicative identity factors (remove `1` from `Multiply`/`InvisibleOperator`)
  - collapse double-negation (`Negate(Negate(x)) -> x`)
- Then compare with a deep structural equality.

Proposed new utility module:

- [`src/mathJson/match.ts`](c:/repos/physics-derivation-pad/src/mathJson/match.ts)
  - `canonicalizeForMatch(mj: MJ): MJ`
  - `deepEqualMJ(a: MJ, b: MJ): boolean`
  - `lhsMatchesSelected(lhs: MJ, selected: MJ): boolean` (canonicalize + deep equal)

### 3) Extract candidate “definitions” from other pads

- In `ExpressionPad` when the modal is open and `substituteTargetId` is known, compute:
  - `selectedJson = tree.nodesById[substituteTargetId].json`
  - For each `otherPadSnapshots` item:
    - If `snapshot.rootJson` is `['Equal', lhs, rhs]` and `lhsMatchesSelected(lhs, selectedJson)` is true, create a suggestion:
      - label: `(${padIndex})`
      - rhsLatex: `ExpressionTree.create(rhs).latexPlain`
- Pass suggestions into `SubstituteModal`.

### 4) UI changes in `SubstituteModal`

- Add a section like “Use definition from another pad” above the replacement input.
- Render suggestions as buttons (or a list) that on click:
  - sets the MathLive field value to `toMathLiveLatex(rhsLatex)`
  - optionally focuses the field
- Add stable test ids for suggestions, e.g. `data-testid="substitute-suggestion-pad-3"`.

### 5) Tests

- Unit tests for matching/canonicalization:
  - `(N)` matches `N`
  - `-(-N)` matches `N`
  - `1 N` matches `N` if it occurs as `InvisibleOperator(1, N)` or `Multiply(1, N)`
- Playwright e2e test in multi-pad mode:
  - Seed `localStorage.derivation-pads` with two pads:
    - pad (1): `N = F_g \cos(\theta)`
    - pad (2): `-\mu_s N + F_g \sin(\theta) = m \ddot{x}`
  - Open Derivation page, select `N` in pad (2), open Substitute, assert the suggestion for pad (1) is present, click it, OK, and assert pad (2) now contains the substituted RHS.

## Files to change

- [`src/pages/DerivationPage.tsx`](c:/repos/physics-derivation-pad/src/pages/DerivationPage.tsx) (pass other pads’ snapshots into each pad)
- [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx) (compute suggestions and wire into modal)
- [`src/ui/components/SubstituteModal.tsx`](c:/repos/physics-derivation-pad/src/ui/components/SubstituteModal.tsx) (render suggestions + click-to-fill)
- Add: [`src/mathJson/match.ts`](c:/repos/physics-derivation-pad/src/mathJson/match.ts)
- Add: a new unit test file for matching
- Add: new Playwright spec under [`tests/`](c:/repos/physics-derivation-pad/tests/) for multi-pad substitution suggestions