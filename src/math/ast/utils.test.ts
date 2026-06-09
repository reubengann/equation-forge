import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex/exprToLatex";
import { compileMathDocumentFromExpr } from "../compile/compileMathDocument";
import { add, num, power, sym } from ".";
import { replaceCompiledNode } from "./utils";

describe("replaceCompiledNode", () => {
  it("replaces a node using compiled child locations", () => {
    const document = compileMathDocumentFromExpr("", add([sym("a"), power(sym("b"), num(2))]));

    const nextExpr = replaceCompiledNode(document, "n4", sym("c"));

    expect(nextExpr).not.toBeNull();
    expect(exprToLatex(nextExpr!, false)).toBe("a + c^{2}");
    expect(exprToLatex(document.expr, false)).toBe("a + b^{2}");
  });

  it("can replace the root node", () => {
    const document = compileMathDocumentFromExpr("", add([sym("a"), sym("b")]));

    const nextExpr = replaceCompiledNode(document, "n1", sym("c"));

    expect(nextExpr).toEqual(sym("c"));
  });
});
