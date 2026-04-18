import { describe, it, expect, vi } from "vitest";
import { evaluateRaw, parse } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { mathPadFacade } from "../../application/mathPadFacade";
import type { ExprSelection } from "../../selectionSemantics";
import { canEvaluateSelection, evaluateSelection, simplifySelection } from "./evaluateSelection";

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

  it("evaluates reciprocal nested partial-derivative denominator without mangled Delimiter token (issue 35)", () => {
    const latex = String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = \frac{-c_{v}}{\frac{1}{\left(\frac{\partial{T}}{\partial{v}}\right)_{u}}}`;
    const tree = buildTree(latex);
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain("Delimiter_FractionPartialDerivative");
  });

  it("evaluates whole RHS -c_v 0 to 0 (issue 36)", () => {
    const latex = String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = -c_{v} 0`;
    const tree = buildTree(latex);
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = 0`)
    );
  });

  it("keeps evaluated integral grouped when multiplied by a factor (issue 38)", () => {
    const latex = String.raw`u - u_{0} = c_{v} \int_{T_{0}}^{T} \,\mathrm{d}{T}`;
    const tree = buildTree(latex);
    const integralId = findNodeIdByLatex(tree, String.raw`\int_{T_{0}}^{T} \,\mathrm{d}{T}`);

    const next = evaluateSelection(tree, { kind: "node", nodeId: integralId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`u - u_{0} = c_{v} \left(T - T_{0}\right)`)
    );
  });

  it("evaluates 1/V definite integral multiplied by constants", () => {
    const latex = String.raw`Q = n R T \int_{a}^{b} \frac{1}{V} \,\mathrm{d}{V}`;
    const tree = buildTree(latex);
    const integralId = findNodeIdByLatex(
      tree,
      String.raw`\int_{a}^{b} \frac{1}{V} \,\mathrm{d}{V}`
    );
    const next = evaluateSelection(tree, { kind: "node", nodeId: integralId });

    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\int`);
    expect(out).toContain(
      String.raw`\ln\left(\left|b\right|\right) - \ln\left(\left|a\right|\right)`
    );
  });

  it("evaluates thermodynamics 1/v integral with subscript lower bound (issue 60)", () => {
    const latex = String.raw`c_{v} \left(T - T_{0}\right) = -R T \int_{v_{0}}^{v} \frac{1}{v} \,\mathrm{d}{v}`;
    const tree = buildTree(latex);
    const integralNode = Object.values(tree.nodesById).find((n) => n.op === "Integrate");
    expect(integralNode).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: integralNode!.id });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\int`);
    expect(out).toContain(String.raw`\ln`);
    expect(out).toContain(String.raw`v_{0}`);
    expect(out).toContain(String.raw`\left|v\right|`);
  });

  it("evaluates integral with differential embedded in integrand and tuple variable Nothing", () => {
    const latex = String.raw`\int_{T_{0}}^{T} \frac{\mathrm{d}{T}}{T}`;
    const tree = buildTree(latex);
    const integralNode = Object.values(tree.nodesById).find((n) => n.op === "Integrate");
    expect(integralNode).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: integralNode!.id });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\int`);
    expect(out).toContain(String.raw`\ln`);
    expect(out).toContain(String.raw`T_{0}`);
    expect(out).toContain(String.raw`\left|T\right|`);
  });

  it("evaluates negated definite integral by antiderivative substitution", () => {
    const latex = String.raw`-\int_{v_{0}}^{v} \frac{R}{v} \,\mathrm{d}{v}`;
    const tree = buildTree(latex);
    const integralNode = Object.values(tree.nodesById).find(
      (n) => n.op === "Negate"
    );
    expect(integralNode).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: integralNode!.id });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\int`);
    expect(out).toContain(String.raw`R`);
    expect(out).toContain(String.raw`\ln`);
    expect(out).toContain(String.raw`v_{0}`);
  });

  it("evaluates inverse-square definite integral with multiplicative symbolic upper bound (issue 81)", () => {
    const latex = String.raw`T_{1} - T_{2} = \int_{V}^{2 V} \frac{a}{c_{v} v^{2}} \,\mathrm{d}{v}`;
    const tree = buildTree(latex);
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: rhsId! });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\int`);
    expect(out).toContain(String.raw`a`);
    expect(out).toContain(String.raw`c_{v}`);
    expect(out).toContain(String.raw`V`);
  });

  it("keeps evaluated integral difference grouped under negation (issue 96)", () => {
    const latex = String.raw`W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \int_{T_{2}}^{\sqrt{T_{1} T_{2}}} C_{P} \,\mathrm{d}{T_{h}}`;
    const tree = buildTree(latex);
    const integralNode = Object.values(tree.nodesById).find((n) => {
      if (n.op !== "Integrate") return false;
      return n.latex.includes(String.raw`\int_{T_{2}}^{\sqrt{T_{1} T_{2}}}`);
    });
    expect(integralNode).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: integralNode!.id });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toContain(
      normalizeLatex(String.raw`\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}\right)`)
    );
    const groupedNode = Object.values(next!.nodesById).find(
      (n) =>
        (n.op === "Delimiter" || n.op === "List") &&
        normalizeLatex(n.latex).includes(
          normalizeLatex(String.raw`C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}`)
        )
    );
    expect(groupedNode).toBeTruthy();
  });

  it("keeps delimiter wrapper when evaluating whole negated integral term (issue 96)", () => {
    const latex = String.raw`W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \int_{T_{2}}^{\sqrt{T_{1} T_{2}}} C_{P} \,\mathrm{d}{T_{h}}`;
    const tree = buildTree(latex);
    const negatedIntegralTerm = Object.values(tree.nodesById).find(
      (n) =>
        n.op === "Negate" &&
        n.latex.includes(
          normalizeLatex(String.raw`\int_{T_{2}}^{\sqrt{T_{1} T_{2}}}`)
        )
    );
    expect(negatedIntegralTerm).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: negatedIntegralTerm!.id });
    expect(next).not.toBeNull();
    const negWithGroup = Object.values(next!.nodesById).find(
      (n) =>
        n.op === "Negate" &&
        n.latex.includes(normalizeLatex(String.raw`C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}`))
    );
    expect(negWithGroup).toBeTruthy();
    const negKids = negWithGroup ? next!.childrenById[negWithGroup.id] ?? [] : [];
    expect(negKids.length).toBeGreaterThan(0);
    const childNode = next!.nodesById[negKids[0]];
    expect(childNode?.op === "Delimiter" || childNode?.op === "List").toBe(true);
  });

  it("simplifies RHS without '+ -' for combined negative product (issue 97)", () => {
    const latex = String.raw`W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}\right)`;
    const tree = buildTree(latex);
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const next = simplifySelection(tree, { kind: "node", nodeId: rhsId! });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain("+ -");
    expect(out).toContain(
      normalizeLatex(String.raw`W = C_{P} T_{1} + C_{P} T_{2} - 2 C_{P} \sqrt{T_{1} T_{2}}`)
    );
  });

  it("renders simplified negative product as subtraction in Add context (issue 83 follow-up)", () => {
    const latex = String.raw`1 + 2 a \left(-\left(v - b\right)^{2}\right)`;
    const tree = buildTree(latex);
    const termId = findNodeIdByLatex(tree, String.raw`2 a \left(-\left(v - b\right)^{2}\right)`);
    const next = simplifySelection(tree, { kind: "node", nodeId: termId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`1 - 2 a \left(-b + v\right)^{2}`)
    );
  });

  it("simplifies ln(A) - ln(B) into ln(A/B) (issue 90)", () => {
    const tree = buildTree(
      String.raw`\ln\left(\left|V_{f}\right|\right) - \ln\left(\left|V_{0}\right|\right)`
    );
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\ln\left(\frac{\left|V_{f}\right|}{\left|V_{0}\right|}\right)`)
    );
  });

  it("simplifies ln(a) + ln(b) into ln(a b) (issue 90)", () => {
    const tree = buildTree(String.raw`\ln\left(a\right) + \ln\left(b\right)`);
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\ln\left(a b\right)`)
    );
  });

  it("simplifies contiguous multi-selected ln terms (issue 91)", () => {
    const tree = buildTree(
      String.raw`\ln\left(\left|V_{f}\right|\right) - \ln\left(\left|V_{0}\right|\right)`
    );
    const addKids = tree.childrenById[tree.rootId] ?? [];
    expect(addKids.length).toBe(2);
    const next = simplifySelection(tree, { kind: "multi", nodeIds: addKids });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\ln\left(\frac{\left|V_{f}\right|}{\left|V_{0}\right|}\right)`)
    );
  });

  it("simplifies when multi-selection picks descendants of adjacent additive terms (issue 101)", () => {
    const tree = buildTree(
      String.raw`\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) - c_{P} m \ln\left(T_{2}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    expect(rhsKids.length).toBeGreaterThanOrEqual(4);

    const firstTermKids = tree.childrenById[rhsKids[0]] ?? [];
    const secondTermKids = tree.childrenById[rhsKids[1]] ?? [];
    const selectedFromFirst = firstTermKids[0];
    const selectedFromSecond = secondTermKids[2];
    expect(selectedFromFirst).toBeTruthy();
    expect(selectedFromSecond).toBeTruthy();

    const sel: ExprSelection = {
      kind: "multi",
      nodeIds: [selectedFromFirst, selectedFromSecond],
    };
    expect(canEvaluateSelection(tree, sel)).toBe(true);

    const next = simplifySelection(tree, sel);
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toContain(
      normalizeLatex(
        String.raw`2 c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right)`
      )
    );
  });

  it("keeps simplified parenthesized additive factor structurally round-trippable (issue 102)", () => {
    const tree = buildTree(
      String.raw`\Delta U_{\mathrm{max}} = \frac{3}{2} R T_{i} \left(\frac{1}{2^{\frac{2}{3}}} - 1\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    const delimiterId = rhsKids[3];
    expect(tree.nodesById[delimiterId]?.op).toBe("Delimiter");

    const result = mathPadFacade.applyAction({
      tree,
      selection: { kind: "node", nodeId: delimiterId },
      action: { type: "simplify" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.tree;

    const nextRhsId = next.childrenById[next.rootId]?.[1];
    const nextRhsKids = nextRhsId ? next.childrenById[nextRhsId] ?? [] : [];
    const groupedFactor = nextRhsKids[3];
    expect(next.nodesById[groupedFactor]?.op).toBe("Delimiter");

    const reparsed = parse(next.latexPlain);
    expect(reparsed).toBeTruthy();
    if (!reparsed) return;
    const reparsedTree = ExpressionTree.create(reparsed as MJ);
    expect(reparsedTree.latexPlain).toBe(next.latexPlain);
  });

  it("simplifies exponential of ln when Euler constant is explicit (issue 61)", () => {
    const tree = buildTreeFromMJ([
      "Power",
      "ExponentialE",
      ["Ln", ["InvisibleOperator", "T", ["Power", "v", ["Divide", "R", "c_v"]]]],
    ]);

    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\ln`);
    expect(out).toContain(String.raw`T`);
    expect(out).toContain(String.raw`v^{\frac{R}{c_{v}}}`);
  });

  it("simplifies e^ln(...) from parsed LaTeX by treating power-base e as Euler constant", () => {
    const tree = buildTree(String.raw`e^{\ln\left(Tv^{\frac{R}{c_{v}}}\right)}`);
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });

    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).not.toContain(String.raw`\ln`);
    expect(out).toContain(String.raw`T`);
    expect(out).toContain(String.raw`v^{\frac{R}{c_{v}}}`);
  });

  it("simplify preserves denominator scaling for nested fractions (issue 63)", () => {
    const tree = buildTree(
      String.raw`\frac{\frac{5}{3}}{\left(T_{1} + T_{0}\right)} = \left(\Delta T\right)`
    );
    const lhsId = tree.childrenById[tree.rootId]?.[0];
    expect(lhsId).toBeTruthy();

    const next = simplifySelection(tree, { kind: "node", nodeId: lhsId! });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toContain(String.raw`\frac{5}{3 \left(T_{0} + T_{1}\right)}`);
    expect(out).not.toContain(String.raw`\frac{5}{3 T_{0} + T_{1}}`);
  });

  it("simplify combines symbolic powers in multiplicative factors (issue 109)", () => {
    const tree = buildTree(
      String.raw`\left(\frac{\partial{P}}{\partial{T}}\right)_{v} = T \frac{1}{T^{2}} \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    if (!rhsId) return;
    const rhsKids = tree.childrenById[rhsId] ?? [];
    expect(rhsKids.length).toBeGreaterThanOrEqual(3);
    const next = simplifySelection(tree, {
      kind: "span",
      parentId: rhsId,
      op: "InvisibleOperator",
      start: 0,
      end: 1,
    });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toContain(
      normalizeLatex(
        String.raw`\left(\frac{\partial{P}}{\partial{T}}\right)_{v} = \frac{1}{T} \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
      )
    );
    expect(out).not.toContain(normalizeLatex(String.raw`T T^{-2}`));
  });

  it("simplify cancels nested leading negatives on RHS products (issue 77)", () => {
    const tree = buildTree(
      String.raw`c_{v} \frac{\mathrm{d}{P}}{\mathrm{d}{v}} = -\left(-c_{P} \frac{1}{\left(\frac{\partial{v}}{\partial{P}}\right)_{T}}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const next = simplifySelection(tree, { kind: "node", nodeId: rhsId! });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toContain(
      normalizeLatex(
        String.raw`c_{v} \frac{\mathrm{d}{P}}{\mathrm{d}{v}} = c_{P} \frac{1}{\left(\frac{\partial{v}}{\partial{P}}\right)_{T}}`
      )
    );
    expect(out).not.toContain(
      normalizeLatex(
        String.raw`= -\left(-c_{P} \frac{1}{\left(\frac{\partial{v}}{\partial{P}}\right)_{T}}\right)`
      )
    );
  });

  it("simplify rewrites +(-A)B as subtraction with outside negative (issue 111)", () => {
    const tree = buildTree(
      String.raw`\mathrm{d}{s} = \frac{c_{P}}{T} \mathrm{d}{T} + \left(-\left(\frac{\partial{v}}{\partial{T}}\right)_{P}\right) \mathrm{d}{P}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    if (!rhsId) return;
    const next = simplifySelection(tree, { kind: "node", nodeId: rhsId });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toContain(
      normalizeLatex(
        String.raw`\mathrm{d}{s} = \frac{c_{P}}{T} \mathrm{d}{T} -`
      )
    );
    expect(out).toContain(
      normalizeLatex(
        String.raw`\left(\frac{\partial{v}}{\partial{T}}\right)_{P}`
      )
    );
    expect(out).not.toContain("+ -");
  });

  it("cancels (dP_s/dv_s) dv_s to dP_s when evaluating selected product (issue 44)", () => {
    const latex = String.raw`\frac{\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} \mathrm{d}{v_{s}}}{P} + \frac{\gamma}{v} \mathrm{d}{v_{s}} = 0`;
    const tree = buildTree(latex);
    const termNode = Object.values(tree.nodesById).find((n) => {
      if (!n) return false;
      if (n.op !== "InvisibleOperator" && n.op !== "Multiply") return false;
      const mj = n.json;
      if (!Array.isArray(mj) || mj.length < 3) return false;
      const kids = mj.slice(1) as MJ[];
      const hasDerivativeFraction = kids.some(
        (k) =>
          Array.isArray(k) &&
          (k[0] === "Divide" || k[0] === "FractionDerivative" || k[0] === "FractionPartialDerivative")
      );
      const hasDv = kids.some((k) => JSON.stringify(k).includes(String.raw`"v"`));
      return hasDerivativeFraction && hasDv;
    });
    const termId = termNode?.id;
    expect(termId).toBeTruthy();

    const next = evaluateSelection(tree, { kind: "node", nodeId: termId! });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toContain(
      normalizeLatex(String.raw`\frac{\mathrm{d}{P_{s}}}{P}`)
    );
  });

  it("simplify collapses applied partial operator into a mixed partial", () => {
    const tree = buildTree(
      String.raw`\left(\frac{\partial}{\partial{P}}\right) \left(\frac{\partial{s}}{\partial{T}}\right)_{P}`
    );
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`)
    );
  });

  it("evaluate collapses applied partial operator into a mixed partial", () => {
    const tree = buildTree(
      String.raw`\left(\frac{\partial}{\partial{P}}\right) \left(\frac{\partial{s}}{\partial{T}}\right)_{P}`
    );
    const next = evaluateSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`)
    );
  });

  it("simplify keeps applied partial operators as operators, not commuted factors", () => {
    const tree = buildTree(
      String.raw`\left(\frac{\partial}{\partial{P}}\right) \left(c_{P}\right)`
    );
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`\left(\frac{\partial}{\partial{P}}\right) c_{P}`)
    );
  });

  it("simplify preserves nested subscript structure (issue 126)", () => {
    const tree = buildTree(String.raw`-1 \left(c_{P} - c_{P_{0}}\right)`);
    const next = simplifySelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(next).not.toBeNull();
    const out = normalizeLatex(next!.latexPlain);
    expect(out).toBe(normalizeLatex(String.raw`-c_{P} + c_{P_{0}}`));
    expect(out).not.toContain("Subscript");
  });
});

describe("canEvaluateSelection", () => {
  it("returns false for non-contiguous or cross-parent multi selections", () => {
    expect(canEvaluateSelection(null, null)).toBe(false);
    const tree = buildTree("a + b");
    const sel: ExprSelection = { kind: "multi", nodeIds: [] };
    expect(canEvaluateSelection(tree, sel)).toBe(false);
  });

  it("returns true for contiguous multi selections under Add", () => {
    const tree = buildTree("a + b + c");
    const addId = tree.rootId;
    const [aId, bId] = tree.childrenById[addId] ?? [];
    expect(aId).toBeTruthy();
    expect(bId).toBeTruthy();
    const sel: ExprSelection = { kind: "multi", nodeIds: [aId!, bId!] };
    expect(canEvaluateSelection(tree, sel)).toBe(true);
  });

  it("returns true for descendant picks that lift to contiguous additive terms", () => {
    const tree = buildTree(
      String.raw`\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) - c_{P} m \ln\left(T_{2}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    const firstTermKids = tree.childrenById[rhsKids[0]] ?? [];
    const secondTermKids = tree.childrenById[rhsKids[1]] ?? [];
    const sel: ExprSelection = {
      kind: "multi",
      nodeIds: [firstTermKids[0], secondTermKids[2]],
    };
    expect(canEvaluateSelection(tree, sel)).toBe(true);
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
