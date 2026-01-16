import { describe, expect, it } from "vitest";
import { ExpressionTree } from "./ExpressionTree";
import { flipEquation, isFlippableEquation } from "./flipEquation";
import { makeMJfromLatex } from "./testHelpers";

describe("flipEquation", () => {
  it("flips a simple equation", () => {
    const mj = makeMJfromLatex("a + b = c");
    const flipped = flipEquation(mj);

    expect(flipped).not.toBeNull();
    const tree = ExpressionTree.create(flipped!);
    expect(tree.latexPlain).toBe("c = a + b");
  });

  it("returns null for non-equations", () => {
    const mj = makeMJfromLatex("a + b");
    expect(isFlippableEquation(mj)).toBe(false);
    expect(flipEquation(mj)).toBeNull();
  });

  it("returns null for chained equals", () => {
    const mj = makeMJfromLatex("a = b = c");
    expect(isFlippableEquation(mj)).toBe(false);
    expect(flipEquation(mj)).toBeNull();
  });
});
