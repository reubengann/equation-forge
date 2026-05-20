import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractNumeratorFromFraction } from "./extractNumeratorFromFraction";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("extractNumeratorFromFraction", () => {
  it("extracts a selected numerator into a product with the reciprocal denominator", () => {
    const document = buildDocument(String.raw`\frac{a}{b} + c`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n3",
        parentId: "n2",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n2!,
      },
    );

    expect(result?.updatedNodeId).toBe("n2");
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`a \frac{1}{b}`);
  });

  it("does not extract a selected denominator as a numerator factor", () => {
    const document = buildDocument(String.raw`\frac{a}{b} + c`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n4" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n4",
        parentId: "n2",
        childNode: document.index.nodeById.n4!,
        parentNode: document.index.nodeById.n2!,
      },
    );

    expect(result).toBeNull();
  });
});

