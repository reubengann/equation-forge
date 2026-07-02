import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatRewriteFuzzFailure,
  rewriteFuzzCaseArbitrary,
  runRewriteFuzzCase,
} from "./rewriteFuzz";

describe("rewrite fuzz properties", () => {
  it("preserves rewrite invariants for accepted generated moves", () => {
    let checkedMoves = 0;
    let skippedCases = 0;

    fc.assert(
      fc.property(rewriteFuzzCaseArbitrary, (testCase) => {
        const result = runRewriteFuzzCase(testCase);
        checkedMoves += result.checkedMoves;
        if (result.skipped) skippedCases += 1;

        expect(result.failure ? formatRewriteFuzzFailure(result.failure) : null).toBeNull();
      }),
      {
        seed: 20260702,
        numRuns: 40,
      },
    );

    expect(checkedMoves).toBeGreaterThan(0);
    expect(skippedCases).toBeLessThan(40);
  });
});
