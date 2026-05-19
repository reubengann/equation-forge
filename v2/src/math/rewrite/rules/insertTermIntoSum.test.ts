import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { negate, sym } from "../../ast";
import { insertTermIntoSum } from "./insertTermIntoSum";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("insertTermIntoSum", () => {
  it("materializes a destination side as a sum", () => {
    const document = buildDocument("a+b=c");
    const rule = insertTermIntoSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n4" },
        payload: negate(sym("b")),
        destinationId: "n5",
        destinationSlot: "after",
      },
      {
        sideId: "n5",
        sideNode: document.index.nodeById.n5!,
        destinationId: "n5",
        destinationNode: document.index.nodeById.n5!,
      },
    );

    expect(result?.insertionPreview).toMatchObject({
      containerId: "n5",
      destinationId: "n5",
      destinationSlot: "after",
    });
    expect(exprToLatex(result!.updatedNode!, false)).toBe("c + -b");
  });

  it("inserts payload before a term in an existing sum", () => {
    const document = buildDocument("a=b+c");
    const rule = insertTermIntoSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n2" },
        payload: negate(sym("a")),
        destinationId: "n4",
        destinationSlot: "before",
      },
      {
        sideId: "n3",
        sideNode: document.index.nodeById.n3!,
        destinationId: "n4",
        destinationNode: document.index.nodeById.n4!,
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe("-a + b + c");
  });
});
