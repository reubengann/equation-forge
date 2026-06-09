import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractDenominatorFactorFromFraction } from "./extractDenominatorFactorFromFraction";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("extractDenominatorFactorFromFraction", () => {
  it("extracts a selected denominator factor into a reciprocal product", () => {
    const document = buildDocument(String.raw`\frac{F}{m a} = 1`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n6" },
        payload: null,
        destinationId: "n2",
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

    expect(result?.updatedNodeId).toBe("n2");
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{F}{m} \frac{1}{a}`);
  });

  it("places the reciprocal before the remaining fraction when dragged left", () => {
    const document = buildDocument(String.raw`\frac{F}{m a} = 1`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: null,
        destinationId: "n2",
        destinationSlot: "before",
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

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{1}{m} \frac{F}{a}`);
    expect(result?.insertionPreview?.destinationSlot).toBe("before");
  });

  it("moves a signed fraction sign with the extracted reciprocal denominator factor", () => {
    const document = buildDocument(String.raw`-\frac{a b}{e f}`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n7" },
        payload: null,
        destinationId: "n1",
        destinationSlot: "before",
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

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`-\frac{1}{f} \frac{a b}{e}`);
  });

  it("returns remaining fraction plus reciprocal payload when continuing to an equation pivot", () => {
    const document = buildDocument(String.raw`\frac{F}{m a} = 1`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n6" },
        payload: null,
        destinationId: "n7",
      },
      {
        childId: "n4",
        parentId: "n2",
        childNode: document.index.nodeById.n4!,
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: false,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{F}{m}`);
    expect(exprToLatex(result!.payload!, false)).toBe(String.raw`\frac{1}{a}`);
    expect(result?.insertionPreview).toBeUndefined();
  });

  it("returns numerator plus reciprocal denominator payload when moving the whole denominator toward a pivot", () => {
    const document = buildDocument(String.raw`\frac{F}{m a} = 1`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n4" },
        payload: null,
        destinationId: "n7",
      },
      {
        childId: "n4",
        parentId: "n2",
        childNode: document.index.nodeById.n4!,
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: false,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe("F");
    expect(exprToLatex(result!.payload!, false)).toBe(String.raw`\frac{1}{m a}`);
    expect(result?.insertionPreview).toBeUndefined();
  });

  it("preserves a signed fraction sign when extracting the whole denominator locally", () => {
    const document = buildDocument(String.raw`-\frac{a}{b}`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n1",
        destinationSlot: "before",
      },
      {
        childId: "n3",
        parentId: "n1",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n1!,
        isFinalUpwardEdge: true,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`-\frac{1}{b} a`);
  });

  it("extracts a selected single-node denominator into a reciprocal product", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c} = 5`);
    const rule = extractDenominatorFactorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n8" },
        payload: null,
        destinationId: "n6",
        destinationSlot: "after",
      },
      {
        childId: "n8",
        parentId: "n6",
        childNode: document.index.nodeById.n8!,
        parentNode: document.index.nodeById.n6!,
        isFinalUpwardEdge: true,
        pivotId: "n6",
      },
    );

    expect(result?.updatedNodeId).toBe("n6");
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`b \frac{1}{c}`);
    expect(result?.insertionPreview?.destinationSlot).toBe("after");
  });
});

