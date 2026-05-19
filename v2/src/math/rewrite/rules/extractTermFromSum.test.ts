import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractTermFromSum } from "./extractTermFromSum";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("extractTermFromSum", () => {
  it("extracts a selected term from an additive container", () => {
    const document = buildDocument("a + b");
    const rule = extractTermFromSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n3",
        parentId: "n1",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n1!,
      },
    );

    expect(result?.updatedNodeId).toBe("n1");
    expect(exprToLatex(result!.payload!, false)).toBe("b");
    expect(exprToLatex(result!.updatedNode!, false)).toBe("a");
  });

  it("extracts a whole non-additive side as a payload", () => {
    const document = buildDocument("a=b+c");
    const rule = extractTermFromSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n2" },
        payload: null,
        destinationId: "n4",
      },
      {
        childId: "n2",
        parentId: "n1",
        childNode: document.index.nodeById.n2!,
        parentNode: document.index.nodeById.n1!,
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe("a");
    expect(exprToLatex(result!.updatedNode!, false)).toBe("0");
  });

  it("extracts multiple selected terms from an additive container", () => {
    const document = buildDocument("a + b + c");
    const rule = extractTermFromSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "multi", nodeIds: ["n2", "n3"], containerNodeId: "n1" },
        payload: null,
        destinationId: "n4",
      },
      {
        childId: "n2",
        parentId: "n1",
        childNode: document.index.nodeById.n2!,
        parentNode: document.index.nodeById.n1!,
      },
    );

    expect(exprToLatex(result!.payload!, false)).toBe("a + b");
    expect(exprToLatex(result!.updatedNode!, false)).toBe("c");
  });

  it("does not extract a bare zero from an equation side as a term", () => {
    const document = buildDocument("a = 0");
    const rule = extractTermFromSum();
    const result = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: "n3" },
        payload: null,
        destinationId: "n2",
      },
      {
        childId: "n3",
        parentId: "n1",
        childNode: document.index.nodeById.n3!,
        parentNode: document.index.nodeById.n1!,
      },
    );

    expect(result).toBeNull();
  });
});
