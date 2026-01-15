---
name: Playwright guardrails
overview: Make Playwright run headless by default, remove app-side Playwright-only hooks, and refactor e2e drag tests into reusable helpers plus a declarative suite covering additive and multiplicative move permutations.
todos:
  - id: pw-headless-default
    content: Switch Playwright to headless-by-default with headed override.
    status: pending
  - id: remove-app-test-hooks
    content: Delete `window.__dp*` helpers and `__dpCenters*` publishing from App.tsx.
    status: pending
  - id: add-playwright-helpers
    content: Add test helper(s) to compute nodeIds via ExpressionTree and DOM drag coordinates via shadowRoot bounding boxes; replace waitForTimeout with deterministic waits.
    status: pending
  - id: refactor-existing-spec
    content: Refactor existing multiplicative spec to use helpers.
    status: pending
  - id: add-declarative-matrix
    content: Add table-driven e2e tests covering additive and multiplicative drag permutations supported today.
    status: pending
---

## Headless-by-default Playwright

- Update [`playwright.config.ts`](playwright.config.ts) to run **headless by default** (`use.headless: true`).
- Add an **opt-in headed override** (e.g. `HEADED=1` or `PWDEBUG=1`) so local debugging stays easy.
- Keep `trace: "on-first-retry"`.

## Remove Playwright-only code from the app

- In [`src/App.tsx`](src/App.tsx) remove:
- The window globals installed for tests (`__dpGetNodeCenter`, `__dpFindNodeIdByLatex`, `__dpGetRectForNodeId`, `__dpGetCenterByLatex`).
- The `renderTree()` “Publish test-only centers” block that assigns `window.__dpCenters`/`window.__dpCentersByLatex`.
- Keep **only** stable DOM affordances that are real UI (e.g. existing `data-testid`s like `latex-input`, `add-update`, `mode-*`, `math-display`, `info-text`).

## Move “find nodeId/coords” logic into Playwright helpers (no app hooks)

- Add a helper module (e.g. `tests/helpers/dragMathlive.ts`) that:
- **Computes deterministic nodeIds in Node** using the same pipeline as the app:
- `ce.parse(latex, { canonical: false }).json` → `ExpressionTree.create(json)`
- find node id by exact `NodeInfo.latex` match.
- **Computes screen coords in the browser** by querying MathLive’s open shadow root for `[data-node-id="..."]` and unioning bounding boxes (mirrors `queryElementsByNodeIds()` + `unionBoundingClientRects()` from [`src/mathliveShadow.ts`](src/mathliveShadow.ts)).
- Provides high-level actions:
- `setEquation(page, latex)`
- `setMoveMode(page, 'additive'|'multiplicative')`
- `dragByLatex(page, {equationLatex, fromLatex, toLatex, toBias})`
- `getRenderedLatex(page)` (parse `data-testid="info-text"` for the `LaTeX:` line)
- Replaces `waitForTimeout(500)` with a **deterministic render wait**, e.g. wait until `math-div.math-measure` (or `data-testid="math-display"`) has a shadowRoot containing at least one `[data-node-id]` and the specific source/target nodes produce a non-null bounding rect.

## Refactor existing multiplicative tests to use helpers

- Rewrite [`tests/multiplicative.drag.spec.ts`](tests/multiplicative.drag.spec.ts) to:
- Use the helper APIs.
- Eliminate duplicated `page.evaluate()` blocks.
- Keep the two existing scenarios as baseline coverage.

## Add declarative test matrix for supported moves

- Create a new spec (e.g. `tests/moves.drag.spec.ts`) with a table-driven set of cases.
- Cover **supported** permutations:
- **Additive**:
- Reorder within a sum (e.g. `a+b+c=d`) for multiple (fromTerm, targetPosition) pairs.
- Move term(s) across `=` into a singleton side root (wrap-into-add behavior), asserting sign flip.
- (Optional if stable) multi-term contiguous range drag using the UI’s shift-select, then drag the selection.
- **Multiplicative**:
- Cross-equal division/multiplication cases (factor moved across from numerator vs denominator).
- Reorder within a product container.
- Assertions:
- Primary: extracted `LaTeX:` line equals/contains expected normalized latex.
- Secondary: (optional) `info-args` contains expected mode.

## Stabilize & tighten flake guardrails

- Add small built-in retries only where needed (prefer deterministic waits over retries).
- Ensure each test starts from a clean page state (`page.goto('/')` + set equation).
