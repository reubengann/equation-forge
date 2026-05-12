import { describe, expect, it } from "vitest";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { parseLatexToExpr } from "../../adapters/latex/parseLatexToExpr";
import { rearrangeFactorsInProduct } from "./rearrangeFactorsInProduct";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

const rule = rearrangeFactorsInProduct();

describe("rearrangeFactorsInProduct", () => {
  it("allows reordering when selected/destination are different factors", () => {
    const document = buildDocument("a b");
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

  it("moves selected factor before destination factor", () => {
    const document = buildDocument("a b");
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
    expect(result?.updatedNode.kind).toBe("multiply");
    if (result?.updatedNode.kind !== "multiply") throw new Error("Expected multiply node");
    expect(result.updatedNode.factors[0]?.kind).toBe("symbol");
    expect(result.updatedNode.factors[1]?.kind).toBe("symbol");
    expect((result.updatedNode.factors[0] as { name?: string }).name).toBe("b");
    expect((result.updatedNode.factors[1] as { name?: string }).name).toBe("a");
  });

  it("moves selected factor after destination factor when destinationSlot is after", () => {
    const document = buildDocument("a b c");
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
    if (result?.updatedNode.kind !== "multiply") throw new Error("Expected multiply node");
    expect((result.updatedNode.factors[0] as { name?: string }).name).toBe("a");
    expect((result.updatedNode.factors[1] as { name?: string }).name).toBe("c");
    expect((result.updatedNode.factors[2] as { name?: string }).name).toBe("b");
  });
});
