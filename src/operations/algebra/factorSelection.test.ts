import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import { canFactorSelection, factorSelection } from "./factorSelection";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("factorSelection", () => {
  it("factors a common multiplicative prefix out of a sum", () => {
    const tree = treefromLatex(String.raw`-\mu_{s} m g \cos\left(\theta\right) + m g \sin\left(\theta\right)`);
    const result = factorSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`m g \left(-\mu_{s} \cos\left(\theta\right) + \sin\left(\theta\right)\right)`
    );
  });

  it("factors common symbols out of a selected span within an Add", () => {
    const tree = treefromLatex(String.raw`a b + a c + d`);
    const addId = tree.rootId;
    const selection = { kind: "span", parentId: addId, op: "Add", start: 0, end: 1 } as const;
    const result = factorSelection(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a \left(b + c\right) + d`);
  });

  it("factors c from c d - c e inside larger sum", () => {
    const tree = treefromLatex(String.raw`\left(a + b + c d - c e\right) = f`);
    const addId = findNodeId(
      tree,
      (n) => n.op === "Add" && n.latex.replace(/\s+/g, " ").includes("a + b + c d - c e")
    );
    const selection = { kind: "span", parentId: addId, op: "Add", start: 2, end: 3 } as const;
    const result = factorSelection(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(a + b + c \left(d - e\right)\right) = f`
    );
  });

  it("factors when multi-selection maps to contiguous Add terms", () => {
    const tree = treefromLatex(String.raw`\left(a + b + c d - c e\right) = f`);
    const cdId = findNodeId(tree, (n) => n.op === "InvisibleOperator" && n.latex === "c d");
    const ceId = findNodeId(
      tree,
      (n) =>
        n.op === "InvisibleOperator" &&
        n.latex === "c e" &&
        tree.parentById[n.id] &&
        tree.nodesById[tree.parentById[n.id]]?.op === "Negate"
    );
    const selection = { kind: "multi", nodeIds: [cdId, ceId] } as const;
    const result = factorSelection(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(a + b + c \left(d - e\right)\right) = f`
    );
  });

  it("factors common dv in thermodynamics sum tail", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \left(\frac{\partial{u}}{\partial{v}}\right)_{T} \mathrm{d}{v} + P \mathrm{d}{v}`
    );
    const rhsAddId = findNodeId(
      tree,
      (n) =>
        n.op === "Add" &&
        n.latex.includes(String.raw`\partial{u}`) &&
        n.latex.includes(String.raw`P`)
    );
    const result = factorSelection(tree, {
      kind: "span",
      parentId: rhsAddId,
      op: "Add",
      start: 1,
      end: 2,
    });
    expect(result).not.toBeNull();
  });

  it("enables factor action for multi-selection in thermodynamics tail", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \left(\frac{\partial{u}}{\partial{v}}\right)_{T} \mathrm{d}{v} + P \mathrm{d}{v}`
    );
    const dvInSecondTerm = findNodeId(
      tree,
      (n) =>
        n.op === "Differential" &&
        tree.parentById[n.id] != null &&
        tree.nodesById[tree.parentById[n.id]]?.op === "InvisibleOperator" &&
        (tree.nodesById[tree.parentById[n.id]]?.latex ?? "").includes(String.raw`\partial{u}`)
    );
    const pId = findNodeId(tree, (n) => n.latex === "P");
    const enabled = canFactorSelection(tree, { kind: "multi", nodeIds: [dvInSecondTerm, pId] });
    expect(enabled).toBe(true);
  });

  it("factors the latter two terms in issue 24", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{h}}{\partial{T}}\right)_{P} \mathrm{d}{T} + \left(\frac{\partial{h}}{\partial{P}}\right)_{T} \mathrm{d}{P} - \mathrm{d}{P} v`
    );
    const secondTermId = findNodeId(
      tree,
      (n) =>
        n.op === "InvisibleOperator" &&
        n.latex.includes(String.raw`\frac{\partial{h}}{\partial{P}}`) &&
        n.latex.includes(String.raw`\mathrm{d}{P}`) &&
        tree.parentById[n.id] != null &&
        tree.nodesById[tree.parentById[n.id]]?.op === "Add"
    );
    const thirdTermInnerId = findNodeId(
      tree,
      (n) =>
        n.op === "InvisibleOperator" &&
        n.latex === String.raw`\mathrm{d}{P} v` &&
        tree.parentById[n.id] != null &&
        tree.nodesById[tree.parentById[n.id]]?.op === "Negate"
    );
    const result = factorSelection(tree, {
      kind: "multi",
      nodeIds: [secondTermId, thirdTermInnerId],
    });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{h}}{\partial{T}}\right)_{P} \mathrm{d}{T} + \mathrm{d}{P} \left(\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right)`
    );
  });
});
