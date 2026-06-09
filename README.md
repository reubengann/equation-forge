# Physics Derivation Pad

A Vite/React math derivation editor built around MathLive, a local math AST, and rewrite rules for algebraic manipulation.

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
