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

  it("wraps symbol in tags", () => {
    const expr = parseLatexToExpr("x");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{x}');
  });

  it("wraps sum", () => {
    const expr = parseLatexToExpr("a + b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} + \\htmlData{node-id="n3"}{b}}',
    );
  });

  it("can generate without tags", () => {
    const expr = parseLatexToExpr("a + b");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("a + b");
  });

  it("wraps product", () => {
    const expr = parseLatexToExpr("a b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} \\htmlData{node-id="n3"}{b}}',
    );
  });

  /* 
  \\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a}^{\\htmlData{node-id="n3"}{b}}}
  At the end are three closing braces:
  First } is for closing the argument of htmlData (n3)
  Second } is for the exponent a^{...} including the node-id
  Third } is for the overall power node (n1)
  */
  it("wraps power", () => {
    const expr = parseLatexToExpr("a^b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a}^{\\htmlData{node-id="n3"}{b}}}',
    );
  });

  it("wraps power without tags but does wrap with braces", () => {
    const expr = parseLatexToExpr("a^b");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("a^{b}");
  });

  it("wraps negate", () => {
    const expr = parseLatexToExpr("-a");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{-\\htmlData{node-id="n2"}{a}}',
    );
  });

  it("wraps divide as fraction", () => {
    const expr = parseLatexToExpr("a / b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\frac{\\htmlData{node-id="n2"}{a}}{\\htmlData{node-id="n3"}{b}}}',
    );
  });

  /*
  \\htmlData{node-id="n1"}{
    \\sqrt{
        \\htmlData{node-id="n2"}{
            \\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}
        }
     }
   }
  */
  it("wraps sqrt", () => {
    const expr = parseLatexToExpr(String.raw`\sqrt{a + b}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\sqrt{\\htmlData{node-id="n2"}{\\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}}}}',
    );
  });

  it("wraps sqrt with degree", () => {
    const expr = parseLatexToExpr(String.raw`\sqrt[3]{a + b}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\sqrt[3]{\\htmlData{node-id="n2"}{\\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}}}}',
    );
  });

  it("wraps equation", () => {
    const expr = parseLatexToExpr(String.raw`a = b`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} = \\htmlData{node-id="n3"}{b}}',
    );
  });
});
