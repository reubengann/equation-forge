import { describe, expect, it } from "vitest";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { treefromLatex, findNodeId } from "../../testHelpers";
import { mathPadFacade } from "../../application/mathPadFacade";
import { expandSubexpression } from "./expandSubexpression";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("expandSubexpression", () => {
  it("expands a(b+c)=1 when selecting the product node", () => {
    const tree = treefromLatex(String.raw`a\left(b+c\right)=1`);

    // Equal root: [lhs, rhs]; lhs should be the implicit product a(b+c).
    const equalChildren = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalChildren[0];
    expect(lhsId).toBeTruthy();

    const result = expandSubexpression(tree, lhsId!);
    expect(result).not.toBeNull();

    const latex = normalizeSpaces(result!.latexPlain);
    expect(latex).toBe("a b + a c = 1");
  });

  it("expands dot product bilinearly over addition", () => {
    const tree = treefromLatex(String.raw`\vec{a} \cdot (\vec{b} + \vec{c})`);
    const dotId = findNodeId(tree, (n) => n.op === "DotProduct");

    const result = expandSubexpression(tree, dotId);
    expect(result).not.toBeNull();

    const latex = normalizeSpaces(result!.latexPlain);
    expect(latex).toBe(
      String.raw`\vec{a} \cdot \vec{b} + \vec{a} \cdot \vec{c}`
    );
  });

  it("treats issue 18 target as non-expandable without throwing", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q}=\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T}+P\right]\mathrm{d}{v}`
    );
    const addId = findNodeId(
      tree,
      (n) =>
        n.op === "Add" &&
        n.latex.includes(String.raw`\frac{\partial{u}}{\partial{v}}`)
    );
    expect(addId).toBeTruthy();

    expect(() => expandSubexpression(tree, addId)).not.toThrow();
    expect(expandSubexpression(tree, addId)).toBeNull();
    expect(mathPadFacade.canExpand(tree, { kind: "node", nodeId: addId })).toBe(false);
  });

  it("expands full RHS for issue 18 expression", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q}=\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T}+P\right]\mathrm{d}{v}`
    );
    const equalChildren = tree.childrenById[tree.rootId] ?? [];
    const rhsId = equalChildren[1];
    expect(rhsId).toBeTruthy();
    expect(mathPadFacade.canExpand(tree, { kind: "node", nodeId: rhsId! })).toBe(true);

    const result = expandSubexpression(tree, rhsId!);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{u}}{\partial{v}}\right)_{T} \mathrm{d}{v} + P \mathrm{d}{v}`
    );
  });

  it("supports expand for equivalent alt multi-selection on RHS factors (issue 28)", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}'{q}=\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T}+P\right]\mathrm{d}{v}`
    );
    const rhsId = (tree.childrenById[tree.rootId] ?? [])[1];
    expect(rhsId).toBeTruthy();
    const rhsFactors = tree.childrenById[rhsId!] ?? [];
    expect(rhsFactors.length).toBe(2);

    const selection = { kind: "multi", nodeIds: rhsFactors } as const;
    expect(mathPadFacade.canExpand(tree, selection)).toBe(true);

    const applied = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "expand" },
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(normalizeSpaces(applied.tree.latexPlain)).toBe(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{u}}{\partial{v}}\right)_{T} \mathrm{d}{v} + P \mathrm{d}{v}`
    );
  });

  it("expands grouped fraction power to factor-wise powers (issue 47)", () => {
    const tree = treefromLatex(String.raw`P \left(\frac{R T}{P}\right)^{\gamma} = K`);
    const powerId = findNodeId(
      tree,
      (n) => n.op === "Power" && n.latex.includes(String.raw`\frac{R T}{P}`)
    );

    const result = expandSubexpression(tree, powerId);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`P \frac{R^{\gamma} T^{\gamma}}{P^{\gamma}} = K`
    );
  });

  it("selecting only the base of a power expands the whole power (issue 47)", () => {
    const tree = treefromLatex(String.raw`P \left(\frac{R T}{P}\right)^{\gamma} = K`);
    const baseId = findNodeId(
      tree,
      (n) => n.op === "Delimiter" && n.latex.includes(String.raw`\frac{R T}{P}`)
    );

    const result = expandSubexpression(tree, baseId);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`P \frac{R^{\gamma} T^{\gamma}}{P^{\gamma}} = K`
    );
  });

  it("expands selected bracket under negation (issue 19)", () => {
    const tree = treefromLatex(
      String.raw`c_{V}\frac{\mathrm{d}{T}}{\mathrm{d}{v}}=-\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T}+P\right]`
    );
    const bracketId = findNodeId(
      tree,
      (n) => n.op === "List" && n.latex.includes(String.raw`\frac{\partial{u}}{\partial{v}}`)
    );
    expect(bracketId).toBeTruthy();
    expect(mathPadFacade.canExpand(tree, { kind: "node", nodeId: bracketId })).toBe(true);

    const result = expandSubexpression(tree, bracketId);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`c_{V} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = -\left(\frac{\partial{u}}{\partial{v}}\right)_{T} - P`
    );
  });

  it("expands differential of a sum using linearity and product rule (issue 20)", () => {
    const tree = ExpressionTree.create([
      "Differential",
      ["Add", "u", ["InvisibleOperator", "P", "v"]],
    ] as MJ);
    const diffId = tree.rootId;
    expect(diffId).toBeTruthy();
    expect(mathPadFacade.canExpand(tree, { kind: "node", nodeId: diffId })).toBe(true);

    const result = expandSubexpression(tree, diffId);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\mathrm{d}{u} + \mathrm{d}{P} v + P \mathrm{d}{v}`
    );
  });
});
