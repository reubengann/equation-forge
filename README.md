# Physics Derivation Pad

An interactive React/TypeScript playground for experimenting with math expression selection, intent planning (`planMove`), and drag/drop visualization using MathLive + CortexJS.

## Prerequisites

- Node.js 18+
- npm (bundled with Node)

## Install

```bash
npm install
```

## Run (development)

```bash
npm start
```

This launches the dev server (Vite/CRA) and opens the app in your browser.

## Build (optional)

```bash
npm run build
```

Produces a production build in `dist`/`build` depending on the tooling config.

## Notes

- Drag a term in the rendered math to see intent text and the insert marker line.
- Backtick toggles debug boxes; lower textarea shows planner output.
