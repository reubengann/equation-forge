import { describe, expect, it } from "vitest";
import {
  compileMathDocumentFromExpr,
  printTree,
  type CompiledMathDocument,
} from "../../compile/compileMathDocument";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { upOutOfSum } from "./upOutOfSum";
import type { AddExpr } from "../../ast/expr";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

const rule = upOutOfSum();

describe("upOutOfSum", () => {
  it("reports it can move any node to a sum", () => {
    const document = buildDocument("a + b");
    expect(
      rule.canMove(
        { document, selection: { kind: "single", nodeId: "n2" }, payload: null, destinationId: "n3" },
        document.index.nodeById["n1"]!,
      ),
    ).toBe(true);
  });

  it("removes node from a sum to payload", () => {
    const document = buildDocument("a + b");
    const result = rule.executeMove(
      { document, selection: { kind: "single", nodeId: "n2" }, payload: null, destinationId: "n3" },
      document.index.nodeById["n1"]!,
    );
    expect(document.index.nodeById["n1"]!.kind).toBe("symbol");
    expect(exprToLatex(document.expr, false)).toBe("b");
    expect(result.payload.kind).toBe("symbol");
    expect(exprToLatex(result.payload, false)).toBe("a");
  });

  it("removes single node from a sum to payload", () => {
    const document = buildDocument("a + b + c");
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "single", nodeId: "n4" }, // c
        payload: null,
        destinationId: "n3",
      },
      document.index.nodeById["n1"]!,
    );
    expect((document.index.nodeById["n1"]! as AddExpr).terms).toHaveLength(2);
    expect(exprToLatex(document.expr, false)).toBe("a + b");
    expect(result.payload.kind).toBe("symbol");
    expect(exprToLatex(result.payload, false)).toBe("c");
  });

  it("removes multiple nodes from a sum to payload", () => {
    const document = buildDocument("a + b + c");
    const result = rule.executeMove(
      {
        document,
        selection: { kind: "multi", nodeIds: ["n2", "n4"], containerNodeId: "n1" },
        payload: null,
        destinationId: "n3",
      },
      document.index.nodeById["n1"]!,
    );
    expect(document.index.nodeById["n1"].kind).toBe("symbol");
    expect(exprToLatex(document.expr, false)).toBe("b");
    expect(result.payload.kind).toBe("add");
    expect(exprToLatex(result.payload, false)).toBe("a + c");
  });

  it("removes minus term", () => {
    const document = buildDocument("a - b");
    printTree(document);
    const result = rule.executeMove(
      { document, selection: { kind: "single", nodeId: "n3" }, payload: null, destinationId: "n2" },
      document.index.nodeById["n1"]!,
    );
    expect(exprToLatex(document.expr, false)).toBe("a");
    expect(result.payload.kind).toBe("negate");
  });
});
