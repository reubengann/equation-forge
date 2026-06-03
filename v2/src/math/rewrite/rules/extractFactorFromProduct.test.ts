import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractFactorFromProduct } from "./extractFactorFromProduct";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("extractFactorFromProduct", () => {
  it("extracts a selected factor from a product", () => {
    const document = buildDocument("F=m a");
    const rule = extractFactorFromProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n5",
        parentId: "n3",
        childNode: document.index.nodeById.n5!,
        parentNode: document.index.nodeById.n3!,
        isFinalUpwardEdge: true,
        pivotId: "n3",
      },
    );

    expect(result?.updatedNodeId).toBe("n3");
    expect(exprToLatex(result!.payload!, false)).toBe("a");
    expect(exprToLatex(result!.updatedNode!, false)).toBe("m");
  });

  it("extracts a selected factor inside a negated product factor without moving the sign", () => {
    const document = buildDocument(String.raw`P \left(-v_0 \kappa \mathrm{d}{P}\right)`);
    const rule = extractFactorFromProduct();
    const selectedNodeId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.kind === "symbol" && expr.name === "v_0",
    )?.[0];
    expect(selectedNodeId).toBeDefined();
    const parentId = document.index.parentById[selectedNodeId!];
    expect(parentId).toBeDefined();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: selectedNodeId! },
        payload: null,
        destinationId: "n1",
      },
      {
        childId: selectedNodeId!,
        parentId: parentId!,
        childNode: document.index.nodeById[selectedNodeId!]!,
        parentNode: document.index.nodeById[parentId!]!,
        isFinalUpwardEdge: false,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe("v_0");
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`-\kappa \mathrm{d}{P}`);
  });

  it("does not extract a selected term from a sum as a factor", () => {
    const document = buildDocument("a + b = c");
    const rule = extractFactorFromProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n4" },
        payload: null,
        destinationId: "n5",
      },
      {
        childId: "n4",
        parentId: "n2",
        childNode: document.index.nodeById.n4!,
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: true,
        pivotId: "n2",
      },
    );

    expect(result).toBeNull();
  });

  it("does not extract a bare one from an equation side as a factor", () => {
    const document = buildDocument(String.raw`\frac{a}{c} = 1`);
    const rule = extractFactorFromProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n5",
        parentId: "n1",
        childNode: document.index.nodeById.n5!,
        parentNode: document.index.nodeById.n1!,
        isFinalUpwardEdge: true,
        pivotId: "n1",
      },
    );

    expect(result).toBeNull();
  });
});
