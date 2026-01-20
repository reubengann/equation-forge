import { describe, it, expect } from "vitest";
import { parse } from "./computeEngine";
import { ExpressionTree } from "./ExpressionTree";
import type { ExprSelection } from "./selectionSemantics";
import { evaluateSelection } from "./evaluateSelection";

function buildTree(latex: string): ExpressionTree {
  const mj = parse(latex);
  if (!mj) throw new Error(`Failed to parse LaTeX: ${latex}`);
  return ExpressionTree.create(mj);
}

function findNodeIdByLatex(tree: ExpressionTree, match: string): string {
  const hit = Object.values(tree.nodesById).find((n) => n?.latex === match);
  if (!hit) throw new Error(`Node not found for latex: ${match}`);
  return hit.id;
}

function normalizeLatex(s: string): string {
  return s.replace(/\\,/g, " ").replace(/\s+/g, " ").trim();
}

describe("evaluateSelection", () => {
  it("evaluates trig in degrees to an exact fraction", () => {
    const latex = String.raw`\sin\left(30^{\circ}\right)`;
    const tree = buildTree(latex);
    const nodeId = findNodeIdByLatex(tree, latex);
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(normalizeLatex(String.raw`\frac{1}{2}`));
  });

  it("evaluates a selected node inside an equation", () => {
    const latex = String.raw`\sin\left(30^{\circ}\right) = x`;
    const tree = buildTree(latex);
    const nodeId = findNodeIdByLatex(tree, String.raw`\sin\left(30^{\circ}\right)`);
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(normalizeLatex(String.raw`\frac{1}{2} = x`));
  });

  it("evaluates an additive span inside Add", () => {
    const latex = String.raw`a + 2 + 6`;
    const tree = buildTree(latex);
    const addId = tree.rootId;
    const kids = tree.childrenById[addId];
    expect(kids.length).toBe(3);

    const sel: ExprSelection = {
      kind: "span",
      parentId: addId,
      op: "Add",
      start: 1,
      end: 2,
    };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("a + 8");
  });

  it("evaluates a multiplicative span inside InvisibleOperator", () => {
    const latex = String.raw`2 \times 3 x`;
    const tree = buildTree(latex);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("6 x");
  });

  it("returns null when the selection does not change", () => {
    const latex = String.raw`x + 2`;
    const tree = buildTree(latex);
    const nodeId = findNodeIdByLatex(tree, "x");
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });
});
