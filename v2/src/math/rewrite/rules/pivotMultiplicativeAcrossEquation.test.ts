import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { sym } from "../../ast";
import { pivotMultiplicativeAcrossEquation } from "./pivotMultiplicativeAcrossEquation";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("pivotMultiplicativeAcrossEquation", () => {
  it("converts payload to a reciprocal when crossing an equation pivot", () => {
    const document = buildDocument("F=m a");
    const rule = pivotMultiplicativeAcrossEquation();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: sym("a"),
        destinationId: "n2",
      },
      {
        pivotId: "n1",
        pivotNode: document.index.nodeById.n1!,
        sourceBranchId: "n3",
        destinationBranchId: "n2",
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe(String.raw`\frac{1}{a}`);
  });

  it("converts a reciprocal payload back to its denominator when crossing an equation pivot", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const rule = pivotMultiplicativeAcrossEquation();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n6" },
        payload: { kind: "divide", numerator: { kind: "number", value: 1 }, denominator: sym("a") },
        destinationId: "n7",
      },
      {
        pivotId: "n1",
        pivotNode: document.index.nodeById.n1!,
        sourceBranchId: "n2",
        destinationBranchId: "n7",
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe("a");
  });
});
