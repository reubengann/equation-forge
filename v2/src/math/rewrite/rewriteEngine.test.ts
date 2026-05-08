import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { findPath, RulesPipeline } from "./rewriteEngine";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("RulesPipeline", () => {
  it("rejects move if the selection is the same as the destination", () => {
    const document = buildDocument(String.raw`a+b`);
    const result = new RulesPipeline(
      document,
      [],
      { kind: "single", nodeId: "n1" },
      "n1",
      "additive",
    ).canMove();
    expect(result).toBe(false);
  });
});

describe("treeTools", () => {
  it("finds the pivot", () => {
    const document = buildDocument(String.raw`a+b`);
    const path = findPath(document, "n2", "n3");
    expect(path).toEqual({
      pivotId: "n1", //sum
      upNodes: ["n2"], // a
      downNodes: ["n3"], // b
    });
  });
});
