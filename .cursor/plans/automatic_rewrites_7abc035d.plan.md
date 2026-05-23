---
name: automatic rewrites
overview: Add selection-guided automatic rewrites for factor, distribute, clean up, evaluate, and toggle-negate using the existing AST/selection/editor patterns, with Compute Engine exposed only as an explicit best-effort CAS action later.
todos:
  - id: core-api
    content: Create auto rewrite command API and AST helper utilities.
    status: pending
  - id: factor-distribute
    content: Implement selection-guided common factoring, simple perfect-square factoring, and distribution.
    status: pending
  - id: cleanup-evaluate-toggle
    content: Implement AST-native clean up, numeric evaluate, and toggle-negate.
    status: pending
  - id: ui-wire
    content: Add toolbar actions and connect them to EquationEditor selection state.
    status: pending
  - id: tests
    content: Add focused unit tests and run the relevant v2 test/lint checks.
    status: pending
isProject: false
---

# Automatic Rewrite Plan

## Definitions

- **Factor**: selection-guided structural factoring. If the selected node is an additive expression, extract a common multiplicative factor from every selected term, e.g. `a b + c b -> b \left(a + c\right)`. If a single factor inside the selected sum is also selected or implied by all terms, prefer that factor. Include exact simple perfect-square trinomials, e.g. `a^2 + 2 a b + b^2 -> \left(a + b\right)^2`, only when the match is unambiguous.
- **Clean Up**: local AST-native algebraic cleanup that preserves symbolic form and user notation. It covers cancellation, identities, numeric coefficient folding, and exact like-term collection, e.g. `\frac{a b}{c b} -> \frac{a}{c}`, `x/1 -> x`, `1 x -> x`, `0 + x -> x`, `x + 2 x -> 3 x`. This replaces a broad **Simplify** command for first pass.
- **Evaluate**: compute concrete numeric values in our AST, e.g. `10 + 5 -> 15`, `2^3 -> 8`, numeric fractions/products. First pass does not evaluate symbolic/calculus expressions such as integrals.
- **Distribute**: selection-guided expansion over additive children, e.g. `b \left(a + c\right) -> a b + c b`. First pass supports one product containing one additive/display-group additive factor.
- **Toggle Negate**: local sign rewrite for selected terms/additive forms that preserves term order. For a subtraction-like sum, toggle each term's sign in place, e.g. `a - b -> -\left(-a + b\right)`. If the user wants `b - a`, they can reorder terms with the existing drag move behavior. It should be its own command, not overloaded onto factor, because it is a sign/orientation toggle rather than common-factor discovery.
- **Try CAS**: later, an explicit best-effort action that sends the selected expression to Compute Engine and shows/applies whatever comes back if it can be parsed. This is intentionally separate from Clean Up/Evaluate because CE can fail or produce awkward output for notation like `\mathscr{H}`.

## Implementation Approach

- Add a new automatic rewrite module under `[v2/src/math/rewrite/autoRewrite.ts](v2/src/math/rewrite/autoRewrite.ts)` with a command API similar to `[v2/src/math/rewrite/substitute.ts](v2/src/math/rewrite/substitute.ts)`:
  - `type AutoRewriteKind = "factor" | "cleanup" | "evaluate" | "distribute" | "toggleNegate"`
  - `canAutoRewrite(document, selection, kind)`
  - `autoRewriteSelection(document, selection, kind): Expr | null`
- Reuse `[v2/src/math/compile/compileMathDocument.ts](v2/src/math/compile/compileMathDocument.ts)` indexes and `[v2/src/math/ast/utils.ts](v2/src/math/ast/utils.ts)` replacement helpers so rewrites apply to the selected subexpression and preserve the rest of the equation.
- Add small reusable AST helpers in a new file such as `[v2/src/math/rewrite/algebraUtils.ts](v2/src/math/rewrite/algebraUtils.ts)`:
  - unwrap parenthesized `display_group` where needed
  - flatten/collapse add and multiply nodes
  - structural expression equality via canonical serialization
  - split terms into coefficient/factors for factoring and like-term collection
  - wrap additive results in `displayGroup("paren", ...)` inside products/powers where needed
- Keep Compute Engine out of factor/distribute/toggle-negate/cleanup/evaluate in the first pass. A future **Try CAS** action should have its own guarded adapter, user-facing failure handling, and tests because the repo currently has only `fromMathJson` and no safe `Expr -> MathJSON -> Expr` round trip.
- Extend `[v2/src/EquationToolbar.tsx](v2/src/EquationToolbar.tsx)` with a rewrite action group and wire it in `[v2/src/EquationEditor.tsx](v2/src/EquationEditor.tsx)`, following the existing `flipRelation` and `substituteSelection` flows.

## First-Pass Rule Boundaries

- Factor common factors only across selected contiguous sum terms or a selected add node. Handle products, symbols, powers, numeric coefficients, and negated/subtraction terms conservatively.
- Perfect-square factoring supports exact two-symbol/term cases with coefficient `2`, equivalent factor order, and exponent `2`; skip ambiguous or higher-degree polynomial factoring.
- Clean Up cancellation supports common multiplicative factors between numerator and denominator. It should not reorder large expressions except as needed for matching.
- Clean Up combines exact like terms with simple numeric coefficients, e.g. `x + 2 x -> 3 x`, `a b + 2 a b -> 3 a b`, `x - x -> 0`.
- Evaluate initially handles fully numeric `add`, `multiply`, `divide`, `power`, and `negate`; it avoids symbolic/calculus evaluation.
- Distribute preserves factor order as much as possible: selected product factors before/after the additive factor remain before/after each distributed term.
- Toggle negate supports selected terms and two-term add/subtraction forms first. It flips signs in place and never reorders terms.
- Try CAS is out of scope for this first pass, but the API and UI wording should leave room for it as a separate, explicitly best-effort action.

## Tests

- Add focused unit tests in `[v2/src/math/rewrite/autoRewrite.test.ts](v2/src/math/rewrite/autoRewrite.test.ts)` using the same parse/compile/`exprToLatex` style as `[v2/src/math/rewrite/substitute.test.ts](v2/src/math/rewrite/substitute.test.ts)`.
- Cover positive and negative cases for each command: common factor, perfect square, cancellation, like-term cleanup, numeric evaluation, distribute, toggle negate, unsupported selection returns null.
- Add toolbar/editor tests only if existing UI test coverage already exercises toolbar actions; otherwise keep this first pass at rewrite unit tests plus TypeScript/lint validation.

## Suggested Order

1. Build `algebraUtils` and `autoRewrite` command API with tests for selection replacement.
2. Implement factor and distribute first, since they are inverse structural rewrites.
3. Implement Clean Up cancellation, identity cleanup, and exact like-term collection.
4. Implement evaluate numeric arithmetic.
5. Implement toggle-negate.
6. Wire toolbar buttons and keyboard shortcuts after the core rewrite functions are stable.
