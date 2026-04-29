import { describe, expect, it } from "vitest";
import type { Expr } from "../../ast";
import { parseLatexToExpr, parseLatexToMathJson } from "./parseLatexToExpr";

function expectExprKind<K extends Expr["kind"]>(
  expr: Expr,
  kind: K,
): asserts expr is Extract<Expr, { kind: K }> {
  expect(expr.kind).toBe(kind);
}

describe("parseLatexToExpr", () => {
  it("parses latex through compute engine and returns internal AST", () => {
    const expr = parseLatexToExpr(String.raw`a+b=c`);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expect(expr.sides[0]?.kind).toBe("add");
  });

  it("keeps mathjson at the adapter boundary", () => {
    const mathJson = parseLatexToMathJson(String.raw`x^2`);
    expect(Array.isArray(mathJson)).toBe(true);
    const expr = parseLatexToExpr(String.raw`x^2`);
    expectExprKind(expr, "power");
    expect(expr.kind).not.toBe("raw_mathjson");
  });

  it("parses sum on both sides", () => {
    const equation = String.raw`a + b = b + c`;
    const expr = parseLatexToExpr(equation);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expect(expr.sides[0]?.kind).toBe("add");
    expect(expr.sides[1]?.kind).toBe("add");
  });

  it("parses product on both sides", () => {
    const equation = String.raw`a b = b c`;
    const expr = parseLatexToExpr(equation);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expect(expr.sides[0]?.kind).toBe("multiply");
    expect(expr.sides[1]?.kind).toBe("multiply");
  });

  it("parses delimiters", () => {
    const equation = String.raw`0 = g \left(\sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)\right)`;
    const expr = parseLatexToExpr(equation);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expect(expr.sides[0]?.kind).toBe("number");
    expectExprKind(expr.sides[1], "multiply");
    let rhs = expr.sides[1];
    expect(rhs.factors).toHaveLength(2);
    expectExprKind(rhs.factors[0], "symbol");
    expect(rhs.factors[0].name).toBe("g");
    expectExprKind(rhs.factors[1], "display_group");
  });

  it("distinguishes parenthesis and bracket grouping", () => {
    const parenExpr = parseLatexToExpr(String.raw`g(a+b)`);
    const bracketExpr = parseLatexToExpr(String.raw`g[a+b]`);

    expectExprKind(parenExpr, "multiply");
    expectExprKind(bracketExpr, "multiply");

    expectExprKind(parenExpr.factors[1], "display_group");
    expectExprKind(bracketExpr.factors[1], "display_group");

    expect(parenExpr.factors[1].delimiter).toBe("paren");
    expect(bracketExpr.factors[1].delimiter).toBe("bracket");
  });
});
