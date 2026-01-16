import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { findNodeByLatex, findNodeId, treefromLatex } from "../testHelpers";

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

  it("moves denominator m a across '=' to RHS", () => {
    const next = runMove({
      latex: String.raw`\frac{x^{2} + v_{x}}{m a} = 1`,
      select: (tree) => {
        const denomId = findNodeId(
          tree,
          (n) =>
            n.op === "InvisibleOperator" &&
            n.latex.includes("m") &&
            n.latex.includes("a")
        );
        return [denomId];
      },
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`x^{2} + v_{x} = m a`
    );
  });

  it("moves multiplicative factor across '=' without leaving 1 on RHS", () => {
    const next = runMove({
      latex: String.raw`\vec{F} = m \vec{a}`,
      select: (tree) => [findNodeByLatex(tree, "m")],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: null, // whole division
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{\vec{F}}{m} = \vec{a}`
    );
  });

  describe("three outcomes for cross-equal multiplicative moves", () => {
    it("divides whole expression when targetSlot is null", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: null, // whole division
      });

      expect(next).not.toBeNull();
      expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
        String.raw`\frac{x^{2} + v_{x}}{m} = a`
      );
    });

    it("inserts reciprocal before expression when targetSlot is 0", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: 0, // left edge insertion
      });

      expect(next).not.toBeNull();
      const result = next!.latexPlain.replace(/\s+/g, " ").trim();
      // Should be \frac{1}{m}(x^{2} + v_{x}) = a or similar
      expect(result).toContain("\\frac{1}{m}");
      expect(result).toContain("x^{2} + v_{x}");
      expect(result).toContain("= a");
    });

    it("inserts reciprocal after expression when targetSlot is 1", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: 1, // right edge insertion
      });

      expect(next).not.toBeNull();
      const result = next!.latexPlain.replace(/\s+/g, " ").trim();
      // Should be (x^{2} + v_{x})\frac{1}{m} = a or similar
      expect(result).toContain("\\frac{1}{m}");
      expect(result).toContain("x^{2} + v_{x}");
      expect(result).toContain("= a");
      // The reciprocal should come after the expression
      const fracIndex = result.indexOf("\\frac{1}{m}");
      const exprIndex = result.indexOf("x^{2}");
      expect(fracIndex).toBeGreaterThan(exprIndex);
    });
  });
});
