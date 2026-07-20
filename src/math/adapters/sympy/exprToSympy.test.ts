import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../latex";
import { exprToSympy, tryExprToSympy } from "./exprToSympy";

describe("exprToSympy", () => {
  it("renders parsed algebra to SymPy calls", () => {
    const expr = parseLatexToExpr(String.raw`a + b = c`);

    expect(exprToSympy(expr)).toBe(
      'sympy.Eq(sympy.Add(sympy.Symbol("a"), sympy.Symbol("b")), sympy.Symbol("c"))',
    );
  });

  it("renders common functions and powers", () => {
    const expr = parseLatexToExpr(String.raw`\sin^2 x + \cos^2 x`);

    expect(exprToSympy(expr, { namespace: "sp" })).toBe(
      'sp.Add(sp.Pow(sp.sin(sp.Symbol("x")), sp.Integer("2")), sp.Pow(sp.cos(sp.Symbol("x")), sp.Integer("2")))',
    );
  });

  it("renders derivatives and integrals using the parsed AST", () => {
    const derivative = parseLatexToExpr(String.raw`\frac{\partial{s}}{\partial{T}}`);
    const integral = parseLatexToExpr(String.raw`\int_{0}^{1} x \,\mathrm{d}{x}`);

    expect(exprToSympy(derivative)).toBe('sympy.Derivative(sympy.Symbol("s"), sympy.Symbol("T"))');
    expect(exprToSympy(integral)).toBe(
      'sympy.Integral(sympy.Symbol("x"), (sympy.Symbol("x"), sympy.Integer("0"), sympy.Integer("1")))',
    );
  });

  it("returns structured issues for unsupported expression kinds", () => {
    const expr = parseLatexToExpr(String.raw`\vec{v} \cdot \vec{w}`);
    const result = tryExprToSympy(expr);

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          reason: "unsupported_expr_kind",
          exprKind: "inner_product",
        },
      ],
    });
  });
});
