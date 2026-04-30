import type { Expr } from "../../ast";

class LatexGenerator {
  expr: Expr;
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
          case "leq":
            return this.wrap(
              `${this.generate(expr.lhs)} \${expr.operator} ${this.generate(expr.rhs)}`,
              id,
            );
        }
      case "call":
      case "text":
      case "absolute_value":
      case "vector":
      case "hat":
      case "inner_product":
      case "outer_product":
      case "dotted_expr":
      case "primed":
      case "special_font":
      case "big_sum":
      case "big_prod":
      case "integral":
      case "uniterated_integral":
      case "closed_integral":
      case "multiple_integral":
      case "differential":
      case "partial_derivative":
      case "display_group":
      case "second_order_partial_derivative":
      case "raw_mathjson":
      case "partial_at_const_quantity":
      case "immutable_expression":
      case "invalid_input":
        throw new Error(`Unsupported expression kind: ${this.expr.kind}`);
    }
  }
}

export function exprToLatex(expr: Expr, tags: boolean): string {
  const generator = new LatexGenerator(expr, tags);
  return generator.generate();
}
