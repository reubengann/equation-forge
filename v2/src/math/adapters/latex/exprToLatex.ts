import type { DelimiterKind, Expr } from "../../ast";

class LatexGenerator {
  readonly expr: Expr;
  nextId: number;
  tags: boolean;
  constructor(expr: Expr, tags: boolean) {
    this.expr = expr;
    this.nextId = 1;
    this.tags = tags;
  }

  wrap(latex: string, id: string): string {
    if (!this.tags) return latex;
    return String.raw`\htmlData{node-id="${id}"}{${latex}}`;
  }

  newId(): string {
    return `n${this.nextId++}`;
  }

  delimiterPair(delimiter: DelimiterKind): [string, string] {
    switch (delimiter) {
      case "paren":
        return ["(", ")"];
      case "bracket":
        return ["[", "]"];
      case "brace":
        return ["\\{", "\\}"];
      case "angle":
        return ["\\langle", "\\rangle"];
      case "other":
        return [".", "."];
    }
  }

  generate(expr?: Expr): string {
    expr = expr ?? this.expr;
    const id = this.newId();
    switch (expr.kind) {
      case "number":
        return this.wrap(expr.value.toString(), id);
      case "symbol":
        return this.wrap(expr.name, id);
      case "add":
        return this.wrap(
          expr.terms.map((term) => this.generate(term)).join(" + "),
          id,
        );
      case "multiply":
        return this.wrap(
          expr.factors.map((factor) => this.generate(factor)).join(" "),
          id,
        );
      case "power":
        return this.wrap(
          this.generate(expr.base) + "^" + `{${this.generate(expr.exponent)}}`,
          id,
        );
      case "negate":
        return this.wrap("-" + this.generate(expr.value), id);
      case "divide":
        return this.wrap(
          `\\frac{${this.generate(expr.numerator)}}{${this.generate(expr.denominator)}}`,
          id,
        );
      case "root":
        if (expr.degree === 2) {
          return this.wrap(`\\sqrt{${this.generate(expr.value)}}`, id);
        } else {
          return this.wrap(
            `\\sqrt[${expr.degree}]{${this.generate(expr.value)}}`,
            id,
          );
        }
      case "equation":
        return this.wrap(
          expr.sides.map((side) => this.generate(side)).join(" = "),
          id,
        );
      case "inequality":
        switch (expr.operator) {
          case "lt":
            return this.wrap(
              `${this.generate(expr.lhs)} < ${this.generate(expr.rhs)}`,
              id,
            );
          case "gt":
            return this.wrap(
              `${this.generate(expr.lhs)} > ${this.generate(expr.rhs)}`,
              id,
            );
          case "geq":
            return this.wrap(
              `${this.generate(expr.lhs)} \\geq ${this.generate(expr.rhs)}`,
              id,
            );
          case "leq":
            return this.wrap(
              `${this.generate(expr.lhs)} \\leq ${this.generate(expr.rhs)}`,
              id,
            );
        }
      case "call":
        if (expr.callee.kind !== "symbol") {
          throw new Error(`Unsupported callee kind: ${expr.callee.kind}`);
        }
        switch (expr.delimiter) {
          case "paren":
            return this.wrap(
              `\\${expr.callee.name}\\left(${expr.args.map((x) => this.generate(x)).join(", ")}\\right)`,
              id,
            );
          case "bracket":
            return this.wrap(
              `\\${expr.callee.name}\\left[${expr.args.map((x) => this.generate(x)).join(", ")}\\right]`,
              id,
            );
          case "bare":
            return (
              this.wrap(
                `\\${expr.callee.name} ${expr.args.map((x) => this.generate(x)).join(", ")}`,
                id,
              ) + " "
            );
        }
      case "text":
        return this.wrap(`\\text{${expr.text}}`, id);
      case "absolute_value":
        return this.wrap(`|${this.generate(expr.value)}|`, id);
      case "vector":
        return this.wrap(`\\vec{${this.generate(expr.value)}}`, id);
      case "hat":
        return this.wrap(`\\hat{${this.generate(expr.value)}}`, id);
      case "inner_product":
        return this.wrap(
          `${this.generate(expr.factors[0])} \\cdot ${this.generate(expr.factors[1])}`,
          id,
        );
      case "outer_product":
        return this.wrap(
          `${this.generate(expr.factors[0])} \\times ${this.generate(expr.factors[1])}`,
          id,
        );
      case "dotted_expr":
        if (expr.order !== 1 && expr.order !== 2)
          throw new Error(`Unsupported order: ${expr.order}`);
        const dot = expr.order === 1 ? "\\dot" : "\\ddot";
        return this.wrap(`${dot}{${this.generate(expr.value)}}`, id);
      case "primed":
        const primes = "'".repeat(expr.order);
        return this.wrap(`${this.generate(expr.value)}${primes}`, id);
      case "special_font":
        switch (expr.font) {
          case "script":
            return this.wrap(`\\mathscr{${this.generate(expr.value)}}`, id);
          case "calligraphic":
            return this.wrap(`\\mathcal{${this.generate(expr.value)}}`, id);
          case "blackboard":
            return this.wrap(`\\mathbb{${this.generate(expr.value)}}`, id);
        }
      case "big_sum":
        return this.wrap(
          `\\sum${
            expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : ""
          }${expr.upperBound ? `^{${this.generate(expr.upperBound)}}` : ""} ${this.generate(expr.summand)}`,
          id,
        );
      case "big_prod":
        return this.wrap(
          `\\prod${
            expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : ""
          }${expr.upperBound ? `^{${this.generate(expr.upperBound)}}` : ""} ${this.generate(expr.muliplicand)}`,
          id,
        );
      case "integral":
        return this.wrap(
          `\\int${
            expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : ""
          }${expr.upperBound ? `^{${this.generate(expr.upperBound)}}` : ""} ${
            expr.variable && expr.differentialSlot === "prefix"
              ? `\\mathrm{d}{${this.generate(expr.variable)}} ${this.generate(expr.integrand)}`
              : expr.variable
                ? `${this.generate(expr.integrand)} \\,\\mathrm{d}{${this.generate(expr.variable)}}`
                : this.generate(expr.integrand)
          }`,
          id,
        );
      case "uniterated_integral":
        return this.wrap(
          `\\int ${this.generate(expr.integrand)}${
            expr.variable
              ? ` \\,\\mathrm{d}{${this.generate(expr.variable)}}`
              : ""
          }`,
          id,
        );
      case "closed_integral":
        return this.wrap(
          `\\oint ${this.generate(expr.integrand)}${
            expr.variable
              ? ` \\,\\mathrm{d}{${this.generate(expr.variable)}}`
              : ""
          }`,
          id,
        );
      case "multiple_integral":
        return this.wrap(
          `${"\\int".repeat(expr.order)} ${this.generate(expr.integrand)}${
            expr.variable
              ? ` \\,\\mathrm{d}{${this.generate(expr.variable)}}`
              : ""
          }`,
          id,
        );
      case "differential":
        return this.wrap(`\\mathrm{d}{${this.generate(expr.variable)}}`, id);
      case "partial_derivative":
        return this.wrap(
          `\\frac{\\partial{${this.generate(expr.quantity)}}}{\\partial{${this.generate(expr.variable)}}}`,
          id,
        );
      case "full_derivative_operator":
        return this.wrap(
          `\\frac{\\mathrm{d}}{\\mathrm{d}{${this.generate(expr.variable)}}} ${this.generate(expr.operand)}`,
          id,
        );
      case "partial_derivative_operator":
        return this.wrap(
          `\\frac{\\partial}{\\partial{${this.generate(expr.variable)}}} ${this.generate(expr.operand)}`,
          id,
        );
      case "display_group": {
        const [open, close] = this.delimiterPair(expr.delimiter);
        return this.wrap(
          `\\left${open}${this.generate(expr.expression)}\\right${close}`,
          id,
        );
      }
      case "second_order_partial_derivative":
        return this.wrap(
          `\\frac{\\partial^{${expr.degree}}{${this.generate(expr.dependentVariable)}}}{${expr.independentVariables
            .map((variable) => `\\partial{${this.generate(variable)}}`)
            .join(" ")}}`,
          id,
        );
      case "partial_at_const_quantity":
        return this.wrap(
          `\\left(\\frac{\\partial{${this.generate(expr.quantity)}}}{\\partial{${this.generate(expr.variable)}}}\\right)_{${this.generate(expr.constantQuantity)}}`,
          id,
        );
      case "immutable_expression":
        return this.wrap(expr.latex, id);
      case "invalid_input":
        throw new Error(`Invalid input: ${expr.latex}`);
    }
  }
}

export function exprToLatex(expr: Expr, tags: boolean): string {
  const generator = new LatexGenerator(expr, tags);
  return generator.generate();
}
