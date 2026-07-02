import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { sym } from "../../ast";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractNumeratorFromFraction } from "./extractNumeratorFromFraction";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

function firstNodeIdMatching(document: CompiledMathDocument, predicate: (expr: unknown) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  if (!entry) throw new Error("Unable to find matching node.");
  return entry[0];
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
        isFinalUpwardEdge: true,
        pivotId: "n2",
      },
    );

    expect(result?.updatedNodeId).toBe("n2");
    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`a \frac{1}{b}`);
  });

  it("places the numerator after the reciprocal denominator when dragged right", () => {
    const document = buildDocument(String.raw`\frac{a}{b} + c`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
        destinationSlot: "after",
      },
      {
        childId: "n3",
        parentId: "n2",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: true,
        pivotId: "n2",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{1}{b} a`);
    expect(result?.insertionPreview?.destinationSlot).toBe("after");
  });

  it("preserves a signed fraction sign when extracting the numerator locally", () => {
    const document = buildDocument(String.raw`-\frac{a}{b}`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n2" },
        payload: null,
        destinationId: "n1",
      },
      {
        childId: "n2",
        parentId: "n1",
        childNode: document.index.nodeById.n2!,
        parentNode: document.index.nodeById.n1!,
        isFinalUpwardEdge: true,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`-a \frac{1}{b}`);
  });

  it("returns reciprocal denominator plus numerator payload when continuing to an equation pivot", () => {
    const document = buildDocument(String.raw`\frac{F}{m a} = 1`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n7",
      },
      {
        childId: "n3",
        parentId: "n2",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: false,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{1}{m a}`);
    expect(exprToLatex(result!.payload!, false)).toBe("F");
    expect(result?.insertionPreview).toBeUndefined();
  });

  it("carries an existing payload through a fraction numerator", () => {
    const document = buildDocument(String.raw`\frac{m v}{V} = 1`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: sym("v"),
        destinationId: "n7",
      },
      {
        childId: "n3",
        parentId: "n2",
        childNode: sym("m"),
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: false,
        pivotId: "n1",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{m}{V}`);
    expect(exprToLatex(result!.payload!, false)).toBe("v");
    expect(result?.insertionPreview).toBeUndefined();
  });

  it("preserves a signed fraction sign when carrying an existing payload", () => {
    const document = buildDocument(String.raw`-\frac{m v}{V} = 1`);
    const rule = extractNumeratorFromFraction();
    const fractionId = firstNodeIdMatching(
      document,
      (expr) => typeof expr === "object" && expr !== null && "kind" in expr && expr.kind === "divide",
    );
    const numeratorId = document.index.childrenById[fractionId]?.[0];
    if (!numeratorId) throw new Error("Unable to find signed fraction numerator.");
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "unused" },
        payload: sym("v"),
        destinationId: "unused",
      },
      {
        childId: numeratorId,
        parentId: fractionId,
        childNode: sym("m"),
        parentNode: document.index.nodeById[fractionId]!,
        isFinalUpwardEdge: false,
        pivotId: "unused",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{m}{V}`);
    expect(exprToLatex(result!.payload!, false)).toBe("-v");
    expect(result?.insertionPreview).toBeUndefined();
  });

  it("extracts an existing payload out of a fraction numerator locally", () => {
    const document = buildDocument(String.raw`\frac{m v}{V} = 1`);
    const rule = extractNumeratorFromFraction();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n5" },
        payload: sym("v"),
        destinationId: "n2",
        destinationSlot: "after",
      },
      {
        childId: "n3",
        parentId: "n2",
        childNode: sym("m"),
        parentNode: document.index.nodeById.n2!,
        isFinalUpwardEdge: true,
        pivotId: "n2",
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`\frac{m}{V} v`);
    expect(result?.payload).toBeUndefined();
    expect(result?.insertionPreview?.destinationSlot).toBe("after");
  });

  it("preserves a signed fraction sign when extracting an existing payload locally", () => {
    const document = buildDocument(String.raw`-\frac{m v}{V} = 1`);
    const rule = extractNumeratorFromFraction();
    const fractionId = firstNodeIdMatching(
      document,
      (expr) => typeof expr === "object" && expr !== null && "kind" in expr && expr.kind === "divide",
    );
    const numeratorId = document.index.childrenById[fractionId]?.[0];
    if (!numeratorId) throw new Error("Unable to find signed fraction numerator.");
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "unused" },
        payload: sym("v"),
        destinationId: fractionId,
        destinationSlot: "after",
      },
      {
        childId: numeratorId,
        parentId: fractionId,
        childNode: sym("m"),
        parentNode: document.index.nodeById[fractionId]!,
        isFinalUpwardEdge: true,
        pivotId: fractionId,
      },
    );

    expect(exprToLatex(result!.updatedNode!, false)).toBe(String.raw`-\frac{m}{V} v`);
    expect(result?.payload).toBeUndefined();
    expect(result?.insertionPreview?.destinationSlot).toBe("after");
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
        isFinalUpwardEdge: true,
        pivotId: "n2",
      },
    );

    expect(result).toBeNull();
  });
});

