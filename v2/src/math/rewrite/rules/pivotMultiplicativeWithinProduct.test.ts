import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { divide, num, sym } from "../../ast";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { pivotMultiplicativeWithinProduct } from "./pivotMultiplicativeWithinProduct";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("pivotMultiplicativeWithinProduct", () => {
  it("carries multiplicative payload unchanged across a product pivot", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c} = 5`);
    const rule = pivotMultiplicativeWithinProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n8" },
        payload: divide(num(1), sym("c")),
        destinationId: "n5",
      },
      {
        pivotId: "n2",
        pivotNode: document.index.nodeById.n2!,
        sourceBranchId: "n6",
        destinationBranchId: "n3",
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe(String.raw`\frac{1}{c}`);
  });
});
