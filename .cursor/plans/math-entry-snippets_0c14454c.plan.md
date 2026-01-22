---
name: math-entry-snippets
overview: Add one-click insertion of common calculus templates (d/dt and definite integral) at the current cursor position for both MathLive and plain-text LaTeX entry, using MathLive placeholders only in MathLive mode.
todos:
  - id: add-snippet-ui
    content: Add d/dt and ∫ buttons inside `src/ui/components/LatexInputWithToggle.tsx` and wire them to insertion handlers.
    status: completed
  - id: mathlive-insert
    content: "Implement MathLive insertion via `mathFieldRef.current.insert()` using LaTeX placeholders and `selectionMode: \"placeholder\"`."
    status: completed
  - id: textarea-insert
    content: Implement textarea insertion using `selectionStart/selectionEnd` and restore caret position after controlled update.
    status: completed
  - id: e2e-tests
    content: Add/extend Playwright tests to cover insertion in both modes and ensure no `d_upright` leakage.
    status: completed
---

## Current state (what we’ll build on)

- `LatexInputWithToggle` already renders either a MathLive `<math-field>` or a controlled `<textarea>`, and it already receives refs to both (`mathFieldRef`, `textAreaRef`). That’s enough to implement “insert at cursor” in one place.
- MathLive supports programmatic insertion via `MathfieldElement.insert()` with `selectionMode: "placeholder"`, and LaTeX placeholders via `\\placeholder{}`.
- This repo already has special handling for differentials: canonical display uses `\\mathrm{d}{x}` while MathLive-friendly form uses `\\differentialD x` (`src/infra/mathlive/differentialLatex.ts`). We’ll keep insert templates compatible with that.

## UX/UI behavior

- Add a small “snippets” row inside `LatexInputWithToggle` (so it appears everywhere it’s used: main entry + Substitute modal).
- Provide two buttons:
- **d/dt**: inserts a derivative operator template at the caret.
- **∫**: inserts a definite integral template at the caret.
- **MathLive mode**: inserted templates include `\\placeholder{}` so the caret jumps into the first placeholder automatically.
- **Text mode**: inserted templates do **not** use placeholders; instead we place the caret programmatically at the most useful position (inside parentheses or at the integrand slot) using the textarea selection API.

## Templates (exact strings)

- **Derivative operator (d/dt)**
- **MathLive** (with placeholder):
- `\\dfrac{\\differentialD}{\\differentialD t}\\left(\\placeholder{}\\right)`
- Rationale: keeps consistent with existing MathLive/Compute Engine usage of `\\differentialD` and puts the cursor inside the parentheses.
- **Text** (no placeholder, caret inside parentheses):
- Insert `\\dfrac{\\mathrm{d}}{\\mathrm{d}t}\\left(\\right)` and set caret between `\\left(` and `\\right)`.
- **Definite integral**
- **MathLive** (with placeholders):
- `\\int_{\\placeholder{a}}^{\\placeholder{b}} \\placeholder{}\\,\\differentialD x`
- Caret lands at the integrand placeholder.
- **Text** (no placeholder, caret at integrand slot):
- Insert `\\int_{a}^{b}  \\mathrm{d}{x}` with an explicit `\\,` (or a space) before the differential, and set caret between the bounds and the differential tail.

## Implementation steps

- Update [`c:\repos\physics-derivation-pad\src\ui\components\LatexInputWithToggle.tsx`](c:\repos\physics-derivation-pad\src\ui\components\LatexInputWithToggle.tsx)
- Add a small snippets UI (likely a `div` with `display:flex`, `gap`, `flexWrap`).
- Implement `insertAtCursor(snippet)` that branches by `inputMode`:
- **MathLive**: call `mathFieldRef.current?.insert(snippetMathLive, { format: "latex", selectionMode: "placeholder", focus: true })` (or equivalent options supported by the element).
- **Text**: use `textAreaRef.current.selectionStart/selectionEnd` to splice `latex` and call `onLatexChange(next)`; then in `requestAnimationFrame` (or `setTimeout(0)`) restore focus and set the selection range to the desired caret position.
- Keep everything backward compatible: if a ref is missing, fall back to appending at end.

## Tests

- Add Playwright coverage in [`c:\repos\physics-derivation-pad\tests\differentials.e2e.spec.ts`](c:\repos\physics-derivation-pad\tests\differentials.e2e.spec.ts) (or a new focused spec) to verify:
- Clicking **d/dt** inserts the template at the caret in **MathLive** and that the caret lands in the placeholder (we can validate by typing and asserting the resulting LaTeX).
- Switching to **Plain text** and clicking **d/dt** inserts at the current selection and places the caret inside the parentheses.
- Clicking **∫** behaves similarly, and the resulting stored LaTeX does not contain `d_upright`.

## Optional follow-up (not required for this change)

- Rename `LatexInputWithToggle` to something clearer (e.g. `LatexEntryField`), and update imports in `ExpressionPad` / `SubstituteModal`.