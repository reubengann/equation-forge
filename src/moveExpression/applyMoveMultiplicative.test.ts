import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { findNodeByLatex, treefromLatex } from "../testHelpers";

function runMove({
  latex,
  select,
  hover,
  targetSlot,
}: {
  latex: string;
  select: (tree: ReturnType<typeof treefromLatex>) => string[];
  hover: (tree: ReturnType<typeof treefromLatex>) => string;
  targetSlot: number | null;
}) {
  const tree = treefromLatex(latex);
  const selectedIds = select(tree);
  const hoverId = hover(tree);
  return applyMove({
    tree,
    selectedIds,
    hoverId,
    targetSlot,
    mode: "multiplicative",
  });
}

describe("applyMoveMultiplicative executor", () => {
  it("reorders factors within a product (a b c => b c a)", () => {
    const next = runMove({
      latex: String.raw`a b c`,
      select: (tree) => [findNodeByLatex(tree, "a")],
      hover: (tree) => tree.rootId!,
      targetSlot: 3, // move to end
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe("b c a");
  });
});
