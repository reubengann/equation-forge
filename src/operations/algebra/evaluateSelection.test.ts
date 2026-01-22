import { describe, it, expect, vi } from "vitest";
import { evaluateRaw, parse } from "../../computeEngine";
import { ExpressionTree } from "../../ExpressionTree";
import type { ExprSelection } from "../../selectionSemantics";
import { canEvaluateSelection, evaluateSelection } from "./evaluateSelection";

function buildTree(latex: string): ExpressionTree {
  const mj = parse(latex);
  if (!mj) throw new Error(`Failed to parse LaTeX: ${latex}`);
  return ExpressionTree.create(mj);
}

function buildTreeFromMJ(mj: any): ExpressionTree {
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

  it("evaluates a definite integral with numeric bounds", () => {
    const latex = String.raw`\int_{0}^{2} 1 \,\mathrm{d}{x}`;
    const tree = buildTree(latex);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("2");
  });

  it("evaluates a definite integral with symbolic bounds", () => {
    const latex = String.raw`\int_{0}^{x_{0}} \,\mathrm{d}{x}`;
    const tree = buildTree(latex);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(normalizeLatex(String.raw`x_{0}`));
  });

  it("returns null when the selection does not change", () => {
    const latex = String.raw`x + 2`;
    const tree = buildTree(latex);
    const nodeId = findNodeIdByLatex(tree, "x");
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("evaluateRaw a definite integral with numeric bounds", () => {
    const latex = String.raw`\int_{0}^{2} 1 \,\mathrm{d}{x}`;
    const tree = buildTree(latex);
    const foo = evaluateRaw(tree.rootJson);
    expect(foo.valueOf()).toBe(2);
  });

  it("evaluates inverse tangent result without crashing", () => {
    const latex = String.raw`\tan^{-1}\left(\mu_{s}\right) = \tan^{-1}\left(\tan\left(\theta\right)\right)`;
    const tree = buildTree(latex);
    const rhsLatex = String.raw`\tan^{-1}\left(\tan\left(\theta\right)\right)`;
    const nodeId = findNodeIdByLatex(tree, rhsLatex);
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(
        String.raw`\tan^{-1}\left(\mu_{s}\right) = \arctan\left(\tan\left(\theta\right)\right)`
      )
    );
  });

  it("evaluates numeric arctan to a number, not [object Object]", () => {
    const latex = String.raw`\theta = \tan^{-1}\left(0.4\right)`;
    const tree = buildTree(latex);
    const rhsLatex = String.raw`\tan^{-1}\left(0.4\right)`;
    const nodeId = findNodeIdByLatex(tree, rhsLatex);
    const sel: ExprSelection = { kind: "node", nodeId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    const normalized = normalizeLatex(next!.latexPlain);
    expect(normalized).not.toContain("[object Object]");

    const parts = normalized.split(" = ");
    expect(parts[0]).toBe(String.raw`\theta`);
    expect(parts.length).toBe(2);
    const numeric = Number(parts[1]);
    expect(Number.isFinite(numeric)).toBe(true);
  });

  it("multiplies numeric factors inside implicit product", () => {
    // MJ directly to ensure an InvisibleOperator is used
    const tree = buildTreeFromMJ(["InvisibleOperator", 2, "3", "x"]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("6 x");
  });

  it("round-trips subscript symbols through evaluation pipeline", () => {
    const tree = buildTreeFromMJ(["Subscript", "x", 2]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    // No change expected, but exercises encode/decode path
    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("returns null for invalid span ranges", () => {
    const tree = buildTreeFromMJ(["Add", 1, 2, 3]);
    const sel: ExprSelection = {
      kind: "span",
      parentId: tree.rootId,
      op: "Add",
      start: 2,
      end: 1, // start > end invalid
    };

    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("rejects spans whose parent is not additive/multiplicative", () => {
    const tree = buildTreeFromMJ(["Power", "x", 2]);
    const sel: ExprSelection = {
      kind: "span",
      parentId: tree.rootId,
      op: "Add",
      start: 0,
      end: 0,
    };

    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("returns null when span parent id is missing", () => {
    const tree = buildTree("a + b");
    const sel: ExprSelection = {
      kind: "span",
      parentId: "missing",
      op: "Add",
      start: 0,
      end: 0,
    };
    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("returns null when implicit product has no numeric factors", () => {
    const tree = buildTreeFromMJ(["InvisibleOperator", "x", "y"]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).toBeNull();
  });

  it("drops a unit numeric factor while keeping other factors", () => {
    const tree = buildTreeFromMJ(["InvisibleOperator", 1, "x"]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("x");
  });

  it("converts compute-engine numeric objects to primitives", async () => {
    const ce = await import("../../computeEngine");
    const spy = vi
      .spyOn(ce, "withRealScope")
      .mockImplementation((_: any, fn: any) =>
        fn({
          box: () => ({
            evaluate: () => ({ json: { num: "2" } }),
            simplify: () => undefined,
            N: () => undefined,
          }),
        } as any)
      );

    const tree = buildTreeFromMJ(["InvisibleOperator", 1, 1]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("2");

    spy.mockRestore();
  });

  it("multiplies numeric factors when compute engine returns no candidates", async () => {
    const ce = await import("../../computeEngine");
    const spy = vi
      .spyOn(ce, "withRealScope")
      .mockImplementation((_: any, fn: any) =>
        fn({
          box: () => ({
            evaluate: () => undefined,
            simplify: () => undefined,
            N: () => undefined,
          }),
        } as any)
      );

    const tree = buildTreeFromMJ(["InvisibleOperator", 2, "3", "x"]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("6 x");

    spy.mockRestore();
  });

  it("normalizes EvaluateAt candidates returned by the compute engine", async () => {
    const ce = await import("../../computeEngine");
    const spy = vi
      .spyOn(ce, "withRealScope")
      .mockImplementation((_expr: any, fn: any) =>
        fn({
          box: () => ({
            evaluate: () => ({
              json: ["EvaluateAt", ["Function", ["Add", "x", 1], "x"], 0, 2],
            }),
            simplify: () => undefined,
            N: () => undefined,
          }),
        } as any)
      );

    const tree = buildTreeFromMJ(["InvisibleOperator", 1, 1]);
    const sel: ExprSelection = { kind: "node", nodeId: tree.rootId };

    const next = evaluateSelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe("2 + 1 - \\left(0 + 1\\right)");

    spy.mockRestore();
  });
});

describe("canEvaluateSelection", () => {
  it("returns false for multi selections", () => {
    expect(canEvaluateSelection(null, null)).toBe(false);
    const tree = buildTree("a + b");
    const sel: ExprSelection = { kind: "multi", nodeIds: [] };
    expect(canEvaluateSelection(tree, sel)).toBe(false);
  });

  it("returns false for spans whose parent is not Add/InvisibleOperator", () => {
    const tree = buildTreeFromMJ(["Power", "x", 2]);
    const sel: ExprSelection = {
      kind: "span",
      parentId: tree.rootId,
      op: "Add",
      start: 0,
      end: 0,
    };
    expect(canEvaluateSelection(tree, sel)).toBe(false);
  });

  it("allows additive spans and node selections", () => {
    const tree = buildTree("a + 1");
    const addId = tree.rootId;
    const selSpan: ExprSelection = {
      kind: "span",
      parentId: addId,
      op: "Add",
      start: 0,
      end: 1,
    };
    const selNode: ExprSelection = { kind: "node", nodeId: addId };
    expect(canEvaluateSelection(tree, selSpan)).toBe(true);
    expect(canEvaluateSelection(tree, selNode)).toBe(true);
  });
});
