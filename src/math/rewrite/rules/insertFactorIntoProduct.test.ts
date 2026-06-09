import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { sym } from "../../ast";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { insertFactorIntoProduct } from "./insertFactorIntoProduct";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("insertFactorIntoProduct", () => {
  it("replaces a multiplicative identity side with the payload", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const rule = insertFactorIntoProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n6" },
        payload: sym("a"),
        destinationId: "n7",
        destinationSlot: "after",
      },
      {
        sideId: "n7",
        sideNode: document.index.nodeById.n7!,
        destinationId: "n7",
        destinationNode: document.index.nodeById.n7!,
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe("a");
    expect(result?.insertionPreview?.containerKind).toBe("multiply");
  });

  it("inserts a factor into an existing product", () => {
    const document = buildDocument("F=m b");
    const rule = insertFactorIntoProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n2" },
        payload: sym("a"),
        destinationId: "n5",
        destinationSlot: "before",
      },
      {
        sideId: "n3",
        sideNode: document.index.nodeById.n3!,
        destinationId: "n5",
        destinationNode: document.index.nodeById.n5!,
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe("m a b");
  });

  it("inserts a factor into an existing fraction numerator", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c} = 5`);
    const rule = insertFactorIntoProduct();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n7" },
        payload: sym("b"),
        destinationId: "n4",
        destinationSlot: "after",
      },
      {
        sideId: "n3",
        sideNode: document.index.nodeById.n3!,
        destinationId: "n4",
        destinationNode: document.index.nodeById.n4!,
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{b}{a}`);
    expect(result?.insertionPreview?.containerId).toBe("n4");
    expect(result?.insertionPreview?.destinationId).toBe("n4");
  });
});
