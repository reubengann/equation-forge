---
name: Cortex CE Integration
overview: Add a v2 “evaluate selected expression with Cortex Compute Engine” action by translating selected internal AST nodes to Compute Engine MathJSON, running a guarded CE evaluation pipeline, translating valid results back into the existing Expr tree, and replacing the selection through the existing rewrite path.
todos:
  - id: adapter-to-mathjson
    content: Add a typed Expr-to-MathJSON adapter with symbol substitution and unsupported-node reporting.
    status: pending
  - id: ce-rewrite
    content: Implement a guarded selected-expression Compute Engine evaluate rewrite using existing selection extraction/replacement APIs.
    status: pending
  - id: ui-action
    content: Wire the rewrite into EquationEditor and EquationToolbar as an Evaluate selection action.
    status: pending
  - id: focused-tests
    content: Add adapter and rewrite tests for arithmetic, derivatives, guarded definite integrals, and unsupported special-font expressions.
    status: pending
isProject: false
---

# Cortex Compute Engine Integration

## Scope

- Add a new selected-expression Evaluate rewrite alongside the existing automatic rewrites in [v2/src/math/rewrite/autoRewrite.ts](v2/src/math/rewrite/autoRewrite.ts), wired through [v2/src/EquationEditor.tsx](v2/src/EquationEditor.tsx) and [v2/src/EquationToolbar.tsx](v2/src/EquationToolbar.tsx).
- Use the existing selection replacement APIs in [v2/src/math/rewrite/selectionRewrite.ts](v2/src/math/rewrite/selectionRewrite.ts), so single-node and contiguous add/multiply multi-selections keep the current wrapping behavior.
- Keep this as a user-triggered action only: no automatic CE pass during parse/render, and no change to the canonical internal representation.

## Translation Layer

- Add `toMathJson` beside the existing one-way adapter:
  - [v2/src/math/adapters/mathjson/toMathJson.ts](v2/src/math/adapters/mathjson/toMathJson.ts)
  - [v2/src/math/adapters/mathjson/index.ts](v2/src/math/adapters/mathjson/index.ts)
- Start with CE-safe mappings for the core nodes already supported by `fromMathJson`: numbers, symbols, add, multiply, power, negate, divide, equation/display groups, and normal function calls.
- Extend both directions for the target CE use cases:
  - `integral` plus `differential` using `findIntegralDifferentialVariable` from [v2/src/math/ast/integralDifferential.ts](v2/src/math/ast/integralDifferential.ts).
  - `partial_derivative`, `full_derivative_operator`, and `partial_derivative_operator` as CE derivative forms where the variable is representable.
  - common functions currently parsed in [v2/src/math/adapters/latex/unifiedLatexToExpr.ts](v2/src/math/adapters/latex/unifiedLatexToExpr.ts): `sin`, `cos`, `tan`, `log`, `ln`, `exp`.
- For unsupported internal forms, return a structured “not translatable” result instead of throwing. This covers `special_font` (`\mathscr{H}`), vectors/hats/dots/inner products, limits, big sums/products, immutable expressions, invalid input, and physics-specific derivative forms that CE cannot round-trip yet.

## Symbol Substitution

- Add a small symbol-sanitization pass inside the CE adapter/rewrite module:
  - Convert internal symbols that CE may parse oddly, such as `x_0`, Greek macro names, or fonted symbols, to generated CE-safe symbols like `__pdp0`.
  - Keep a bidirectional map so CE results can be translated back to the original v2 symbols.
- Treat `special_font` conservatively at first: either mark it unsupported, or map a single fonted symbol to a generated symbol and restore it only when CE returns that symbol unchanged. Do not try to make CE understand `\mathscr{H}` semantically in the first pass.

## CE Rewrite Operation

- Add a new module such as [v2/src/math/rewrite/computeEngine.ts](v2/src/math/rewrite/computeEngine.ts) with:
  - `canEvaluateWithComputeEngine(document, selection)` based on selection presence and translatability.
  - `evaluateSelectionWithComputeEngine(document, selection)` that extracts the selected Expr, builds one or more guarded evaluate candidates, converts the first valid changed result back with `fromMathJson`, optionally applies local `cleanupExpr`, and replaces the selection.
- Use CE `evaluate()` as the only first-pass engine operation. Do not expose or depend on CE `simplify`, `expand`, or `factor` for the first integration; the current observed matrix shows those are either redundant with evaluate or too narrow/no-op for our target workflows.
- Add a targeted definite-integral guard before direct evaluation:
  - Traverse the selected `Expr` and find `integral` nodes with both lower and upper bounds.
  - For each definite integral where `findIntegralDifferentialVariable` can identify a variable, ask CE only for the indefinite antiderivative of the integrand.
  - Substitute upper and lower bounds ourselves in the v2 AST, rebuild `F(upper) - F(lower)`, and reinsert that result into the selected expression before any broader cleanup/evaluation.
  - Reject the candidate if CE returns an error node, an untranslatable MathJSON form, or output equivalent to the original expression.
- For direct CE evaluation candidates, only accept a result if it translates back to a valid v2 `Expr`, contains no CE error marker, and is not structurally identical to the input.
- Return explicit failure reasons for UI/debugging, but keep the first UI pass simple: disabled button when not translatable; no modal unless a failure message proves necessary.

## UI Wiring

- Add a toolbar button in the existing “Automatic rewrites” group in [v2/src/EquationToolbar.tsx](v2/src/EquationToolbar.tsx), probably labelled “Evaluate selection” with a material icon such as `calculate`.
- In [v2/src/EquationEditor.tsx](v2/src/EquationEditor.tsx):
  - Derive `canEvaluateWithComputeEngine` from the current `compiledDoc` and `selection`.
  - Add `onEvaluateWithComputeEngineRequested`, mirroring `onCleanupRequested` and `onFactorRequested`.
  - Clear selection and call `onCanonicalLatexChanged(exprToLatex(nextExpr, false))` on success.
  - Optionally add a keyboard shortcut only after confirming it does not collide with existing shortcuts (`F`, `D`, `C`, `S`, `A`).

## Tests

- Unit-test `toMathJson` and new `fromMathJson` mappings in [v2/src/math/adapters/mathjson](v2/src/math/adapters/mathjson).
- Unit-test the CE rewrite module with focused cases:
  - simple numeric cleanup/evaluation, such as `2+2`.
  - cancellation/evaluation, such as `\frac{x x}{x}` if CE evaluate handles it usefully.
  - derivative, such as `\frac{d}{dx} x^2` or the project’s parsed derivative operator shape.
  - indefinite integral with explicit differential, such as `\int x\,\mathrm{d}x`.
  - symbolic definite integral inside a larger expression, such as `2 \int_a^b \sin x\,\mathrm{d}x`, proving we traverse, compute the antiderivative, substitute bounds ourselves, and do not insert CE `\error`/black-square output.
  - numeric definite integral behavior, including a case like `\int_1^2 \frac{1}{x}\,\mathrm{d}x`, with an explicit expectation about whether decimals are accepted or rejected.
  - unsupported `\mathscr{H}` remains disabled or fails cleanly without corrupting the expression.
- Add a UI-level/mathtest fixture only after the adapter behavior is stable, using the existing selection replay framework under [v2/mathtests/fixtures](v2/mathtests/fixtures).

## Risks And Guardrails

- CE may canonicalize output in ways that lose v2 presentation details. The first implementation should prefer correctness over preserving every visual marker, and only accept outputs the adapter can represent.
- CE direct evaluation of symbolic definite integrals can produce `EvaluateAt`/error-marker output instead of substituting symbolic bounds correctly. Symbolic definite integrals must use the antiderivative-and-v2-substitution candidate path rather than direct CE evaluation.
- Integrals and derivatives depend on CE’s expected MathJSON heads, so adapter tests should lock down the exact heads before UI wiring.
- Do not route the whole equation through CE by default. Evaluate only the selected expression to limit surprises and avoid changing unrelated formatting.
