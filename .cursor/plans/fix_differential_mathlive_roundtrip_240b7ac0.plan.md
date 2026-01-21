---
name: Fix differential MathLive roundtrip
overview: Fix MathLive programmatic set/get not being idempotent for differentials (leaking `d_upright`/`Nothing` into LaTeX), which breaks rendering and causes “open Substitute → OK without edits” to change the expression.
todos:
  - id: mathlive-app-set-get
    content: Update Substitute modal wiring in `src/ui/components/ExpressionPad.tsx` to use `setValue()` for prefill and `getValue('latex-expanded')` for submit.
    status: completed
  - id: ce-sanitize
    content: Add `normalizeMathLiveLatex()` in `src/computeEngine.ts` and apply it in `parse()` to rewrite any MathLive-emitted alias tokens (starting with `d_upright`).
    status: completed
  - id: e2e-helper-update
    content: Update Playwright helper usage in `tests/substitute.spec.ts` to set MathLive fields via `setValue()` after `customElements.whenDefined('math-field')`.
    status: completed
  - id: e2e-regression
    content: Add an e2e regression test proving Substitute prefill is idempotent for differential-containing expressions (no `d_upright`/`Nothing`).
    status: completed
  - id: verify
    content: Run unit + e2e tests to confirm the fix and adjust sanitizer patterns only as needed.
    status: in_progress
---

## Findings (current behavior)

- The Substitute modal prefill + e2e helpers set MathLive content by assigning `el.value = ...`:
  - App: `useEffect` in [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx) sets `substituteFieldRef.current.value = initialLatex`.
  - E2E: `setSubstituteInput()` in [`tests/substitute.spec.ts`](tests/substitute.spec.ts) does the same and manually dispatches an `input` event.
- On submit, the app reads `substituteFieldRef.current?.value` and passes that to `parse()`.
- Your Compute Engine layer already understands differentials in canonical LaTeX (`\mathrm{d}x`) and has custom entries for derivative fractions and `\differentialD` (see [`src/computeEngine.ts`](src/computeEngine.ts) and tests in [`src/computeEngine.test.ts`](src/computeEngine.test.ts)).

## Issue statement (what’s actually broken)

- **Rendering failure**: when an e2e test (or the app) programmatically sets a MathLive field to LaTeX containing differentials/derivatives/integrals, MathLive sometimes renders internal token names (e.g. `d_upright`) instead of an upright differential \( \mathrm{d} \).
- **Non-idempotent Substitute prefill**: we prefill the Substitute MathLive field from `ExpressionTree.node.latex`. If the user clicks OK without edits, reading the field back produces *different* LaTeX (e.g. `d_upright`, `Nothing`) than what we set, so parsing/substitution operates on a changed expression.
- **Scope**: this appears specific to **programmatic setting**; manual typing does not reproduce it reliably.

## Likely root cause

MathLive can normalize/serialize certain constructs (notably upright differential “d”) into internal/alias tokens during programmatic set/get, which then leak into the LaTeX string we feed to the Compute Engine. That’s how you end up with strings like `d_upright` and `Nothing` showing up in your rendered output: they’re being treated as plain symbols, not differential operators.

## Approach

- **Stop relying on raw `.value` round-tripping** for MathLive custom elements and instead use:
  - `mathfield.setValue(latex)` for programmatic setting
  - `mathfield.getValue('latex-expanded')` for programmatic reading
- **Add a small LaTeX sanitizer** before Compute Engine parsing to rewrite any MathLive-emitted alias tokens (e.g. `d_upright`) into canonical LaTeX the CE understands.
- **Add regression coverage**:
  - An e2e test reproducing “open Substitute and accept without editing” for a differential-containing expression and asserting the expression is unchanged.
  - Optionally, a unit test for the sanitizer.
```mermaid
flowchart LR
  selectionLatex[ExpressionTree.node.latex]
  setMathLive[mathfield.setValue(selectionLatex)]
  getMathLive["mathfield.getValue('latex-expanded')"]
  sanitize[normalizeMathLiveLatex()]
  parseCE[parse() ComputeEngine]
  substitute[substitute()]

  selectionLatex --> setMathLive --> getMathLive --> sanitize --> parseCE --> substitute
```


## Files to change

- App logic
  - [`src/ui/components/ExpressionPad.tsx`](src/ui/components/ExpressionPad.tsx)
    - Replace `el.value = initialLatex` with `el.setValue(initialLatex)` (after upgrade) when opening Substitute.
    - Replace `substituteFieldRef.current?.value` with `substituteFieldRef.current?.getValue('latex-expanded')` (fallback to `.value` if needed).
- Compute Engine normalization
  - [`src/computeEngine.ts`](src/computeEngine.ts)
    - Add `normalizeMathLiveLatex(latex: string)` used inside `parse()` (similar to existing `normalizeVectorMacros`).
    - Start with targeted rewrites:
      - `d_upright` → `\\mathrm{d}` or `\\differentialD` (choose the option that produces stable CE MathJSON in your codebase).
      - Any other observed tokens from repro (keep list small + tested).
- E2E helpers + tests
  - [`tests/substitute.spec.ts`](tests/substitute.spec.ts)
    - Update `setSubstituteInput()` to wait for `customElements.whenDefined('math-field')` and call `el.setValue(latex)` (no manual `input` event unless required).
    - Add regression test: select a differential-containing LHS, open Substitute, **click OK without changing input**, assert rendered LaTeX unchanged and does not contain `d_upright` or `Nothing`.
  - Optionally extract a shared helper (e.g. `tests/helpers/mathField.ts`) used by `macros.spec.ts` and `substitute.spec.ts`.

## Test plan

- **E2E**: run `npm run test:e2e` and confirm:
  - Existing Substitute tests pass.
  - New regression test passes.
- **Unit** (optional but recommended): extend [`src/computeEngine.test.ts`](src/computeEngine.test.ts) with a test that parses a string containing `d_upright` and produces the same MathJSON as canonical differential LaTeX.

## Notes / assumptions

- Repo uses **MathLive `^0.108.2`**, where `setValue()` and `getValue(format)` are supported.
- We’ll prefer `latex-expanded` output from MathLive to avoid dependency on custom macros (`\differentialD`, `\vec`, etc.), and rely on your existing `normalizeVectorMacros()` (plus the new sanitizer) to keep parsing stable.