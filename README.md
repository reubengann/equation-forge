# Equation Forge

A Vite/React math derivation editor built around MathLive, a local math AST, and rewrite rules for algebraic manipulation.

## Packages

- `@equation-forge/core` contains the headless AST, LaTeX, SymPy,
  compilation, selection, and rewrite APIs.
- `@equation-forge/ui` contains the controlled React pad and document
  serialization helpers. React and ReactDOM are peer dependencies.

UI consumers should load the packaged styles and configure the MathLive font
directory supplied by their host:

```ts
import {
  EquationForge,
  configureEquationForgeEnvironment
} from '@equation-forge/ui';
import '@equation-forge/ui/style/index.css';

configureEquationForgeEnvironment({ fontsDirectory: '/path/to/mathlive/fonts' });
```

`EquationForge` does not choose a persistence backend. Its host owns the
equations and active document state through controlled props. The standalone
app uses browser storage; file-oriented hosts such as JupyterLab can use
`serializePadDocument` and `parseStoredPadState` with their own save lifecycle.
The `renderEquationActions` prop lets hosts add row-level actions without
placing host-specific data in `EquationRowState`.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build And Test

```bash
npm run build
npm run test:run
npm run mathtests
```

`npm run mathtests` replays the JSON interaction fixtures in `mathtests/fixtures`. Use `npm run gen_mathtests` after adding or removing fixtures to regenerate the Vitest fixture replay wrapper.

Playwright is configured with:

```bash
npm run test:e2e
```
