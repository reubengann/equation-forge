import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "./parseLatexToExpr";
import { exprToLatex } from "./exprToLatex";

describe("exprToLatex", () => {
  it("wraps number in tags", () => {
    const expr = parseLatexToExpr("4");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{4}');
  });

  it("wraps number in tags 2", () => {
    const expr = parseLatexToExpr("24.7");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{24.7}');
  });
});
