---
name: PDP JupyterLab Integration
overview: "Integrate PDP in two tracks: first make its TypeScript AST/SymPy pipeline the conversion engine in jupyterlab-sympy-assistant, then package and expose the full pad through a separate Copier-generated, frontend-only JupyterLab extension with a main-area tab. Preserve existing user-facing contracts and deliver each phase independently testable."
todos:
  - id: stabilize-core
    content: Stabilize and compatibility-test PDP’s published parser/AST/SymPy core
    status: completed
  - id: migrate-assistant
    content: Move jupyterlab-sympy-assistant conversion to a contract-preserving frontend adapter
    status: completed
  - id: package-pdp-ui
    content: Publish a host-neutral PDP React UI surface with injectable assets and persistence
    status: completed
  - id: scaffold-plugin
    content: Create the separate Copier-based frontend extension and main-area widget
    status: completed
  - id: verify-rollout
    content: Add cross-project tests, workspace setup, and release documentation
    status: pending
isProject: false
---

# PDP JupyterLab Integration Plan

## Architecture decisions
- Run LaTeX → PDP `Expr` AST → SymPy-code conversion in the browser through `@physics-derivation-pad/core`; do not introduce a Node bridge into the Python server.
- Preserve the assistant's current conversion result contract (`sympy`, `symbols`, `symbols_line`, `code`) so its panel behavior and generated notebook cells remain stable.
- Create a separate frontend-only JupyterLab extension repository, provisionally `C:\repos\jupyterlab-physics-derivation-pad`, using the same JupyterLab Copier template family as the existing extensions.
- Open the full derivation pad as a main-area JupyterLab tab in the first plugin release.

## Phase 1 — Stabilize the PDP reusable core
- In [`C:\repos\physics-derivation-pad\src\math`](C:\repos\physics-derivation-pad\src\math), define and test the supported LaTeX → `Expr` → SymPy contract around `parseLatexToExpr` and `tryExprToSympy`.
- Remove the parser's dependency on rewrite internals (`unifiedLatexToExpr.ts` importing `rewrite/algebraUtils`) so the published core has a clean headless boundary.
- Add compatibility fixtures based on representative cases from [`C:\repos\jupyterlab-sympy-assistant\jupyterlab_sympy_assistant\tests\test_latex_parser.py`](C:\repos\jupyterlab-sympy-assistant\jupyterlab_sympy_assistant\tests\test_latex_parser.py), explicitly cataloging unsupported PDP AST kinds rather than silently changing output.
- Verify the package subpath exports in [`C:\repos\physics-derivation-pad\package.json`](C:\repos\physics-derivation-pad\package.json) and `tsconfig.core.json` can be consumed by another TypeScript project.

## Phase 2 — Replace the assistant parser in the frontend
- Add `@physics-derivation-pad/core` as a development/local dependency of [`C:\repos\jupyterlab-sympy-assistant\package.json`](C:\repos\jupyterlab-sympy-assistant\package.json), with a publishable version dependency as the end state.
- Introduce a small TypeScript adapter beside [`src\request.ts`](C:\repos\jupyterlab-sympy-assistant\src\request.ts) that parses complete equations with PDP, emits `spp`-namespaced SymPy code, discovers symbols deterministically, and returns the existing `ILatexConversion` shape from [`src\types.ts`](C:\repos\jupyterlab-sympy-assistant\src\types.ts).
- Switch `EquationLibraryPanel` conversion actions to the local adapter while leaving equation-library persistence APIs unchanged.
- Port the meaningful parser expectations from Python to Jest/TypeScript tests, and add UI-level tests for conversion failure and unsupported constructs.
- After parity is demonstrated, remove the obsolete `/convert-latex` handler, [`latex_parser.py`](C:\repos\jupyterlab-sympy-assistant\jupyterlab_sympy_assistant\latex_parser.py), its parser tests, and unnecessary Python SymPy/parser dependencies. Keep this cleanup as a distinct commit/change set so it can be deferred if compatibility gaps remain.

## Phase 3 — Package PDP’s reusable UI
- Create a supported UI export from [`C:\repos\physics-derivation-pad\src\index.ts`](C:\repos\physics-derivation-pad\src\index.ts) for `DerivationPad` and its required styles/assets, separate from the headless core exports.
- Replace standalone-app assumptions with injectable host concerns: MathLive font/asset URLs, storage/document loading, and lifecycle cleanup.
- Resolve React compatibility by making React/ReactDOM peer dependencies and testing against the JupyterLab-compatible React version; avoid bundling a second React runtime.
- Decide and expose the minimum persistence interface needed by a host while retaining browser local storage as the standalone app default.
- Add a package-consumer smoke test that mounts the exported pad outside the Vite app.

## Phase 4 — Scaffold the standalone JupyterLab plugin
- Generate `C:\repos\jupyterlab-physics-derivation-pad` from the JupyterLab extension Copier template as a `frontend` extension with tests; record `.copier-answers.yml` and use the known JupyterLab 4-compatible template line already used by the workspace projects.
- Depend on PDP’s headless core and UI package exports rather than copying source.
- Add a Lumino/React main-area widget, activation plugin, command, launcher entry, and palette entry; opening the command should create or reveal one derivation-pad tab.
- Wire JupyterLab disposal/restoration to the injected PDP document/storage interfaces and ensure MathLive CSS, fonts, tagged LaTeX, and shadow-DOM interactions work under JupyterLab.

## Phase 5 — Integration and rollout
- Add unit tests for plugin activation/widget lifecycle and Galata coverage for opening the tab, entering LaTeX, rendering, and performing one rewrite.
- Validate all three layers independently: PDP core/UI checks, assistant frontend and Python tests, and plugin build/UI tests.
- Add the new editable extension install to [`C:\Users\Reuben\Dropbox\theory_of_stuff\setup.ps1`](C:\Users\Reuben\Dropbox\theory_of_stuff\setup.ps1) and document local linked-package development plus release/version ordering.
- Roll out in dependency order: PDP package release/link → assistant migration → plugin package, with phase boundaries kept releasable and reversible.

## Phase gates
- Phase 1 exits only when the assistant compatibility fixture set has explicit pass/unsupported results.
- Phase 2 exits only when generated notebook code retains the current `ILatexConversion` behavior for supported inputs.
- Phase 3 exits only when the pad mounts as a consumer without relying on `App.tsx` or Vite globals.
- Phase 4 exits only when JupyterLab can create, restore, and dispose the main-area pad cleanly.