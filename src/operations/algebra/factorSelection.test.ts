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

  it("allows factoring when selecting an enclosing delimiter node (issue 52)", () => {
    const tree = treefromLatex(
      String.raw`w = K \left(\frac{v_{2}^{-\gamma + 1}}{-\gamma + 1} - \frac{v_{1}^{-\gamma + 1}}{-\gamma + 1}\right)`
    );
    const targetId = findNodeId(
      tree,
      (n) =>
        (n.op === "Delimiter" || n.op === "Add") &&
        n.latex.includes(String.raw`v_{2}^{-\gamma + 1}`) &&
        n.latex.includes(String.raw`v_{1}^{-\gamma + 1}`)
    );

    expect(canFactorSelection(tree, { kind: "node", nodeId: targetId })).toBe(true);

    const result = factorSelection(tree, { kind: "node", nodeId: targetId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toContain(
      String.raw`\frac{v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}}{-\gamma + 1}`
    );
  });

  it("factors a difference of squares into conjugates", () => {
    const tree = treefromLatex(String.raw`-T_{0}^{2} + T_{1}^{2}`);
    const result = factorSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(T_{1} - T_{0}\right) \left(T_{1} + T_{0}\right)`
    );
  });

  it("factors out both symbolic and rational numeric prefactors (issue 64)", () => {
    const tree = treefromLatex(
      String.raw`-\frac{1}{2} b T_{0}^{2} + \frac{1}{2} b T_{1}^{2}`
    );
    const result = factorSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\frac{b}{2} \left(-T_{0}^{2} + T_{1}^{2}\right)`
    );
  });

  it("factors negative perfect-square trinomial as -(v-b)^2 (issue 83)", () => {
    const tree = treefromLatex(String.raw`\left(-b^{2} + 2 b v - v^{2}\right)`);
    const result = factorSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(-\left(v - b\right)^{2}\right)`
    );
  });

  it("factors c_P from -c_P beta mu / kappa + c_P (issue 84)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{h}}{\partial{T}}\right)_{v} = -\frac{c_{P} \beta \mu}{\kappa} + c_{P}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    expect(canFactorSelection(tree, { kind: "node", nodeId: rhsId! })).toBe(true);

    const result = factorSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).toContain(String.raw`= c_{P} \left`);
    expect(out).toContain(String.raw`\beta`);
    expect(out).toContain(String.raw`\mu`);
    expect(out).toContain(String.raw`\kappa`);
  });

  it("factors RHS without '+ -' inside grouped sum (issue 99)", () => {
    const tree = treefromLatex(
      String.raw`W = C_{P} T_{1} + C_{P} T_{2} - 2 C_{P} \sqrt{T_{1} T_{2}}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const result = factorSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).not.toContain("+ -");
    expect(out).toBe(
      String.raw`W = C_{P} \left(T_{1} + T_{2} - 2 \sqrt{T_{1} T_{2}}\right)`
    );
  });

  it("factors v out of selected numerator tail terms (issue 131)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{h}}{\partial{P}}\right)_{T} = \frac{R T v^{3} b - 2 a v^{3} - 2 a v b^{2} + 4 a b v^{2}}{R T v^{3} - 2 a b^{2} + 4 a b v - 2 a v^{2}}`
    );
    const numeratorAddId = findNodeId(
      tree,
      (n) =>
        n.op === "Add" &&
        n.latex.includes(String.raw`R T v^{3} b`) &&
        n.latex.includes(String.raw`- 2 a v^{3}`) &&
        n.latex.includes(String.raw`+ 4 a b v^{2}`)
    );
    const result = factorSelection(tree, {
      kind: "span",
      parentId: numeratorAddId,
      op: "Add",
      start: 1,
      end: 3,
    });
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).toContain(String.raw`2 a v \left`);
    expect(out).toContain(String.raw`v^{2}`);
    expect(out).toContain(String.raw`- b^{2}`);
    expect(out).toContain(String.raw`+ 2 b v`);
  });

  it("factors both a and c_v from RHS terms (issue 131)", () => {
    const tree = treefromLatex(
      String.raw`T_{2} - T_{1} = \frac{a}{c_{v} v_{2}} - \frac{a}{c_{v} v_{1}}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const result = factorSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).toContain(String.raw`\frac{a}{c_{v}}`);
    expect(out).toContain(String.raw`\left(\frac{1}{v_{2}} - \frac{1}{v_{1}}\right)`);
  });
});
