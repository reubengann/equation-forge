import { describe, expect, it } from "vitest";
import type { Expr } from "../../ast";
import { parseLatexToExpr } from "./parseLatexToExpr";

function expectExprKind<K extends Expr["kind"]>(
  expr: Expr,
  kind: K,
): asserts expr is Extract<Expr, { kind: K }> {
  if (expr.kind !== kind) {
    const error = new Error(`Expected expr.kind to be "${kind}" but received "${expr.kind}"`);
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
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
    expectExprKind(addTerms[1], "multiply");
    expect(addTerms[1].sign).toBe(-1);
    expect(addTerms[1].factors).toHaveLength(2);
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

  it("parses MathLive lbrack and rbrack macros as bracket grouping", () => {
    const expr = parseLatexToExpr(String.raw`g\left\lbrack a+b\right\rbrack`);

    expectExprKind(expr, "multiply");
    expectExprKind(expr.factors[1], "display_group");
    expect(expr.factors[1].delimiter).toBe("bracket");
    expectExprKind(expr.factors[1].expression, "add");
  });

  it("parses escaped brace grouping as a delimiter", () => {
    const expr = parseLatexToExpr(String.raw`g\left\{c\right\}`);

    expectExprKind(expr, "multiply");
    expectExprKind(expr.factors[1], "display_group");
    expect(expr.factors[1].delimiter).toBe("brace");
    expectExprKind(expr.factors[1].expression, "symbol");
    expect(expr.factors[1].expression.name).toBe("c");
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
    const expr = parseLatexToExpr(String.raw`\int (\mathrm{d}{x} + \mathrm{d}{y}) ds`);
    expectExprKind(expr, "uniterated_integral");
    expectExprKind(expr.integrand, "multiply");
    expectExprKind(expr.integrand.factors[0], "display_group");
    expectExprKind(expr.integrand.factors[1], "differential");
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
    expectExprKind(expr, "uniterated_integral");
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

  it("parses primed differential variables", () => {
    const expr = parseLatexToExpr(String.raw`\mathrm{d}{T'}`);
    expectExprKind(expr, "differential");
    expectExprKind(expr.variable, "primed");
    expectExprKind(expr.variable.value, "symbol");
    expect(expr.variable.value.name).toBe("T");
    expect(expr.variable.order).toBe(1);
  });

  it("parses MathLive prime exponents as primed differential variables", () => {
    const expr = parseLatexToExpr(String.raw`\mathrm{d}{T}^{\prime}`);
    expectExprKind(expr, "differential");
    expectExprKind(expr.variable, "primed");
    expectExprKind(expr.variable.value, "symbol");
    expect(expr.variable.value.name).toBe("T");
    expect(expr.variable.order).toBe(1);
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
    expectExprKind(expr.lowerBound!, "number");
    expect(expr.lowerBound.value).toBe(1);
    expectExprKind(expr.upperBound!, "symbol");
    expect(expr.upperBound!.name).toBe("n");
  });

  it("parses big sum", () => {
    const expr = parseLatexToExpr(String.raw`\sum_{i \neq j} \left(\frac{x_{i}}{2}\right)`);
    expectExprKind(expr, "big_sum");
    expectExprKind(expr.summand, "divide");
    expectExprKind(expr.lowerBound!, "immutable_expression");
    expect(expr.lowerBound.latex).toBe("i \\neq j");
    expect(expr.upperBound).toBe(null);
  });

  it("parses big sum no limits", () => {
    const expr = parseLatexToExpr(String.raw`\sum \left(\frac{x_{i}}{2}\right)`);
    expectExprKind(expr, "big_sum");
    expectExprKind(expr.summand, "divide");
    expect(expr.lowerBound).toBe(null);
    expect(expr.upperBound).toBe(null);
  });

  it("parses big prod", () => {
    const expr = parseLatexToExpr(String.raw`\prod_{i \neq j} \left(\frac{x_{i}}{2}\right)`);
    expectExprKind(expr, "big_prod");
    expectExprKind(expr.muliplicand, "divide");
    expectExprKind(expr.lowerBound!, "immutable_expression");
    expect(expr.lowerBound.latex).toBe("i \\neq j");
    expect(expr.upperBound).toBe(null);
  });

  it("parses big prod with no limits", () => {
    const expr = parseLatexToExpr(String.raw`\prod \left(\frac{x_{i}}{2}\right)`);
    expectExprKind(expr, "big_prod");
    expectExprKind(expr.muliplicand, "divide");
    expect(expr.lowerBound).toBe(null);
    expect(expr.upperBound).toBe(null);
  });

  it("parses limits with lower bounds", () => {
    const expr = parseLatexToExpr(String.raw`\lim_{x \to 0} \frac{\sin x}{x}`);
    expectExprKind(expr, "limit");
    expectExprKind(expr.lowerBound!, "immutable_expression");
    expect(expr.lowerBound.latex).toBe(String.raw`x \to 0`);
    expectExprKind(expr.expression, "divide");
  });

  it("parses limits without lower bounds", () => {
    const expr = parseLatexToExpr(String.raw`\lim f(x)`);
    expectExprKind(expr, "limit");
    expect(expr.lowerBound).toBe(null);
    expectExprKind(expr.expression, "multiply");
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
    const expr = parseLatexToExpr(String.raw`\frac{\partial^{2}{s}}{\partial{P}^2}`);
    expectExprKind(expr, "second_order_partial_derivative");
    expect(expr.degree).toBe(2);
    expectExprKind(expr.dependentVariable, "symbol");
    expect(expr.dependentVariable.name).toBe("s");
    expect(expr.independentVariables).toHaveLength(1);
    expectExprKind(expr.independentVariables[0], "symbol");
    expect(expr.independentVariables[0].name).toBe("P");
  });

  it("parses mixed second order partial derivatives", () => {
    const expr = parseLatexToExpr(String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`);
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
      String.raw`\left(\partial{s}/\partial{T}\right)_{P} = \frac{c_{P}}{T}`,
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

  it("parses pasted MathLive inline partials at constant quantity", () => {
    const expr = parseLatexToExpr(
      String.raw`\frac{\mathrm{d}{T}}{T} = \frac{\left(\partial{P}/\partial{\theta}\right)_{v}}{\left(P + \left(\partial{u}/\partial{v}\right)_{\theta}\right)} \, \mathrm{d}{\theta}`,
    );

    expectExprKind(expr, "equation");
    expect(expr.sides).toHaveLength(2);
    const rhs = expr.sides[1];
    expectExprKind(rhs, "multiply");
    const fraction = rhs.factors.find((factor) => factor.kind === "divide");
    expectExprKind(fraction, "divide");
    expectExprKind(fraction.numerator, "partial_at_const_quantity");
    expect(fraction.numerator.quantity).toMatchObject({ kind: "symbol", name: "P" });
    expect(fraction.numerator.variable).toMatchObject({ kind: "symbol", name: String.raw`\theta` });
    expect(fraction.numerator.constantQuantity).toMatchObject({ kind: "symbol", name: "v" });

    expectExprKind(fraction.denominator, "display_group");
    expectExprKind(fraction.denominator.expression, "add");
    const denominatorPartial = fraction.denominator.expression.terms.find((term) => term.kind === "partial_at_const_quantity");
    expectExprKind(denominatorPartial, "partial_at_const_quantity");
    expect(denominatorPartial.quantity).toMatchObject({ kind: "symbol", name: "u" });
    expect(denominatorPartial.variable).toMatchObject({ kind: "symbol", name: "v" });
    expect(denominatorPartial.constantQuantity).toMatchObject({ kind: "symbol", name: String.raw`\theta` });
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
    expectExprKind(rhs.integrand, "multiply");
    const trailing = rhs.integrand.factors[rhs.integrand.factors.length - 1];
    expectExprKind(trailing, "differential");
    expectExprKind(trailing.variable, "symbol");
    expect(trailing.variable.name).toBe("x");
  });

  it("does not include trailing additive terms in an integral body", () => {
    const expr = parseLatexToExpr(
      String.raw`s=\int_{T_0}^{T}\frac{a+b T}{T}\mathrm{d}{T}-R\ln\left(\frac{P}{P_0}\right)+s_0`,
    );

    expectExprKind(expr, "equation");
    const rhs = expr.sides[1];
    expectExprKind(rhs, "add");
    expect(rhs.terms).toHaveLength(3);
    expectExprKind(rhs.terms[0], "integral");
    expectExprKind(rhs.terms[0].integrand, "multiply");
    const trailing = rhs.terms[0].integrand.factors.at(-1);
    expectExprKind(trailing!, "differential");
    expect(rhs.terms[1]?.sign).toBe(-1);
    expectExprKind(rhs.terms[2], "symbol");
    expect(rhs.terms[2].name).toBe("s_0");
  });

  it("keeps grouped additive expressions inside an integral body", () => {
    const expr = parseLatexToExpr(String.raw`\int_{0}^{1}\left(2-a\right)\mathrm{d}{x}+b`);

    expectExprKind(expr, "add");
    expectExprKind(expr.terms[0], "integral");
    expectExprKind(expr.terms[0].integrand, "multiply");
    expectExprKind(expr.terms[0].integrand.factors[0], "display_group");
    expectExprKind(expr.terms[0].integrand.factors[0].expression, "add");
    expectExprKind(expr.terms[1], "symbol");
    expect(expr.terms[1].name).toBe("b");
  });

  it("parses integrals with unbraced roman differential variables", () => {
    const expr = parseLatexToExpr(String.raw`\int_{a}^{b}x\,\mathrm{d}x`);
    expectExprKind(expr, "integral");
    expectExprKind(expr.integrand, "multiply");
    const trailing = expr.integrand.factors[expr.integrand.factors.length - 1];
    expectExprKind(trailing, "differential");
    expectExprKind(trailing.variable, "symbol");
    expect(trailing.variable.name).toBe("x");
  });

  it("parses integrals with boundary groups before roman differential variables", () => {
    const expr = parseLatexToExpr(String.raw`\int_{a}^{b}x\,\mathrm{d}{}x`);
    expectExprKind(expr, "integral");
    expectExprKind(expr.integrand, "multiply");
    const trailing = expr.integrand.factors[expr.integrand.factors.length - 1];
    expectExprKind(trailing, "differential");
    expectExprKind(trailing.variable, "symbol");
    expect(trailing.variable.name).toBe("x");
  });

  it("parses MathLive differentialD variables", () => {
    const expr = parseLatexToExpr(String.raw`\int_{a}^{b}x\,\differentialD x`);
    expectExprKind(expr, "integral");
    expectExprKind(expr.integrand, "multiply");
    const trailing = expr.integrand.factors[expr.integrand.factors.length - 1];
    expectExprKind(trailing, "differential");
    expectExprKind(trailing.variable, "symbol");
    expect(trailing.variable.name).toBe("x");
  });

  it("tracks differential slot for prefix differential integrals", () => {
    const expr = parseLatexToExpr(String.raw`\int_{0}^{2\pi} d\theta \sin\left(\theta\right)`);
    expectExprKind(expr, "integral");
    expectExprKind(expr.integrand, "multiply");
    expectExprKind(expr.integrand.factors[0], "differential");
    expectExprKind(expr.integrand.factors[0].variable, "symbol");
    expect(expr.integrand.factors[0].variable.name).toBe(String.raw`\theta`);
    expectExprKind(expr.integrand.factors[1], "call");
    expectExprKind(expr.integrand.factors[1].callee, "symbol");
    expect(expr.integrand.factors[1].callee.name).toBe("sin");
  });

  it("parses multi-digit numbers", () => {
    const expr = parseLatexToExpr(String.raw`10`);
    expectExprKind(expr, "number");
    expect(expr.value).toBe(10);
  });

  it("parses multi-digit numbers with decimal point", () => {
    const expr = parseLatexToExpr(String.raw`24.7`);
    expectExprKind(expr, "number");
    expect(expr.value).toBe(24.7);
  });

  it("parses divide as fraction", () => {
    const expr = parseLatexToExpr(String.raw`a / b`);
    expectExprKind(expr, "divide");
    expectExprKind(expr.numerator, "symbol");
    expect(expr.numerator.name).toBe("a");
    expectExprKind(expr.denominator, "symbol");
    expect(expr.denominator.name).toBe("b");
  });

  it("returns null on parse failure when configured", () => {
    const expr = parseLatexToExpr("", { onError: "null" });
    expect(expr).toBe(null);
  });

  it("throws a descriptive error on parse failure when configured", () => {
    expect(() => parseLatexToExpr("", { onError: "throw" })).toThrow(/Unable to parse LaTeX/);
    expect(() => parseLatexToExpr("", { onError: "throw" })).toThrow(/Input LaTeX is empty/);
  });

  it("falls back to immutable expression by default", () => {
    const expr = parseLatexToExpr("");
    expectExprKind(expr, "immutable_expression");
    expect(expr.latex).toBe("");
  });

  it("returns error when unmatched parentheses are present", () => {
    const expr = parseLatexToExpr(String.raw`(a + b`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe('Unclosed delimiter ( started at "(a + ...)');
  });

  it("returns error when unmatched trailing parentheses are present", () => {
    const expr = parseLatexToExpr(String.raw`a (`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe('Unclosed delimiter ( started at "(...)');
  });

  it("no error when mismatched delimiters are present", () => {
    const expr = parseLatexToExpr(String.raw`\left. sin(x)\right|_0^1`);
    expect(expr.error).toBe(null);
  });

  it("Does not accept multiple inequalities in a single expression", () => {
    const expr = parseLatexToExpr(String.raw`a < b > c`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe("Multiple inequalities found in expression. This is not supported.");
  });

  it("Does not accept equation and inequality in a single expression", () => {
    const expr = parseLatexToExpr(String.raw`a < b = c`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe("Equation and inequality found in expression. This is not supported.");
  });

  it("returns invalid input when unclosed fraction is present", () => {
    const expr = parseLatexToExpr(String.raw`\frac{a + b}{c + d`);
    expectExprKind(expr, "invalid_input");
    expect(expr.error).toBe('Unclosed fraction started at "\\frac{a + ...)');
  });

  it("rejects MathLive placeholders", () => {
    const expr = parseLatexToExpr(String.raw`\frac{\placeholder{}}{x}`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe(
      "Math entry still contains placeholders. Fill or remove every placeholder before accepting.",
    );
    expect(() => parseLatexToExpr(String.raw`\placeholder{}`, { onError: "throw" })).toThrow(
      /still contains placeholders/,
    );
  });

  it("preserves call argument delimiter", () => {
    for (const [latex, delimiter] of [
      [String.raw`\sin(x)`, "paren"],
      [String.raw`\cos x`, "bare"],
      [String.raw`\tan[x]`, "bracket"],
    ] as const) {
      const expr = parseLatexToExpr(latex);
      expectExprKind(expr, "call");
      expect(expr.delimiter).toBe(delimiter);
    }
  });

  it("correctly parses callee macro", () => {
    const expr = parseLatexToExpr(String.raw`\exp \mathscr{H}`);
    expectExprKind(expr, "call");
    expectExprKind(expr.callee, "symbol");
    expect(expr.callee.name).toBe("exp");
    expect(expr.delimiter).toBe("bare");
    expect(expr.args).toHaveLength(1);
    expectExprKind(expr.args[0], "special_font");
    expect(expr.args[0].font).toBe("script");
    expectExprKind(expr.args[0].value, "symbol");
    expect(expr.args[0].value.name).toBe("H");
  });

  it("parses powers on trig function macros", () => {
    const expr = parseLatexToExpr(String.raw`\sin^2x+\cos^2x`);
    expectExprKind(expr, "add");
    expect(expr.terms).toHaveLength(2);

    for (const [term, calleeName] of [
      [expr.terms[0], "sin"],
      [expr.terms[1], "cos"],
    ] as const) {
      expectExprKind(term, "power");
      expectExprKind(term.base, "call");
      expectExprKind(term.base.callee, "symbol");
      expect(term.base.callee.name).toBe(calleeName);
      expectExprKind(term.base.args[0], "symbol");
      expect(term.base.args[0].name).toBe("x");
      expectExprKind(term.exponent, "number");
      expect(term.exponent.value).toBe(2);
    }
  });

  it("rejects calls with mismatched delimiters", () => {
    const expr = parseLatexToExpr(String.raw`\sin(x]`);
    expectExprKind(expr, "immutable_expression");
    expect(expr.error).toBe(
      "function call sin started with delimiter ( but ends with ]. This is not supported.",
    );
  });

  it("parses Delta x as a single symbol", () => {
    const expr = parseLatexToExpr(String.raw`\Delta x`);
    expectExprKind(expr, "symbol");
    expect(expr.name).toBe(String.raw`\Delta x`);
  });

  it("parses Greek symbol macros as single symbols", () => {
    const expr = parseLatexToExpr(String.raw`\rho`);
    expectExprKind(expr, "symbol");
    expect(expr.name).toBe(String.raw`\rho`);
  });

  it("parses subscripted Greek symbol macros as single symbols", () => {
    const expr = parseLatexToExpr(String.raw`\mu_s`);
    expectExprKind(expr, "symbol");
    expect(expr.name).toBe(String.raw`\mu_s`);
  });

  it("parses full derivative operator with bare differential denominator", () => {
    const expr = parseLatexToExpr(String.raw`\frac{d}{dx} f g`);
    expectExprKind(expr, "full_derivative_operator");
    expectExprKind(expr.variable, "symbol");
    expect(expr.variable.name).toBe("x");
    expectExprKind(expr.operand, "multiply");
  });

  it("parses full derivative operator with MathLive roman differential syntax", () => {
    const expr = parseLatexToExpr(String.raw`\dfrac{\mathrm{d}}{\mathrm{d}{}x}\left(2x+1\right)`);
    expectExprKind(expr, "full_derivative_operator");
    expectExprKind(expr.variable, "symbol");
    expect(expr.variable.name).toBe("x");
    expectExprKind(expr.operand, "display_group");
    expectExprKind(expr.operand.expression, "add");
  });

  it("parses partial derivative operator", () => {
    const expr = parseLatexToExpr(String.raw`\frac{\partial}{\partial x} f`);
    expectExprKind(expr, "partial_derivative_operator");
    expectExprKind(expr.variable, "symbol");
    expect(expr.variable.name).toBe("x");
    expectExprKind(expr.operand, "symbol");
    expect(expr.operand.name).toBe("f");
  });
});
