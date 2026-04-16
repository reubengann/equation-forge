import { describe, expect, it } from "vitest";
import { ExpressionTree, type MJ } from "../ExpressionTree";
import { parse } from "../computeEngine";
import type { ExprSelection } from "../selectionSemantics";
import { mathPadFacade } from "./mathPadFacade";

function buildTree(latex: string): ExpressionTree {
  const mj = parse(latex);
  if (!mj) throw new Error(`Failed to parse LaTeX: ${latex}`);
  return ExpressionTree.create(mj as MJ);
}

function normalizeLatex(s: string): string {
  return s.replace(/\\,/g, " ").replace(/\s+/g, " ").trim();
}

function hasAncestorWithOp(tree: ExpressionTree, id: string, op: string): boolean {
  let cur: string | undefined = id;
  while (cur) {
    const parent = tree.parentById[cur];
    if (!parent) return false;
    if (tree.nodesById[parent]?.op === op) return true;
    cur = parent;
  }
  return false;
}

describe("mathPadFacade multi-select substitute", () => {
  it("replaces grouped derivative application once for multi-selection substitute", () => {
    const tree = buildTree(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}} = \frac{1}{T} \left(\frac{\partial}{\partial{P}}\right) \left(c_{P}\right)`
    );

    const barePartialOpId = Object.values(tree.nodesById).find(
      (n) => n.op === "Delimiter" && n.latex === String.raw`\left(\frac{\partial}{\partial{P}}\right)`
    )?.id;
    const cPId = Object.values(tree.nodesById).find(
      (n) =>
        n.op === "Subscript" &&
        n.latex === String.raw`c_{P}` &&
        hasAncestorWithOp(tree, n.id, "Delimiter")
    )?.id;
    const replacement = mathPadFacade.parseLatex("a");

    expect(barePartialOpId).toBeTruthy();
    expect(cPId).toBeTruthy();
    expect(replacement).not.toBeNull();

    const result = mathPadFacade.applyAction({
      tree,
      selection: { kind: "multi", nodeIds: [barePartialOpId!, cPId!] } as ExprSelection,
      action: {
        type: "substitute",
        replacement: replacement as MJ,
        scope: "single",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = normalizeLatex(result.tree.latexPlain);
    const validOrder =
      rendered.includes(normalizeLatex(String.raw`= \frac{1}{T} a`)) ||
      rendered.includes(normalizeLatex(String.raw`= a \frac{1}{T}`));
    expect(validOrder).toBe(true);
    expect(rendered).not.toContain(normalizeLatex(String.raw`a\left(a\right)`));
  });
});
