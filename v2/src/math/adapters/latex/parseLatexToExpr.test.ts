import { describe, expect, it } from "vitest";
import type { Expr } from "../../ast";
import { parseLatexToExpr } from "./parseLatexToExpr";

function expectExprKind<K extends Expr["kind"]>(
  expr: Expr,
  kind: K,
): asserts expr is Extract<Expr, { kind: K }> {
  if (expr.kind !== kind) {
    const error = new Error(
      `Expected expr.kind to be "${kind}" but received "${expr.kind}"`,
    );
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (
        targetObject: object,
        constructorOpt?: Function,
      ) => void;
    };
    if (ErrorWithCapture.captureStackTrace) {
      ErrorWithCapture.captureStackTrace(error, expectExprKind);
    }
    throw error;
  }
}

describe("parseLatexToExpr", () => {
  it("parses latex through compute engine and returns internal AST", () => {
    const expr = parseLatexToExpr(String.raw`a+b=c`);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expect(expr.sides[0]?.kind).toBe("add");
  });

  it("stays on internal AST at the adapter boundary", () => {
    const expr = parseLatexToExpr(String.raw`x^2`);
    expectExprKind(expr, "power");
    expectExprKind(expr.base, "symbol");
    expect(expr.base.name).toBe("x");
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

  it("parses inferred differentials", () => {
    const expr = parseLatexToExpr(String.raw`dx`);
    expectExprKind(expr, "differential");
    expectExprKind(expr.variable, "symbol");
    expect(expr.variable.name).toBe("x");
  });

  it("does not assume differential when whitespace is present", () => {
    const expr = parseLatexToExpr(String.raw`d x`);
    expectExprKind(expr, "multiply");
    expectExprKind(expr.factors[0]!, "symbol");
    expect(expr.factors[0]!.name).toBe("d");
  });

  it("parses differential of an expression in parentheses", () => {
    const expr = parseLatexToExpr(String.raw`d(x+y)`);
    expectExprKind(expr, "differential");
    expectExprKind(expr.variable, "display_group");
    expectExprKind(expr.variable.expression, "add");
  });

  it("parses product that is not a differential", () => {
    const expr = parseLatexToExpr(String.raw`d (x+y)`);
    expectExprKind(expr, "multiply");
  });

  it("Handles uniterated integrals", () => {
    const expr = parseLatexToExpr(String.raw`\int ds`);
    expectExprKind(expr, "uniterated_integral");
    expectExprKind(expr.integrand, "differential");
  });

  it("Handles uniterated integrals of product", () => {
    const expr = parseLatexToExpr(String.raw`\int (x + y) ds`);
    expectExprKind(expr, "uniterated_integral");
    expectExprKind(expr.integrand, "multiply");
  });

  it("Handles uniterated integrals of product with mixed differentials", () => {
    const expr = parseLatexToExpr(
      String.raw`\int (\mathrm{d}{x} + \mathrm{d}{y}) ds`,
    );
    expectExprKind(expr, "uniterated_integral");
    expectExprKind(expr.integrand, "add");
  });

  it("Handles closed integrals", () => {
    const expr = parseLatexToExpr(String.raw`\oint ds`);
    expectExprKind(expr, "closed_integral");
  });

  it("Handles multiple integrals", () => {
    const expr = parseLatexToExpr(String.raw`\iint ds`);
    expectExprKind(expr, "multiple_integral");
    expectExprKind(expr.integrand, "differential");
    expect(expr.order).toBe(2);
  });

  it("Handles multiple integrals of product", () => {
    const expr = parseLatexToExpr(String.raw`\int \int dx dy`);
    expectExprKind(expr, "integral");
    expectExprKind(expr.integrand, "integral");
  });

  it("Handles text", () => {
    const expr = parseLatexToExpr(String.raw`x = \text{some text}`);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    expectExprKind(expr.sides[1], "text");
    expect(expr.sides[1].text).toBe("some text");
  });

  it("parses text containing embedded math delimiters as text", () => {
    const expr = parseLatexToExpr(String.raw`a + \text{some $x + y$ stuff}`);
    expectExprKind(expr, "add");
    expect(expr.terms).toHaveLength(2);
    expectExprKind(expr.terms[0], "symbol");
    expect(expr.terms[0].name).toBe("a");
    expectExprKind(expr.terms[1], "text");
    expect(expr.terms[1].text).toBe("some $x + y$ stuff");
  });

  it("parses absolute value", () => {
    const expr = parseLatexToExpr(String.raw`|x + b|`);
    expectExprKind(expr, "absolute_value");
    expectExprKind(expr.value, "add");
  });

  it("parses vectors", () => {
    const expr = parseLatexToExpr(String.raw`\vec{x}`);
    expectExprKind(expr, "vector");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
  });

  it("parses hat", () => {
    const expr = parseLatexToExpr(String.raw`\hat{x}`);
    expectExprKind(expr, "hat");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
  });

  it("parses dot product", () => {
    const expr = parseLatexToExpr(String.raw`\vec{v} \cdot b \vec{w}`);
    expectExprKind(expr, "inner_product");
    expectExprKind(expr.factors[0], "vector");
    expectExprKind(expr.factors[1], "multiply");
  });

  it("parses cross product", () => {
    const expr = parseLatexToExpr(String.raw`a \vec{v} \times \vec{w}`);
    expectExprKind(expr, "outer_product");
    expectExprKind(expr.factors[0], "multiply");
    expectExprKind(expr.factors[1], "vector");
  });

  it("parses dotted symbols", () => {
    const expr = parseLatexToExpr(String.raw`\dot{x}`);
    expectExprKind(expr, "dotted_expr");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
    expect(expr.order).toBe(1);
  });

  it("parses multiple dotted symbols", () => {
    const expr = parseLatexToExpr(String.raw`\ddot{x}`);
    expectExprKind(expr, "dotted_expr");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
    expect(expr.order).toBe(2);
  });

  it("parses double dotted vector", () => {
    const expr = parseLatexToExpr(String.raw`\ddot{\vec{x}}`);
    expectExprKind(expr, "dotted_expr");
    expectExprKind(expr.value, "vector");
    expect(expr.order).toBe(2);
  });

  it("parses primed symbols", () => {
    const expr = parseLatexToExpr(String.raw`x'`);
    expectExprKind(expr, "primed");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
    expect(expr.order).toBe(1);
  });

  it("parses multiple primed symbols", () => {
    const expr = parseLatexToExpr(String.raw`x''`);
    expectExprKind(expr, "primed");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("x");
    expect(expr.order).toBe(2);
  });

  it("parses primed symbols with product", () => {
    const expr = parseLatexToExpr(String.raw`a x'`);
    expectExprKind(expr, "multiply");
    expectExprKind(expr.factors[1], "primed");
    expect(expr.factors[1].name).toBe("x");
    expect(expr.factors[1].order).toBe(1);
  });

  it("parses script", () => {
    const expr = parseLatexToExpr(String.raw`\mathscr{H}`);
    expectExprKind(expr, "special_font");
    expectExprKind(expr.value, "symbol");
    expect(expr.value.name).toBe("H");
    expect(expr.font).toBe("script");
  });

  it("parses calligraphic", () => {
    const expr = parseLatexToExpr(String.raw`\mathcal{H}`);
    expectExprKind(expr, "special_font");
    expectExprKind(expr.value, "symbol");
    expect(expr.font).toBe("calligraphic");
    expect(expr.value.name).toBe("H");
  });

  it("parses bb", () => {
    const expr = parseLatexToExpr(String.raw`\mathbb{H}`);
    expectExprKind(expr, "special_font");
    expectExprKind(expr.value, "symbol");
    expect(expr.font).toBe("blackboard");
    expect(expr.value.name).toBe("H");
  });

  it("parses logarithm", () => {
    const expr = parseLatexToExpr(String.raw`\log(x)`);
    expectExprKind(expr, "call");
    expectExprKind(expr.callee, "symbol");
    expect(expr.callee.name).toBe("log");
  });

  it("parses natural logarithm", () => {
    const expr = parseLatexToExpr(String.raw`\ln(x)`);
    expectExprKind(expr, "call");
    expectExprKind(expr.callee, "symbol");
    expect(expr.callee.name).toBe("ln");
  });

  it("parses exp", () => {
    const expr = parseLatexToExpr(String.raw`\exp(x)`);
    expectExprKind(expr, "call");
    expectExprKind(expr.callee, "symbol");
    expect(expr.callee.name).toBe("exp");
  });

  it("parses big sum", () => {
    const expr = parseLatexToExpr(String.raw`\sum_{i=1}^{n} x_{i}`);
    expectExprKind(expr, "big_sum");
    expectExprKind(expr.summand, "symbol");
    expect(expr.summand.name).toBe("x_i");
    expectExprKind(expr.lowerBound, "number");
    expect(expr.lowerBound.value).toBe(1);
    expectExprKind(expr.upperBound!, "symbol");
    expect(expr.upperBound!.name).toBe("n");
  });

  it("parses big sum", () => {
    const expr = parseLatexToExpr(
      String.raw`\sum_{i \neq j} \left(\frac{x_{i}}{2}\right)`,
    );
    expectExprKind(expr, "big_sum");
    expectExprKind(expr.summand, "divide");
    expectExprKind(expr.lowerBound, "immutable_expression");
    expect(expr.lowerBound.latex).toBe("i \\neq j");
    expect(expr.upperBound).toBe(null);
  });

  it("parses big sum no limits", () => {
    const expr = parseLatexToExpr(
      String.raw`\sum \left(\frac{x_{i}}{2}\right)`,
    );
    expectExprKind(expr, "big_sum");
    expectExprKind(expr.summand, "divide");
    expect(expr.lowerBound).toBe(null);
    expect(expr.upperBound).toBe(null);
  });

  it("parses big prod", () => {
    const expr = parseLatexToExpr(
      String.raw`\prod_{i \neq j} \left(\frac{x_{i}}{2}\right)`,
    );
    expectExprKind(expr, "big_prod");
    expectExprKind(expr.muliplicand, "divide");
    expectExprKind(expr.lowerBound, "immutable_expression");
    expect(expr.lowerBound.latex).toBe("i \\neq j");
    expect(expr.upperBound).toBe(null);
  });

  it("parses big prod with no limits", () => {
    const expr = parseLatexToExpr(
      String.raw`\prod \left(\frac{x_{i}}{2}\right)`,
    );
    expectExprKind(expr, "big_prod");
    expectExprKind(expr.muliplicand, "divide");
    expect(expr.lowerBound).toBe(null);
    expect(expr.upperBound).toBe(null);
  });

  it("handles equalities with more than two sides", () => {
    const expr = parseLatexToExpr(String.raw`a = b = c`);
    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(3);
    expectExprKind(expr.sides[0], "symbol");
    expect(expr.sides[0].name).toBe("a");
    expectExprKind(expr.sides[1], "symbol");
    expect(expr.sides[1].name).toBe("b");
    expectExprKind(expr.sides[2], "symbol");
    expect(expr.sides[2].name).toBe("c");
  });

  it("handles inequalities", () => {
    for (const [latex, operator] of [
      [String.raw`a + b \geq c + d`, "geq"],
      [String.raw`a + b \leq c + d`, "leq"],
      [String.raw`a + b > c + d`, "gt"],
      [String.raw`a + b < c + d`, "lt"],
    ]) {
      const expr = parseLatexToExpr(latex);
      expectExprKind(expr, "inequality");
      expect(expr.operator).toBe(operator);
      expectExprKind(expr.lhs, "add");
      expectExprKind(expr.rhs, "add");
    }
  });

  it("handles square roots", () => {
    const expr = parseLatexToExpr(String.raw`\sqrt{x^2 + y^2}`);
    expectExprKind(expr, "root");
    expect(expr.degree).toBe(2);
    expectExprKind(expr.value, "add");
  });

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
