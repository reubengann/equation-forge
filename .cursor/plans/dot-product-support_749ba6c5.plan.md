---
name: dot-product-support
overview: Teach the parser/UI/move system to treat LaTeX \cdot as a dedicated DotProduct operator, eliminate redundant MathJSON Multiply usage (use InvisibleOperator for multiplication), and implement the requested dot-product commutativity + scalar-pullout semantics.
todos:
  - id: parse-dotproduct
    content: Add \cdot infix dictionary entry and normalization passes (remove Multiply, scalar-pullout for DotProduct) in computeEngine.ts.
    status: completed
  - id: render-dotproduct
    content: Add DotProduct rendering/tagging in ExpressionTree.ts; remove dependence on Multiply rendering.
    status: completed
  - id: moves-selection
    content: Update container detection & multiplicative move logic to support swapping DotProduct operands; remove Multiply from container lists.
    status: completed
  - id: tests
    content: Add/adjust unit tests for parsing, rendering, and updated expectations where Multiply was referenced.
    status: completed
---

## Target AST + invariants

- Introduce a **binary** dot-product node: `['DotProduct', left, right]`.
- Remove/avoid **`Multiply`** in our internal trees; use `['InvisibleOperator', ...factors]` for multiplication.
- Treat `DotProduct(...)` as a **scalar-valued** expression even if it contains vectors.

## Parsing / normalization

- Update [`c:\repos\physics-derivation-pad\src\computeEngine.ts`](c:\repos\physics-derivation-pad\src\computeEngine.ts)
- Add a custom `LatexDictionaryEntry` for `\cdot` as an **infix** operator that parses to `['DotProduct', lhs, rhs]` and serializes back as `lhs \\cdot rhs`.
- Ensure our entry wins over the base dictionary (either by ordering it before `baseDictionary` or filtering out the base `\cdot`/`Multiply` entry).
- Add a normalization pass in `parse()` that:
- Rewrites any remaining `['Multiply', ...]` into `['InvisibleOperator', ...]` (so Multiply disappears).
- Applies dot-product scalar rules:
- If either operand is a product like `['InvisibleOperator', ...factors]`, pull out **scalar-only factors** (factors that do **not** contain a `['Vector', ...]` subtree) to the outside:
  - Example: `DotProduct(Vector(a), InvisibleOperator(b, Vector(c)))` → `InvisibleOperator(b, DotProduct(Vector(a), Vector(c)))`.
- Support scalar factors on either side and combine them into a single surrounding `InvisibleOperator` when possible.

## Rendering / selection model

- Update [`c:\repos\physics-derivation-pad\src\ExpressionTree.ts`](c:\repos\physics-derivation-pad\src\ExpressionTree.ts)
- Add an `emitDotProduct()` handler so DotProduct renders with a centered dot (e.g. `A \,\\cdot\, B`) and tags operands for selection.
- Remove or deprecate `emitMultiply()` usage once Multiply is eliminated.

## Move + selection semantics

- Update container recognition to drop `Multiply` and add `DotProduct` where appropriate:
- [`c:\repos\physics-derivation-pad\src\domain\move\planMove.ts`](c:\repos\physics-derivation-pad\src\domain\move\planMove.ts)
- [`c:\repos\physics-derivation-pad\src\domain\move\moveSelectionPolicy.ts`](c:\repos\physics-derivation-pad\src\domain\move\moveSelectionPolicy.ts)
- [`c:\repos\physics-derivation-pad\src\moveExpression\applyMoveMultiplicative.ts`](c:\repos\physics-derivation-pad\src\moveExpression\applyMoveMultiplicative.ts)
- [`c:\repos\physics-derivation-pad\src\hooks\useSelection.ts`](c:\repos\physics-derivation-pad\src\hooks\useSelection.ts)
- [`c:\repos\physics-derivation-pad\src\selectionSemantics.ts`](c:\repos\physics-derivation-pad\src\selectionSemantics.ts)
- Implement dot-product commutativity for moves:
- In multiplicative mode, allow reordering `DotProduct`’s two operands (swap) using the same “container reorder” mechanics as products.
- Ensure dot products behave like scalars for existing rules:
- The existing “don’t divide by vectors across `=`” logic (which keys off `Vector` ancestry/siblings) should not block selecting/moving a `DotProduct` node.

## Tests to add/update

- Add parsing tests in [`c:\repos\physics-derivation-pad\src\computeEngine.test.ts`](c:\repos\physics-derivation-pad\src\computeEngine.test.ts)
- `\\vec{a} \\cdot \\vec{b}` parses to `['DotProduct', ['Vector','a'], ['Vector','b']]`.
- `\\vec{a} \\cdot b \\vec{c}` normalizes to scalar-pulled form: `['InvisibleOperator','b',['DotProduct',['Vector','a'],['Vector','c']]]`.
- Add rendering tests in [`c:\repos\physics-derivation-pad\src\ExpressionTree.test.ts`](c:\repos\physics-derivation-pad\src\ExpressionTree.test.ts)
- DotProduct renders with `\\cdot`.
- Remove/update the test asserting `Multiply` renders as implicit multiplication.
- Update expectations where tests currently allow `Multiply`:
- [`c:\repos\physics-derivation-pad\src\applyBothSides.test.ts`](c:\repos\physics-derivation-pad\src\applyBothSides.test.ts)
- [`c:\repos\physics-derivation-pad\src\movePath.test.ts`](c:\repos\physics-derivation-pad\src\movePath.test.ts)

## Rollout / compatibility

- Keep normalization tolerant: if older saved content still contains `Multiply`, it will be rewritten to `InvisibleOperator` on parse/refresh.
- If we later want richer dot-product typing, we can tighten the “scalar factor” heuristic (currently: ‘contains Vector subtree’).