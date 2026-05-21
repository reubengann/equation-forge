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

  it("inserts reciprocal payload into an existing fraction denominator", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c} = 5`);
    const rule = insertFactorIntoDenominator();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n8" },
        payload: divide(num(1), sym("c")),
        destinationId: "n5",
        destinationSlot: "after",
      },
      {
        sideId: "n3",
        sideNode: document.index.nodeById.n3!,
        destinationId: "n5",
        destinationNode: document.index.nodeById.n5!,
      },
    );

    expect(result?.insertionPreview).toMatchObject({
      containerId: "n3",
      containerKind: "divide",
      destinationId: "n5",
      destinationSlot: "after",
      lineOrientation: "horizontal",
    });
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{1}{a c}`);
  });

  it("inserts reciprocal payload under an existing product side", () => {
    const document = buildDocument("m v = V");
    const rule = insertFactorIntoDenominator();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: divide(num(1), sym("V")),
        destinationId: "n3",
        destinationSlot: "after",
      },
      {
        sideId: "n2",
        sideNode: document.index.nodeById.n2!,
        destinationId: "n3",
        destinationNode: document.index.nodeById.n3!,
      },
    );

    expect(result?.insertionPreview).toMatchObject({
      containerId: "n2",
      containerKind: "divide",
      destinationId: "n3",
      destinationSlot: "after",
      lineOrientation: "horizontal",
    });
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{m v}{V}`);
  });

  it("inserts reciprocal payload under any destination side shape", () => {
    const document = buildDocument("m + v = V");
    const rule = insertFactorIntoDenominator();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: divide(num(1), sym("V")),
        destinationId: "n3",
        destinationSlot: "after",
      },
      {
        sideId: "n2",
        sideNode: document.index.nodeById.n2!,
        destinationId: "n3",
        destinationNode: document.index.nodeById.n3!,
      },
    );

    expect(result?.insertionPreview).toMatchObject({
      containerId: "n2",
      containerKind: "divide",
      destinationId: "n3",
      destinationSlot: "after",
      lineOrientation: "horizontal",
    });
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{m + v}{V}`);
  });
});
