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

## Goal (next major feature)

Support MathLive derivative LaTeX round-tripping with CortexJS ComputeEngine:

- Accept MathLive-emitted derivative LaTeX like `\\dfrac{\\differentialD f}{\\differentialD x}`.
- Parse into a stable MathJSON node such as `['FractionDerivative', 'f', 'x']`.
- Render back to the same MathLive-style LaTeX.

## Plan

### 1) Centralize ComputeEngine configuration

- Create a shared CE module (e.g. [`src/computeEngine.ts`](src/computeEngine.ts)) that exports a configured `ce` instance.
- Update parsing callsites to import it (at minimum [`src/App.tsx`](src/App.tsx) and [`src/testHelpers.ts`](src/testHelpers.ts)), so tests and UI parse identically.

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
- Detect the pattern `\\dfrac{\\differentialD f}{\\differentialD x}` and emit `['FractionDerivative', f, x]`.
- Otherwise fall back to `['Divide', num, den]`.
- **Constraint**: avoid adding a duplicate entry with `name: 'Divide'` (names must be unique even if triggers can be shared).

### 3) Rendering / tagging support

Choose one of:

- **ComputeEngine serialization**: Add a dictionary entry for `name: 'FractionDerivative'` with a `serialize(serializer, expr)` implementation that prints `\\dfrac{\\differentialD ...}{\\differentialD ...}`.
- **ExpressionTree rendering**: Add support in [`src/ExpressionTree.ts`](src/ExpressionTree.ts) to render `['FractionDerivative', f, x]` and ensure node tagging works for the derivative node and its children.

### 4) Tests

Add/extend tests to lock in behavior:

- Parse test: input derivative LaTeX → expected MathJSON shape.
- Round-trip test: the resulting `ExpressionTree` renders back to MathLive-style derivative LaTeX.

## Files to touch

- [`src/computeEngine.ts`](src/computeEngine.ts) (new)
- [`src/App.tsx`](src/App.tsx)
- [`src/testHelpers.ts`](src/testHelpers.ts)
- [`src/ExpressionTree.ts`](src/ExpressionTree.ts) (if choosing ExpressionTree-side rendering)
- A new/updated test file (likely [`src/ExpressionTree.test.ts`](src/ExpressionTree.test.ts) or a dedicated derivative parsing test)

## Non-goals (for this plan)

- Algebraic semantics of derivatives beyond representing the fraction-derivative as a dedicated node.
- Supporting every derivative notation variant (only the MathLive `\\dfrac{\\differentialD ...}{\\differentialD ...}` form initially).
