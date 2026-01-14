import { describe, expect, it } from "vitest";
import { applyMove, type MoveMode } from "./applyMove";
import { findNodeByLatex, treefromLatex } from "../testHelpers";

type IntegrationCase = {
  name: string;
  mode: MoveMode;
  inputLatex: string;
  targetSlot: number | null;
  select: (tree: ReturnType<typeof treefromLatex>) => string[];
  hover: (tree: ReturnType<typeof treefromLatex>) => string;
  expectedLatexPlain: string;
};

function normalizeLatex(latex: string): string {
  return latex.replace(/\s+/g, " ").trim();
}

const cases: IntegrationCase[] = [
  {
    name: "additive: move b from LHS to RHS zero => a = -b",
    mode: "additive",
    inputLatex: String.raw`a + b = 0`,
    targetSlot: 1,
    select: (tree) => [findNodeByLatex(tree, "b")],
    hover: (tree) => findNodeByLatex(tree, "0"),
    expectedLatexPlain: "a = -b",
  },
  {
    name: "multiplicative: move F across '=' to RHS root => 1 = (m a)/F",
    mode: "multiplicative",
    inputLatex: String.raw`F = m a`,
    targetSlot: null,
    select: (tree) => [findNodeByLatex(tree, "F")],
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS root");
      return rhsId;
    },
    expectedLatexPlain: String.raw`1 = \frac{m a}{F}`,
  },
  {
    name: "multiplicative: drop F into RHS product inserts reciprocal factor at end",
    mode: "multiplicative",
    inputLatex: String.raw`F = a b c`,
    targetSlot: 3,
    select: (tree) => [findNodeByLatex(tree, "F")],
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS product root");
      return rhsId;
    },
    expectedLatexPlain: String.raw`1 = a b c \frac{1}{F}`,
  },
  {
    name: "multiplicative: reorder inside product (move b to front)",
    mode: "multiplicative",
    inputLatex: String.raw`a b c`,
    targetSlot: 0,
    select: (tree) => [findNodeByLatex(tree, "b")],
    hover: (tree) => tree.rootId!,
    expectedLatexPlain: String.raw`b a c`,
  },
  {
    name: "multiplicative: cross-equal drop into product slot 0 inserts reciprocal up front",
    mode: "multiplicative",
    inputLatex: String.raw`F = a b`,
    targetSlot: 0,
    select: (tree) => [findNodeByLatex(tree, "F")],
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS product root");
      return rhsId;
    },
    expectedLatexPlain: String.raw`1 = \frac{1}{F} a b`,
  },
  {
    name: "multiplicative: move denominator product across '=' multiplies RHS",
    mode: "multiplicative",
    inputLatex: String.raw`\frac{x^2 + v_x}{m a} = 1`,
    targetSlot: null,
    select: (tree) => {
      // select the denominator product "m a"
      const divideId = tree.rootId!; // Equal root
      const lhsId = tree.childrenById[divideId]?.[0];
      if (!lhsId) throw new Error("Missing LHS");
      const denomId = tree.childrenById[lhsId]?.[1];
      if (!denomId) throw new Error("Missing denominator");
      return [denomId];
    },
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS");
      return rhsId;
    },
    expectedLatexPlain: String.raw`x^{2} + v_{x} = m a`,
  },
];

describe("move integration (table-driven)", () => {
  for (const c of cases) {
    it(c.name, () => {
      const tree = treefromLatex(c.inputLatex);
      const selectedIds = c.select(tree);
      const hoverId = c.hover(tree);

      const next = applyMove({
        tree,
        selectedIds,
        hoverId,
        targetSlot: c.targetSlot,
        mode: c.mode,
      });

      expect(next).not.toBeNull();
      expect(normalizeLatex(next!.latexPlain)).toBe(
        normalizeLatex(c.expectedLatexPlain)
      );
    });
  }
});
