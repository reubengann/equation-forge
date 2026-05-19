import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { sym } from "../../ast";
import { pivotAdditiveAcrossEquation } from "./pivotAdditiveAcrossEquation";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("pivotAdditiveAcrossEquation", () => {
  it("negates payload when crossing an equation pivot", () => {
    const document = buildDocument("a+b=c");
    const rule = pivotAdditiveAcrossEquation();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n4" },
        payload: sym("b"),
        destinationId: "n5",
      },
      {
        pivotId: "n1",
        pivotNode: document.index.nodeById.n1!,
        sourceBranchId: "n2",
        destinationBranchId: "n5",
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe("-b");
  });
});
