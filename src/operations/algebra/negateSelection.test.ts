import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import { ExpressionTree } from "../../ExpressionTree";
import { negateSelection } from "./negateSelection";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("negateSelection", () => {
  it("negates both sides when no selection is provided", () => {
    const tree = treefromLatex(String.raw`a = -b`);
    const result = negateSelection(tree, null);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`-a = b`);
  });

  it("distributes selected outer negation into grouped additive term", () => {
    const tree = treefromLatex(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) - \left(\frac{a}{v_{1}} - \frac{a}{v_{2}}\right)`
    );
    const targetId = findNodeId(
      tree,
      (n) =>
        n.op === "Negate" &&
        n.latex.includes(String.raw`\frac{a}{v_{1}}`) &&
        n.latex.includes(String.raw`\frac{a}{v_{2}}`)
    );
    const result = negateSelection(tree, { kind: "node", nodeId: targetId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) + \left(-\frac{a}{v_{1}} + \frac{a}{v_{2}}\right)`
    );
  });

  it("factors -1 from a selected grouped additive delimiter", () => {
    const tree = treefromLatex(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) + \left(-\frac{a}{v_{1}} + \frac{a}{v_{2}}\right)`
    );
    const targetId = findNodeId(
      tree,
      (n) =>
        n.op === "Delimiter" &&
        n.latex.includes(String.raw`-\frac{a}{v_{1}}`) &&
        n.latex.includes(String.raw`+ \frac{a}{v_{2}}`)
    );
    const result = negateSelection(tree, { kind: "node", nodeId: targetId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) - \left(\frac{a}{v_{1}} - \frac{a}{v_{2}}\right)`
    );
  });

  it("normalizes negative additive numerator in selected fraction (issue 152)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{h}}{\partial{v}}\right)_{T} = \frac{-T \beta - 1}{\kappa}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    if (!rhsId) return;

    const result = negateSelection(tree, { kind: "node", nodeId: rhsId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(\frac{\partial{h}}{\partial{v}}\right)_{T} = -\frac{T \beta + 1}{\kappa}`
    );
  });

  it("does not introduce double-negation artifacts when forcing negate on grouped negative factor (issue 154)", () => {
    const tree = ExpressionTree.create([
      "Equal",
      "x",
      ["Add", ["InvisibleOperator", ["Negate", "T"], ["Delimiter", ["Negate", "y"]]], "v"],
    ]);
    const groupedNegId = findNodeId(tree, (n) => n.op === "Delimiter" && n.latex.includes("-y"));
    const result = negateSelection(tree, { kind: "node", nodeId: groupedNegId });
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).not.toContain("---");
    expect(out).not.toBe(normalizeSpaces(String.raw`x = --T \left(-y\right) + v`));
  });

  it("does not flip sign incorrectly when forcing negate on product with negative factors (issue 154)", () => {
    const tree = ExpressionTree.create([
      "Equal",
      "x",
      ["Add", ["InvisibleOperator", ["Negate", "T"], ["Delimiter", ["Negate", "y"]]], "v"],
    ]);
    const productId = findNodeId(tree, (n) => n.op === "InvisibleOperator" && n.latex.includes("T"));
    const result = negateSelection(tree, { kind: "node", nodeId: productId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).not.toBe(normalizeSpaces(String.raw`x = T \left(-y\right) + v`));
  });

  it("collapses selected double-negative product to positive form (issue 154 follow-up)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{h}}{\partial{P}}\right)_{T} = -T \left(-\left(\frac{\partial{s}}{\partial{P}}\right)_{T}\right) + v`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    if (!rhsId) return;
    const rhsKids = tree.childrenById[rhsId] ?? [];
    const doubleNegId = rhsKids.find((id) => tree.nodesById[id]?.op === "Negate");
    expect(doubleNegId).toBeTruthy();
    if (!doubleNegId) return;

    const result = negateSelection(tree, { kind: "node", nodeId: doubleNegId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(\frac{\partial{h}}{\partial{P}}\right)_{T} = T \left(\frac{\partial{s}}{\partial{P}}\right)_{T} + v`
    );
  });

  it("removes outer and inner negates for selected grouped negative factor (general pattern)", () => {
    const tree = ExpressionTree.create([
      "Equal",
      "x",
      [
        "Negate",
        ["InvisibleOperator", "T", ["Delimiter", ["Negate", ["Subscript", "s", "P"]]]],
      ],
    ]);
    const groupId = findNodeId(tree, (n) => n.op === "Delimiter" && n.latex.includes("-s_{P}"));
    const result = negateSelection(tree, { kind: "node", nodeId: groupId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`x = T \left(s_{P}\right)`);
  });

  it("moves negation to whole product when selecting negative grouped factor in a sum (issue 155)", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}{s} = \frac{c_{v}}{T} \,\mathrm{d}{T} + \left(-\frac{1}{\rho^{2}} \,\mathrm{d}{\rho}\right) \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`
    );
    const groupId = findNodeId(
      tree,
      (n) =>
        n.op === "Delimiter" &&
        n.latex.includes(String.raw`-\frac{1}{\rho^{2}}`) &&
        n.latex.includes(String.raw`\mathrm{d}{\rho}`)
    );
    const result = negateSelection(tree, { kind: "node", nodeId: groupId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\mathrm{d}{s} = \frac{c_{v}}{T} \mathrm{d}{T} - \left(\frac{1}{\rho^{2}} \mathrm{d}{\rho}\right) \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`
    );
  });
});

