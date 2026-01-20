---
name: DotProduct scalar moves debug+refactor
overview: Diagnose why the dot-product scalar drag produces no change in e2e (hover/plan/apply mismatch), then refactor the move pipeline to make failures observable and add targeted regression tests for scalar factors in dot products.
todos:
  - id: repro-playwright-failure
    content: Run the specific failing Playwright test and collect error context + debug telemetry (info-args / plan / hover).
    status: completed
  - id: robust-hover-fallback
    content: Add hover fallback when dropping in whitespace (closest-node/closest-side-root) and use it during drag + pointer-up.
    status: completed
  - id: telemetry-improvements
    content: Persist drag diagnostics even when planMove returns null, so e2e artifacts show root cause.
    status: completed
  - id: dotproduct-scalar-lift
    content: Implement multiplicative move support for lifting scalar factors out of dot-product operands.
    status: completed
  - id: add-regression-tests
    content: Add unit + e2e tests covering whitespace-drop and dot-product scalar lift; ensure they’re resilient.
    status: completed
---

### What we know from the failure

- The failing e2e drag finishes with **no change** in rendered LaTeX:
- Expected: `\frac{1}{m} (\vec{e}_x\cdot\vec{F}_g)=\vec{e}_x\cdot\ddot{\vec{r}}` (or equivalent)
- Observed: unchanged equation.
- This strongly suggests **the pointer-up applied no move** (either because the final hover/plan was null or `applyMoveMultiplicative()` rejected).
- The UI drag pipeline is `ExpressionPad.onPointerDown` → `useDragMove.handlePointerMove` (updates `lastPlanRef`) → `useDragMove.handlePointerUp` (applies `applyMove`). See [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx) and [`src/hooks/useDragMove.ts`](c:/repos/physics-derivation-pad/src/hooks/useDragMove.ts).

### Likely root cause (based on code flow)

- Hover detection during drag uses `hitTestNodeIdInMathliveShadow()`, which only returns a node when the pointer is **inside** a `[data-node-id]` element’s bounding rect. See [`src/infra/mathlive/mathliveShadow.ts`](c:/repos/physics-derivation-pad/src/infra/mathlive/mathliveShadow.ts).
- The failing test intentionally biases the drop **left of** the target (`toBias: { dx: -40 }`). That makes it very plausible the final pointer-up is in **whitespace**, yielding `hoverId = null`.
- When `hoverId` is null, `planMove()` returns null immediately (`if (!hoverId) return null;`). Then pointer-up either can’t recompute a plan (same issue) or applies nothing, leaving LaTeX unchanged.

### Scalar multiples inside dot products are a separate, real missing feature

- Your example `\vec{a}\cdot m\vec{b} → m\vec{a}\cdot\vec{b}` requires **lifting a scalar factor out of a dot-product operand** (a scalar-commutativity/bilinearity transform), not just reordering factors inside a single product.
- Today, multiplicative moves handle:
- cross-`=` division/multiplication
- reordering within a product (`InvisibleOperator`)
- swapping dot operands only when the moved node is a **direct child of `DotProduct`**
- but there is no explicit “lift scalar out of dot operand” move.

### Execution plan once you accept (includes actually running the failing test)

- **Reproduce and capture full drag telemetry**
- Run only the failing Playwright spec/test so we can capture stable output and artifacts.
- Ensure we capture:
- final `info-args`
- `dragStartInfo`, `dragHoverInfo`, and `movePlanText`
- whether `lastPlanRef` is null at pointer-up
- **Make hover/plan computation robust when dropping in whitespace**
- Implement a “nearest-node” / “nearest-side-root” fallback when `hitTestNodeIdInMathliveShadow()` returns null during an active drag.
- Approach:
- Add a helper in [`src/infra/mathlive/mathliveShadow.ts`](c:/repos/physics-derivation-pad/src/infra/mathlive/mathliveShadow.ts) like `hitTestOrClosestNodeId(...)` that:
- first tries current hit-test
- if null, chooses the closest node rect (or closest side root under the nearest `Equal`) within a tolerance
- Use it in [`src/hooks/useDragMove.ts`](c:/repos/physics-derivation-pad/src/hooks/useDragMove.ts) for hover while dragging and at pointer-up recompute.
- Goal: dropping slightly outside the glyph still produces a stable `MoveAcrossEqual` plan.
- **Improve observability so this never becomes “mysterious” again**
- Update [`src/ui/components/ExpressionPad.tsx`](c:/repos/physics-derivation-pad/src/ui/components/ExpressionPad.tsx) to always write debug state on pointer-move while dragging (even when `plan` is null), e.g. include:
- raw `hoverId`, computed fallback hover, selected IDs
- whether plan was null and why (e.g. `hoverId=null`)
- This ensures e2e failures have actionable state without re-running locally.
- **Add first-class support for scalar-factor moves in dot products**
- Extend multiplicative planning + applying to support:
- `DotProduct(A, InvisibleOperator(m, B)) ↔ InvisibleOperator(m, DotProduct(A, B))`
- and similarly for the left operand.
- Likely implementation points:
- planning: [`src/domain/move/planMove.ts`](c:/repos/physics-derivation-pad/src/domain/move/planMove.ts)
- execution: [`src/moveExpression/applyMoveMultiplicative.ts`](c:/repos/physics-derivation-pad/src/moveExpression/applyMoveMultiplicative.ts)
- Include safety rules:
- only lift factors that are not vectors (`hasVectorAncestor` checks)
- don’t change semantics if both operands are vectors and the factor is not provably scalar (use current vector-detection heuristic).
- **Close the testing gap (unit + e2e)**
- Add unit tests that:
- cover the whitespace-drop hover fallback (plan should still be non-null)
- cover scalar lift-in/out for dot products
- Add/adjust e2e tests:
- keep the existing failing one but remove reliance on fragile pixel bias
- add a new e2e for `\vec{a}\cdot m\vec{b}` drag that asserts the scalar can be lifted out.

### Result

- The existing failing drag becomes stable because hover/plan is robust.
- Scalar multiples inside dot products become movable via an explicit supported move.
- When future cases fail, the debug panel artifacts will explain *why* (hover missing, plan null, apply rejected, etc.).