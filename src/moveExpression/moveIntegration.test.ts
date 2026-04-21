import { describe, expect, it } from "vitest";
import { applyMove, type MoveMode } from "./applyMove";
import { findNodeByLatex, findNodeId, treefromLatex } from "../testHelpers";

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

function isAncestorOrSelf(
  tree: ReturnType<typeof treefromLatex>,
  ancestorId: string,
  nodeId: string | null
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
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
    name: "multiplicative: factor 2 out of integral to the left",
    mode: "multiplicative",
    inputLatex: String.raw`v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`,
    targetSlot: 0,
    select: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      const integrandId = rhsId ? tree.childrenById[rhsId]?.[0] : null;
      const twoId = findNodeId(
        tree,
        (n) =>
          n.latex === "2" &&
          integrandId !== null &&
          tree.parentById[n.id] !== undefined &&
          tree.parentById[n.id] !== null &&
          (() => {
            const parentId = tree.parentById[n.id] as string;
            const parentOp = tree.nodesById[parentId]?.op;
            if (!parentOp) return false;
            if (!["InvisibleOperator", "Multiply"].includes(parentOp)) return false;
            return isAncestorOrSelf(tree, integrandId, parentId);
          })()
      );
      return [twoId];
    },
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS integrate");
      return rhsId;
    },
    expectedLatexPlain: String.raw`v_{0}^{2} = 2 \int_{0}^{x_{0}} g \sin\left(\theta\right) \,\mathrm{d}{x}`,
  },
  {
    name: "multiplicative: factor 2 out of integral to the right",
    mode: "multiplicative",
    inputLatex: String.raw`v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`,
    targetSlot: 1,
    select: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      const integrandId = rhsId ? tree.childrenById[rhsId]?.[0] : null;
      const twoId = findNodeId(
        tree,
        (n) =>
          n.latex === "2" &&
          integrandId !== null &&
          tree.parentById[n.id] !== undefined &&
          tree.parentById[n.id] !== null &&
          (() => {
            const parentId = tree.parentById[n.id] as string;
            const parentOp = tree.nodesById[parentId]?.op;
            if (!parentOp) return false;
            if (!["InvisibleOperator", "Multiply"].includes(parentOp)) return false;
            return isAncestorOrSelf(tree, integrandId, parentId);
          })()
      );
      return [twoId];
    },
    hover: (tree) => {
      const eqId = tree.rootId!;
      const rhsId = tree.childrenById[eqId]?.[1];
      if (!rhsId) throw new Error("Missing RHS integrate");
      return rhsId;
    },
    expectedLatexPlain: String.raw`v_{0}^{2} = \int_{0}^{x_{0}} g \sin\left(\theta\right) \,\mathrm{d}{x} 2`,
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

it("multiplicative: moves kappa v out of integral together (issue 139)", () => {
  const tree = treefromLatex(
    String.raw`v = v_{0} + \beta v \int_{T_{0}}^{T} \,\mathrm{d}{T} - \int_{P_{0}}^{P} \kappa v \,\mathrm{d}{P}`
  );
  const integrateId = findNodeId(
    tree,
    (n) => n.op === "Integrate" && n.latex.includes(String.raw`P_{0}`)
  );
  expect(integrateId).toBeTruthy();
  if (!integrateId) return;

  const integrandId = tree.childrenById[integrateId]?.[0];
  expect(integrandId).toBeTruthy();
  if (!integrandId) return;

  const integrandFactors = tree.childrenById[integrandId] ?? [];
  const kappaId = integrandFactors.find(
    (id) => tree.nodesById[id]?.latex === String.raw`\kappa`
  );
  const vId = integrandFactors.find((id) => tree.nodesById[id]?.latex === "v");
  expect(kappaId).toBeTruthy();
  expect(vId).toBeTruthy();
  if (!kappaId || !vId) return;

  const next = applyMove({
    tree,
    selectedIds: [kappaId, vId],
    hoverId: integrateId,
    targetSlot: 0,
    mode: "multiplicative",
  });

  expect(next).not.toBeNull();
  expect(normalizeLatex(next!.latexPlain)).toBe(
    normalizeLatex(
      String.raw`v = v_{0} + \beta v \int_{T_{0}}^{T} \,\mathrm{d}{T} - \kappa v \int_{P_{0}}^{P} \,\mathrm{d}{P}`
    )
  );
});
