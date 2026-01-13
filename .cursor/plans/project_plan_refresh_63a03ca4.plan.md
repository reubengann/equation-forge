---
name: Project plan refresh
overview: Regenerate a single authoritative project plan that reflects the current shipped functionality and the next work items (including derivative/ComputeEngine dictionary support), without making additional code changes.
todos:
  - id: plan-1-shared-ce
    content: Add shared `ComputeEngine` module and switch UI/tests to use it.
    status: pending
  - id: plan-2-dict-entries
    content: Extend `ce.latexDictionary` to recognize `\differentialD` and a derivative-form `\dfrac{...}{...}` mapping to `['FractionDerivative', f, x]`, with correct CE dictionary constraints.
    status: pending
    dependencies:
      - plan-1-shared-ce
  - id: plan-3-render
    content: Implement round-trip rendering for `FractionDerivative` (either CE serialize entry or `ExpressionTree` op renderer) while preserving node tagging.
    status: pending
    dependencies:
      - plan-2-dict-entries
  - id: plan-4-tests
    content: Add tests for parsing and LaTeX round-tripping of derivative form.
    status: pending
    dependencies:
      - plan-3-render
---

# Physics Derivation Pad — Updated Project Plan

## Current state (already shipped)

- **Intent planning**: Dragging runs `planMove()` and shows the move intent text in the lower debug textarea (no live preview mutation).
- **Insert marker**: A thin vertical line indicates the planned insert point; scoped to the relevant sub-expression (e.g. numerator only).
- **Drop execution**: On pointer-up over a valid drop, the app executes the move via `applyMove()` and rerenders.
- **Selection**:
- Single click selects a node.
- Shift+click selects a contiguous span/range within an additive parent.
- Clicking inside an existing span preserves the span when starting a drag.
- **Multi-term moves (initial support)**: Contiguous siblings in an `Add` can be moved as a block, including cross-`=` and fraction-numerator behaviors.
- **Test coverage**: Expanded tests around multi-term moves and tricky fraction-numerator insertion (see `src/moveExpression/applyMove.test.ts`).
- This project is developed with TDD. Any module other than a React component should write tests, verify they fail, then write code, verify it passes.

## Goal (next major feature)

Support MathLive derivative LaTeX round-tripping with CortexJS ComputeEngine:

- Accept MathLive-emitted derivative LaTeX like `\\dfrac{\\differentialD f}{\\differentialD x}`.
- Parse into a stable MathJSON node such as `['FractionDerivative', 'f', 'x']`.
- Render back to the same MathLive-style LaTeX.

## Plan

### 1) Centralize ComputeEngine configuration

- Create a shared CE module (e.g. [`src/computeEngine.ts`](src/computeEngine.ts)) that exports a configured `ce` instance.
- Update **all** parsing callsites to import it (at minimum [`src/App.tsx`](src/App.tsx) and [`src/testHelpers.ts`](src/testHelpers.ts)); confirm no stragglers so UI/tests/CLI parse identically.

### 2) Extend CE LaTeX dictionary for derivatives

Use the documented API on `ComputeEngine`:

- Base dictionary: `ComputeEngine.getLatexDictionary('all')`.
- Append custom `LatexDictionaryEntry` entries to `ce.latexDictionary`.

Implement two core entries:

- **`\\differentialD`**
- Map to a symbol name, e.g. `name: 'DifferentialD'`, with `parse: 'DifferentialD'`.
- If you provide a `serialize` handler, CE requires a `name`.
- **`\\dfrac`**
- Add a `kind: 'expression'` entry with `latexTrigger: '\\dfrac'` and a `parse(parser)` handler.
- Parse numerator/denominator groups via `parser.parseGroup()` (fallback to `parser.parseToken()` if needed).
- Detect the parsed shape `['Multiply', 'DifferentialD', expr]` (or a single `DifferentialD` applied to an expression) in both numerator and denominator; when both match, emit `['FractionDerivative', numExpr, denExpr]` where the second element is the numerator expression and the third is the denominator expression. Accept any expressions (identifiers or composites like `g(x)` / `x^2`).
- Otherwise fall back to `['Divide', num, den]`.
- **Constraint**: avoid adding a duplicate entry with `name: 'Divide'` (names must be unique even if triggers can be shared).

### 3) Rendering / tagging support

- Preferred: **ComputeEngine serialization** — add a dictionary entry for `name: 'FractionDerivative'` with a `serialize(serializer, expr)` implementation that prints `\\dfrac{\\mathrm{d}{num}}{\\mathrm{d}{den}}` from `['FractionDerivative', num, den]`.
- If CE serialization proves insufficient, add support in [`src/ExpressionTree.ts`](src/ExpressionTree.ts) to render `['FractionDerivative', num, den]` equivalently.
- Ensure node tagging remains intact for the derivative node and its children.

### 4) Tests

Add/extend tests to lock in behavior:

- Parse tests: derivative LaTeX with identifier and composite expressions (e.g. `\\dfrac{\\differentialD g(x)}{\\differentialD x^2}`) → `['FractionDerivative', <numExpr>, <denExpr>]`.
- Round-trip tests: `['FractionDerivative', num, den]` renders to `\\dfrac{\\mathrm{d}{num}}{\\mathrm{d}{den}}` (matches MathLive-style derivative).
- Fallback test: ordinary `\\dfrac{a}{b}` stays `['Divide', a, b]`.

## Files to touch

- [`src/computeEngine.ts`](src/computeEngine.ts) (new)
- [`src/App.tsx`](src/App.tsx)
- [`src/testHelpers.ts`](src/testHelpers.ts)
- [`src/ExpressionTree.ts`](src/ExpressionTree.ts) (if choosing ExpressionTree-side rendering)
- A new/updated test file (likely [`src/ExpressionTree.test.ts`](src/ExpressionTree.test.ts) or a dedicated derivative parsing test)

## Non-goals (for this plan)

- Algebraic semantics of derivatives beyond representing the fraction-derivative as a dedicated node.
- Supporting every derivative notation variant (only the MathLive `\\dfrac{\\differentialD ...}{\\differentialD ...}` form initially).