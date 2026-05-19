import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { divide, num, sym } from "../../ast";
import { insertFactorIntoDenominator } from "./insertFactorIntoDenominator";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("insertFactorIntoDenominator", () => {
  it("inserts reciprocal payload as a denominator under the destination side", () => {
    const document = buildDocument("F=m a");
    const rule = insertFactorIntoDenominator();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: divide(num(1), sym("a")),
        destinationId: "n2",
        destinationSlot: "after",
      },
      {
        sideId: "n2",
        sideNode: document.index.nodeById.n2!,
        destinationId: "n2",
        destinationNode: document.index.nodeById.n2!,
      },
    );

    expect(result?.insertionPreview).toMatchObject({
      containerId: "n2",
      containerKind: "divide",
      destinationId: "n2",
      destinationSlot: "after",
      lineOrientation: "horizontal",
    });
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{F}{a}`);
  });
});
