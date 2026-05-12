import { describe, expect, it } from "vitest";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { rearrangeTermsInSum } from "./rearrangeTermsInSum";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

const rule = rearrangeTermsInSum();

describe("rearrangeTermsInSum", () => {
  it("allows reordering when selected/destination are different terms", () => {
    const document = buildDocument("a + b");
    expect(
      rule.canMove(
        {
          document,
          selection: { kind: "single", nodeId: "n2" },
          payload: null,
          destinationId: "n3",
          destinationSlot: "after",
          sourceContainerIndex: 0,
          destinationInsertionIndex: 1,
        },
        document.index.nodeById["n1"]!,
        document.index.nodeById["n2"]!,
        document.index.nodeById["n3"]!,
      ),
    ).toBe(true);
  });

  it("moves selected term before destination term", () => {
    const document = buildDocument("a + b");
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
        sourceContainerIndex: 1,
        destinationInsertionIndex: 0,
      },
      document.index.nodeById["n1"]!,
      document.index.nodeById["n3"]!,
      document.index.nodeById["n2"]!,
    );
    expect(result?.updatedNodeId).toBe("n1");
    expect(result?.updatedNode.kind).toBe("add");
    expect(exprToLatex(result!.updatedNode, false)).toBe("b + a");
    expect(exprToLatex(document.expr, false)).toBe("a + b");
    expect(result?.payload.kind).toBe("symbol");
    expect(exprToLatex(result!.payload, false)).toBe("b");
  });

  it("moves selected term after destination term when destinationSlot is after", () => {
    const document = buildDocument("a + b + c");
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "single", nodeId: "n4" }, // c
        payload: null,
        destinationId: "n2", // a
        destinationSlot: "after",
        sourceContainerIndex: 2,
        destinationInsertionIndex: 1,
      },
      document.index.nodeById["n1"]!,
      document.index.nodeById["n4"]!,
      document.index.nodeById["n2"]!,
    );
    expect(exprToLatex(result!.updatedNode, false)).toBe("a + c + b");
  });

  it("supports reorder inside larger sums", () => {
    const document = buildDocument("a + b + c");
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "single", nodeId: "n4" }, // c
        payload: null,
        destinationId: "n3",
        sourceContainerIndex: 2,
        destinationInsertionIndex: 1,
      },
      document.index.nodeById["n1"]!,
      document.index.nodeById["n4"]!,
      document.index.nodeById["n3"]!,
    );
    expect(result?.updatedNodeId).toBe("n1");
    expect(exprToLatex(result!.updatedNode, false)).toBe("a + c + b");
    expect(exprToLatex(document.expr, false)).toBe("a + b + c");
    expect(result?.payload.kind).toBe("symbol");
    expect(exprToLatex(result!.payload, false)).toBe("c");
  });

  it("rejects no-op move within same term", () => {
    const document = buildDocument("a - b");
    expect(
      rule.canMove(
        {
          document,
          selection: { kind: "single", nodeId: "n3" },
          payload: null,
          destinationId: "n3",
          sourceContainerIndex: 1,
          destinationInsertionIndex: 1,
        },
        document.index.nodeById["n1"]!,
        document.index.nodeById["n3"]!,
        document.index.nodeById["n3"]!,
      ),
    ).toBe(false);
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
        sourceContainerIndex: 1,
        destinationInsertionIndex: 0,
      },
      document.index.nodeById["n1"]!,
      document.index.nodeById["n3"]!,
      document.index.nodeById["n2"]!,
    );
    expect(result?.updatedNodeId).toBe("n1");
    expect(exprToLatex(result!.updatedNode, false)).toBe("-b + a");
    expect(result?.payload.kind).toBe("negate");
    expect(exprToLatex(result!.payload, false)).toBe("-b");
  });
});
