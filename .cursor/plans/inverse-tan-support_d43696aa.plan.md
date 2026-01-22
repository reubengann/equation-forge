---
name: inverse-tan-support
overview: Add support for Compute Engine MathJSON `InverseFunction` nodes so LaTeX like `\tan^{-1} x` parses/renders without crashing, with unit tests verifying both parsing output and `ExpressionTree` rendering.
todos:
  - id: exprtree-inversefunction
    content: Add `InverseFunction` handling to `ExpressionTree.emit()` and implement `emitInverseFunction()` rendering (at least for `Tan`).
    status: completed
  - id: tests-inverse-tan
    content: Add unit tests in `computeEngine.test.ts` and `ExpressionTree.test.ts` covering `\tan^{-1} x`, then run Vitest to validate.
    status: completed
---

## Goal

Allow formulas like `\tan^{-1} x` to work end-to-end (parse → MathJSON → `ExpressionTree`) without throwing `InverseFunction is not a known type of array`.

## What’s happening today

- The Compute Engine represents inverse functions as MathJSON like `['InverseFunction', 'Tan']` (typically wrapped in an `Apply` for arguments).
- `ExpressionTree.emit()` throws on unknown array heads; it doesn’t currently handle `InverseFunction`.

Relevant code:

- [`src/ExpressionTree.ts`](src/ExpressionTree.ts): `emit()` dispatches many ops and then throws on unknown ops (currently hits `InverseFunction`).
- [`src/computeEngine.ts`](src/computeEngine.ts): `parse()` uses `ce.parse(...).json` and returns MathJSON to the UI/tests.

## Implementation plan

- Update [`src/ExpressionTree.ts`](src/ExpressionTree.ts)
- Add a new dispatch case in `emit()` for `op === 'InverseFunction'` before the final `throw`.
- Implement `emitInverseFunction(node, id, path, op)` that renders an inverse trig function token, e.g.:
- `['InverseFunction','Tan']` → `\tan^{-1}`
- (Optionally) also handle `Sin`/`Cos` similarly for completeness.
- Treat `InverseFunction` as an **atomic** node for selection (no tagging inside), similar to how `Differential`/`Partial` are treated.

## Unit tests

- Update [`src/computeEngine.test.ts`](src/computeEngine.test.ts)
- Add a test asserting `parse(String.raw`\tan^{-1} x`)` returns the expected MathJSON shape (likely `['Apply', ['InverseFunction','Tan'], 'x']`).
- Update [`src/ExpressionTree.test.ts`](src/ExpressionTree.test.ts)
- Add a test that `treefromLatex(String.raw`\tan^{-1} x`) `does not throw and renders to a reasonable LaTeX string (expected `\tan^{-1}\left(x\right)` if the CE uses `Apply`).

## Validation

- Run the unit tests (Vitest) and confirm the new tests pass, plus ensure no existing tests regress.

## Notes / assumptions

- We will follow the Compute Engine’s meaning of `\tan^{-1}x` as the inverse function (arctan), not `1/\tan(x)`.