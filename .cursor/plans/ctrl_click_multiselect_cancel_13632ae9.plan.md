---
name: ctrl_click_multiselect_cancel
overview: Add ctrl/cmd+click multi-selection so users can select matching factors across numerator/denominator, then press Delete to cancel them explicitly (e.g. cancel m/m in a fraction).
todos:
  - id: selection-model
    content: Extend ExprSelection with kind="multi" and update selection semantics helpers to handle it safely.
    status: completed
  - id: ctrl-click
    content: Implement ctrl/cmd+click toggle selection (no drag) in useSelection + ExpressionPad pointer handler.
    status: completed
  - id: explicit-cancel
    content: Add explicit selected-pair fraction cancellation and wire Delete/backspace + toolbar enablement through canCancelTerm/cancelTerm.
    status: completed
  - id: tests
    content: Add Playwright test for m/m cancellation via ctrl+click and (optionally) a unit test enforcing explicit-pair semantics.
    status: completed
---

# Ctrl/Cmd multi-select + explicit fraction cancel

## Goal

Enable selecting multiple nodes via **ctrl/cmd+click**, and when exactly two matching factors are selected across a fraction’s numerator/denominator, **Delete/Backspace cancels them**, producing the simplified expression.

Target UX: in `\ddot{x} = \frac{m g \sin\left(\theta\right)}{m}`, click one `m`, ctrl/cmd+click the other `m`, press Delete → `\ddot{x} = g \sin\left(\theta\right)`.

## Key design decisions

- **Selection model**: extend `ExprSelection` to support a **multi-node** selection.
- **Interaction**: ctrl/cmd+click **toggles** a node in the multi-selection and **does not start a drag**.
- **Cancellation semantics**: with multi-selection, cancellation is **explicit**: only cancel when the selected pair are matching factors on opposite sides of the *same* `Divide`.

## Implementation details (files + essential code paths)

- **Selection type**: update [`src/selectionSemantics.ts`](src/selectionSemantics.ts)
- Extend `ExprSelection`:
- `kind: "multi"; nodeIds: string[]`
- Update helpers that pattern-match `ExprSelection` (e.g. `expandSelection()` should return `null` for `multi`).

- **Highlighting**: update [`src/helpers/selectionHelpers.ts`](src/helpers/selectionHelpers.ts)
- `applySelectionHighlight()` should accept `multi` by unioning descendants:
- use existing `getDescendantNodeIds(tree, ids)`.

- **Ctrl/cmd click selection**: update [`src/hooks/useSelection.ts`](src/hooks/useSelection.ts)
- Extend `handleClick()` signature to accept a `modKey: boolean` (from `e.ctrlKey || e.metaKey`).
- When `modKey` is true:
- toggle the clicked (normalized/promoted) id into an id set
- produce:
- `node` selection when 1 id
- `multi` selection when ≥2 ids
- keep existing shift+click behavior when `shiftKey` is true (shift should take precedence; modKey should bypass range selection).

- **Don’t start drag on modKey**: update [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx)
- In `onDisplayPointerDown()`, after computing `clickedId`, branch early when `e.ctrlKey || e.metaKey`:
- update selection + highlight
- **return** before `setPointerCapture()` / `startDrag()`
- In `onKeyDown()` for Delete/Backspace, call `cancelTerm()` with the (possibly multi) selection.

- **Explicit pair cancellation**: update [`src/cancelTerm.ts`](src/cancelTerm.ts)
- Add a helper like `cancelSelectedPairInFraction(tree, aId, bId)`:
- verify both ids exist and are each under a `Divide` ancestor
- verify they belong to the **same Divide**, with one in numerator subtree and the other in denominator subtree
- verify the selected nodes’ canonical MathJSON (via existing `unwrapDelimiter()` + `deepEqualMJ()`) match
- remove that factor once from numerator factors and once from denominator factors (reuse `factorsOf()` + `removeFactorOnce()`)
- rebuild and simplify `Divide(num, den)` to `num` when denominator is 1-equivalent (reuse existing `isOneEquivalent()` and normalization)
- Extend `canCancelTerm()`/`cancelTerm()` to accept:
- `selection.kind === "multi"` with exactly 2 ids → attempt pair cancellation
- otherwise preserve existing behavior

- **Selection debug (optional but low-risk)**: update [`src/helpers/selectionHelpers.ts`](src/helpers/selectionHelpers.ts) and `ExpressionPad.tsx`
- Add a `getSelectionDetailsForMulti()` so the debug panel doesn’t go stale when multi-selecting.

## Tests

- **Playwright e2e**: update [`tests/cancel-term.spec.ts`](tests/cancel-term.spec.ts)
- Add test:
- set equation `String.raw`\`\\ddot{x} = \\frac{m g \\sin\\left(\\theta\\right)}{m}\``
- resolve the two `m` node ids by parsing with `buildTree()` and collecting `n.latex === "m"`
- click first `m`
- `page.keyboard.down("Control")`, click second `m`, `page.keyboard.up("Control")`
- press Delete
- assert rendered latex is exactly `\ddot{x} = g \sin\left(\theta\right)` (after whitespace normalization)

- **Unit test (recommended)**: update [`src/cancelTerm.test.ts`](src/cancelTerm.test.ts)
- Add a test that constructs the same fraction and asserts:
- selecting just one `m` does **not** cancel (new explicit requirement only for multi)
- selecting a `multi` of both `m` ids **does** cancel

## Notes / risks

- `ExprSelection` is used in multiple places; after adding `multi`, TypeScript exhaustiveness will guide all necessary updates.
- Playwright clicking must avoid ambiguous “latex match” for `m`; the test should compute both nodeIds and click by geometry.