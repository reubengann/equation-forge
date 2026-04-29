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
    expect(rhs.factors[1].delimiter).toBe("paren");
    expectExprKind(rhs.factors[1].expression, "add");
    const addTerms = rhs.factors[1].expression.terms;
    expect(addTerms).toHaveLength(2);
    expectExprKind(addTerms[0], "call");
    expectExprKind(addTerms[0].callee, "symbol");
    expect(addTerms[0].callee.name).toBe("sin");
    expectExprKind(addTerms[1], "negate");
    expectExprKind(addTerms[1].value, "multiply");
    expect(addTerms[1].value.factors).toHaveLength(2);
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

  /*       
      String.raw`\vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot m \ddot{\vec{r}}`,
      String.raw`s = \int_{T_{0}}^{T} \frac{c_{P}}{T} \,\mathrm{d}{T} - R \ln\left(\frac{\left|P\right|}{\left|P_{0}\right|}\right) + s_{0}`,
      String.raw`\sum_{i=1}^{n} i = \frac{n\left(n+1\right)}{2}`, */

  it("parses second order partial derivatives", () => {
    const expr = parseLatexToExpr(
      String.raw`\frac{\partial^{2}{s}}{\partial{P}^2}`,
    );
    expectExprKind(expr, "second_order_partial_derivative");
    expect(expr.degree).toBe(2);
    expectExprKind(expr.dependentVariable, "symbol");
    expect(expr.dependentVariable.name).toBe("s");
    expect(expr.independentVariables).toHaveLength(1);
    expectExprKind(expr.independentVariables[0], "symbol");
    expect(expr.independentVariables[0].name).toBe("P");
  });

  it("parses mixed second order partial derivatives", () => {
    const expr = parseLatexToExpr(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`,
    );
    expectExprKind(expr, "second_order_partial_derivative");
    expect(expr.degree).toBe(2);
    expectExprKind(expr.dependentVariable, "symbol");
    expect(expr.dependentVariable.name).toBe("s");
    expect(expr.independentVariables).toHaveLength(2);
    expectExprKind(expr.independentVariables[0], "symbol");
    expect(expr.independentVariables[0].name).toBe("P");
    expectExprKind(expr.independentVariables[1], "symbol");
    expect(expr.independentVariables[1].name).toBe("T");
  });

  it("parses partials at constant quantity", () => {
    for (const latex of [
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P} = \frac{c_{P}}{T}`,
      String.raw`\left(\dfrac{\partial{s}}{\partial{T}}\right)_{P} = \frac{c_{P}}{T}`,
    ]) {
      const expr = parseLatexToExpr(latex);
      expectExprKind(expr, "equation");
      expect(expr.sides).toHaveLength(2);
      const lhs = expr.sides[0];
      expectExprKind(lhs, "partial_at_const_quantity");
    }
  });

  it("parses regular partial derivatives", () => {
    const expr = parseLatexToExpr(String.raw`\frac{\partial{s}}{\partial{T}}`);
    expectExprKind(expr, "partial_derivative");
    expectExprKind(expr.quantity, "symbol");
    expect(expr.quantity.name).toBe("s");
    expectExprKind(expr.variable, "symbol");
    expect(expr.variable.name).toBe("T");
  });

  it("parses integrals", () => {
    const expr = parseLatexToExpr(
      String.raw`v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`,
    );
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    const rhs = expr.sides[1];
    expectExprKind(rhs, "integral");
    expectExprKind(rhs.lowerBound!, "number");
    expectExprKind(rhs.upperBound!, "symbol");
    expect(rhs.upperBound.name).toBe("x_0");
    expectExprKind(rhs.variable!, "symbol");
    expect(rhs.variable.name).toBe("x");
    expect(rhs.differentialSlot).toBe("suffix");
    expectExprKind(rhs.integrand, "multiply");
  });

  it("tracks differential slot for prefix differential integrals", () => {
    const expr = parseLatexToExpr(
      String.raw`\int_{0}^{2\pi} d\theta \sin\left(\theta\right)`,
    );
    expectExprKind(expr, "integral");
    expectExprKind(expr.variable!, "symbol");
    expect(expr.variable.name).toBe("theta");
    expect(expr.differentialSlot).toBe("prefix");
    expectExprKind(expr.integrand, "call");
    expectExprKind(expr.integrand.callee, "symbol");
    expect(expr.integrand.callee.name).toBe("sin");
  });
});
