---
name: identity rewrites
overview: Add explicit, named identity rewrites for selected expressions, with a menu of applicable transforms and a default quick-apply action. Each identity can expose assumption/caveat text so useful textbook transforms are available without pretending they are universally valid.
todos:
  - id: identity-core
    content: Create identity rewrite registry with metadata, caveats, default priority, and initial hand-written AST rules.
    status: completed
  - id: selection-apply
    content: Add or extract selection replacement helpers so chosen identities apply to single and contiguous multi-selections.
    status: completed
  - id: identity-ui
    content: Wire EquationEditor and EquationToolbar with a default identity action plus an explicit menu of applicable identities.
    status: completed
  - id: tests
    content: Add unit tests for identity matching, selection application, caveat metadata, priority, and no-match behavior.
    status: completed
isProject: false
---

# Identity Rewrite Plan

## Approach

Implement identity rewrites as a new selection-local rewrite family alongside factor/distribute/cleanup, not as part of the drag pipeline. The core API should answer two questions for the current selection: which named identities apply, and what expression results when one is chosen.

Key files to extend:

- [v2/src/math/rewrite/identity.ts](v2/src/math/rewrite/identity.ts): new registry and matcher API.
- [v2/src/math/rewrite/autoRewrite.ts](v2/src/math/rewrite/autoRewrite.ts): reuse or extract selection replacement helpers so identity rewrites support single and contiguous multi-selection.
- [v2/src/EquationEditor.tsx](v2/src/EquationEditor.tsx): compute applicable identity options, wire a default quick apply, and clear selection after applying.
- [v2/src/EquationToolbar.tsx](v2/src/EquationToolbar.tsx): add an identity menu/dropdown button showing labels and caveats.
- [v2/src/math/rewrite/identity.test.ts](v2/src/math/rewrite/identity.test.ts): unit coverage for matching, output, priority, and caveat metadata.

## Rewrite Model

Define a small rule type with metadata and an imperative matcher:

```ts
type IdentityRewrite = {
  id: string;
  label: string;
  caveat?: string;
  defaultPriority: number;
  apply: (expr: Expr) => Expr | null;
};
```

Expose functions like:

- `getApplicableIdentityRewrites(expr): IdentityRewriteOption[]`
- `applyIdentityRewrite(expr, id): Expr | null`
- `applyDefaultIdentityRewrite(expr): Expr | null`

The first implementation should use hand-written AST matchers rather than a full pattern language. That matches the current style in [v2/src/math/rewrite/factor.ts](v2/src/math/rewrite/factor.ts) and keeps behavior obvious while the identity set is small.

## Initial Identity Set

Start with the examples from [v2/todo.md](v2/todo.md), each as a named rule:

- `ln a + ln b -> ln(a b)` with caveat: `a, b > 0`.
- `ln(a b) -> ln a + ln b` with caveat: `a, b > 0`.
- `exp(x + y) -> exp(x) exp(y)` with caveat: none for real/complex exponentials.
- `exp(x) exp(y) -> exp(x + y)` with caveat: none for real/complex exponentials.
- `(a^b)^c -> a^(b c)` with caveat: branch/domain-sensitive; generally safe for positive real `a`.
- `sin(pi/2 - theta) -> cos(theta)` with caveat: angle identity.
- `cos(theta) -> sin(pi/2 - theta)` as a lower-priority reverse option.

For matching sums/products, handle both direct `add`/`multiply` nodes and `display_group` wrappers where existing code commonly preserves parentheses. For commutative patterns like `ln a + ln b`, accept either term order only when the selected expression is exactly the matching two-term sum.

## UI Behavior

Add an Identity toolbar control with two paths:

- Clicking the main button applies the highest-priority applicable identity to the current selection.
- Opening the menu shows all applicable identities for the selection. Each item displays the rule label and, when present, a short caveat line.

If no identity applies, disable the control. This avoids “check every identity and surprise me” as the only behavior while still giving a fast default path.

## Implementation Notes

The current selection replacement logic is duplicated between [v2/src/math/rewrite/autoRewrite.ts](v2/src/math/rewrite/autoRewrite.ts) and [v2/src/math/rewrite/substitute.ts](v2/src/math/rewrite/substitute.ts). Before wiring identity rewrites, extract a focused helper such as `getExprForSelection` / `replaceSelectionWithExpr` into a small shared module, or add identity support to `autoRewrite.ts` if a minimal change is preferred.

Use existing constructors from [v2/src/math/ast/constructors.ts](v2/src/math/ast/constructors.ts), `cloneExpr`, and existing structural helpers from [v2/src/math/rewrite/algebraUtils.ts](v2/src/math/rewrite/algebraUtils.ts). Do not use Compute Engine for this first pass; it is better reserved for a later, broader symbolic rewrite feature.

## Validation

Add focused unit tests for each identity rule using parse/render round trips. Also add selection-level tests proving a rule can replace a single selected node and a contiguous multi-selection. Run:

```sh
npm run test:run -- src/math/rewrite/identity.test.ts src/math/rewrite/autoRewrite.test.ts
npm run lint
```

A later pass can add recorded mathtest fixtures once the menu interaction is settled.
