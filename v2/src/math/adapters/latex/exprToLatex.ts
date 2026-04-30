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
    switch (expr.kind) {
      case "number":
        return this.wrap(expr.value.toString(), this.newId());
      case "symbol":
        return this.wrap(expr.name, this.newId());
      case "add":
        const id = this.newId();
        return this.wrap(
          expr.terms.map((term) => this.generate(term)).join(" + "),
          id,
        );
      case "multiply":
      case "power":
      case "negate":
      case "divide":
      case "root":
      case "equation":
      case "inequality":
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
        throw new Error(`Unsupported expression kind: ${this.expr.kind}`);
    }
  }
}

export function exprToLatex(expr: Expr, tags: boolean): string {
  const generator = new LatexGenerator(expr, tags);
  return generator.generate();
}
