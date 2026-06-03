import { type DelimiterKind, type Expr } from "../../ast";
import { splitSign } from "../../rewrite/algebraUtils";

type RenderContext = "default" | "sumTerm" | "productFactor" | "prefixOperand";

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

  isTrigPowerBase(expr: Expr): expr is Extract<Expr, { kind: "call" }> & {
    callee: Extract<Expr, { kind: "symbol" }>;
  } {
    return (
      expr.kind === "call" &&
      expr.callee.kind === "symbol" &&
      (expr.callee.name === "sin" || expr.callee.name === "cos" || expr.callee.name === "tan") &&
      expr.args.length === 1
    );
  }

  generateTrigPower(expr: Extract<Expr, { kind: "power" }>, id: string): string {
    const base = expr.base;
    if (!this.isTrigPowerBase(base)) return this.wrap(this.generate(base) + "^" + `{${this.generate(expr.exponent)}}`, id);

    // Trig powers are conventionally written as \sin^{2} x, meaning (\sin x)^2.
    this.newId(); // Reserve the call id so subsequent rendered ids stay aligned with the compiled index.
    this.generate(base.callee);
    const renderedArg = base.args.map((arg) => this.generate(arg)).join(", ");
    const renderedExponent = this.generate(expr.exponent);
    const macro = `\\${base.callee.name}^{${renderedExponent}}`;
    switch (base.delimiter) {
      case "paren":
        return this.wrap(`${macro}\\left(${renderedArg}\\right)`, id);
      case "bracket":
        return this.wrap(`${macro}\\left[${renderedArg}\\right]`, id);
      case "bare":
        return this.wrap(`${macro} ${renderedArg}`, id);
    }
  }

  generate(expr?: Expr, context: RenderContext = "default"): string {
    expr = expr ?? this.expr;
    const id = this.newId();
    return this.generateWithId(expr, id, context);
  }

  generateUnsigned(expr: Expr, context: RenderContext = "default"): string {
    const id = this.newId();
    return this.generateUnsignedWithId(expr, id, context);
  }

  generateWithId(expr: Expr, id: string, context: RenderContext): string {
    const signed = splitSign(expr);
    if (signed.sign === -1) {
      const positive = signed.value;
      if (context === "sumTerm") return this.generateUnsignedWithId(positive, id, context);
      if (context === "productFactor" && shouldGroupNegativeProductFactor(positive)) {
        return this.wrap(`\\left(-${this.generateUnsignedBody(positive)}\\right)`, id);
      }
      return this.wrap("-" + this.generateUnsignedBody(positive), id);
    }
    return this.generateUnsignedWithId(signed.value, id, context);
  }

  generateUnsignedWithId(expr: Expr, id: string, _context: RenderContext): string {
    return this.generateUnsignedWithIdLegacy(expr, id);
  }

  generateUnsignedBody(expr: Expr): string {
    switch (expr.kind) {
      case "number":
        return expr.value.toString();
      case "symbol":
        return expr.name;
      case "add":
        return this.generateAddTerms(expr.terms);
      case "multiply":
        return expr.factors.map((factor) => this.generate(factor, "productFactor")).join(" ");
      case "power":
        return `${this.generate(expr.base)}^{${this.generate(expr.exponent)}}`;
      case "negate":
        return "-" + this.generate(expr.value, "prefixOperand");
      case "divide":
        return `\\frac{${this.generate(expr.numerator)}}{${this.generate(expr.denominator)}}`;
      case "root":
        if (expr.degree === 2) {
          return `\\sqrt{${this.generate(expr.value)}}`;
        } else {
          return `\\sqrt[${expr.degree}]{${this.generate(expr.value)}}`;
        }
      case "equation":
        return expr.sides.map((side) => this.generate(side)).join(" = ");
      case "inequality":
        switch (expr.operator) {
          case "lt":
            return `${this.generate(expr.lhs)} < ${this.generate(expr.rhs)}`;
          case "gt":
            return `${this.generate(expr.lhs)} > ${this.generate(expr.rhs)}`;
          case "geq":
            return `${this.generate(expr.lhs)} \\geq ${this.generate(expr.rhs)}`;
          case "leq":
            return `${this.generate(expr.lhs)} \\leq ${this.generate(expr.rhs)}`;
        }
      case "call":
        if (expr.callee.kind !== "symbol") {
          throw new Error(`Unsupported callee kind: ${expr.callee.kind}`);
        }
        this.generate(expr.callee);
        switch (expr.delimiter) {
          case "paren":
            return `\\${expr.callee.name}\\left(${expr.args.map((x) => this.generate(x)).join(", ")}\\right)`;
          case "bracket":
            return `\\${expr.callee.name}\\left[${expr.args.map((x) => this.generate(x)).join(", ")}\\right]`;
          case "bare":
            return `\\${expr.callee.name} ${expr.args.map((x) => this.generate(x)).join(", ")} `;
        }
      case "display_group": {
        const [open, close] = this.delimiterPair(expr.delimiter);
        return `\\left${open}${this.generate(expr.expression)}\\right${close}`;
      }
      case "differential":
        return `\\mathrm{d}{${this.generate(expr.variable)}}`;
      default:
        return this.generate(expr);
    }
  }

  generateUnsignedWithIdLegacy(expr: Expr, id: string): string {
    switch (expr.kind) {
      case "number":
        return this.wrap(expr.value.toString(), id);
      case "symbol":
        return this.wrap(expr.name, id);
      case "add":
        return this.wrap(this.generateAddTerms(expr.terms), id);
      case "multiply":
        return this.wrap(expr.factors.map((factor) => this.generate(factor, "productFactor")).join(" "), id);
      case "power":
        return this.generateTrigPower(expr, id);
      case "negate":
        return this.wrap("-" + this.generate(expr.value, "prefixOperand"), id);
      case "divide":
        return this.wrap(`\\frac{${this.generate(expr.numerator)}}{${this.generate(expr.denominator)}}`, id);
      case "root":
        if (expr.degree === 2) {
          return this.wrap(`\\sqrt{${this.generate(expr.value)}}`, id);
        } else {
          return this.wrap(`\\sqrt[${expr.degree}]{${this.generate(expr.value)}}`, id);
        }
      case "equation":
        return this.wrap(expr.sides.map((side) => this.generate(side)).join(" = "), id);
      case "inequality":
        switch (expr.operator) {
          case "lt":
            return this.wrap(`${this.generate(expr.lhs)} < ${this.generate(expr.rhs)}`, id);
          case "gt":
            return this.wrap(`${this.generate(expr.lhs)} > ${this.generate(expr.rhs)}`, id);
          case "geq":
            return this.wrap(`${this.generate(expr.lhs)} \\geq ${this.generate(expr.rhs)}`, id);
          case "leq":
            return this.wrap(`${this.generate(expr.lhs)} \\leq ${this.generate(expr.rhs)}`, id);
        }
      case "call":
        if (expr.callee.kind !== "symbol") {
          throw new Error(`Unsupported callee kind: ${expr.callee.kind}`);
        }
        // Function callees are represented in the compiled AST, but render as
        // LaTeX macros (for example, `\sin`) rather than separate selectable text.
        // Reserve the callee id so subsequent rendered ids stay aligned.
        this.generate(expr.callee);
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
              this.wrap(`\\${expr.callee.name} ${expr.args.map((x) => this.generate(x)).join(", ")}`, id) +
              " "
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
        return this.wrap(`${this.generate(expr.factors[0])} \\cdot ${this.generate(expr.factors[1])}`, id);
      case "outer_product":
        return this.wrap(`${this.generate(expr.factors[0])} \\times ${this.generate(expr.factors[1])}`, id);
      case "dotted_expr":
        if (expr.order !== 1 && expr.order !== 2) throw new Error(`Unsupported order: ${expr.order}`);
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
      case "limit":
        return this.wrap(
          `\\lim${expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : ""} ${this.generate(expr.expression)}`,
          id,
        );
      case "integral":
        const maybeLower = expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : "";
        const maybeUpper = expr.upperBound ? `^{${this.generate(expr.upperBound)}}` : "";
        let integratedThing = "";
        if (expr.integrand.kind === "multiply") {
          const integrandId = this.newId();
          integratedThing = expr.integrand.factors
            // If differential appears anywhere but the beginning, put a thinspace before it.
            .map((factor, index) => {
              const rendered = this.generate(factor, "productFactor");
              if (index === 0) return rendered;
              return factor.kind === "differential" ? ` \\,${rendered}` : ` ${rendered}`;
            })
            .join("");
          integratedThing = this.wrap(integratedThing, integrandId);
        } else {
          integratedThing = this.generate(expr.integrand);
        }
        return this.wrap(`\\int${maybeLower}${maybeUpper} ${integratedThing}`, id);
      case "uniterated_integral":
        return this.wrap(`\\int ${this.generate(expr.integrand)}`, id);
      case "closed_integral":
        return this.wrap(`\\oint ${this.generate(expr.integrand)}`, id);
      case "multiple_integral":
        return this.wrap(`${"\\int".repeat(expr.order)} ${this.generate(expr.integrand)}`, id);
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
        return this.wrap(`\\left${open}${this.generate(expr.expression)}\\right${close}`, id);
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

  generateAddTerms(terms: Expr[]): string {
    return terms
      .map((term, index) => {
        const signedTerm = splitSign(term);
        if (signedTerm.sign === -1 && (index > 0 || term.kind !== "negate" || term.notation !== "prefix")) {
          const renderedValue = this.generateUnsigned(signedTerm.value, "sumTerm");
          return index === 0 ? `-${renderedValue}` : `- ${renderedValue}`;
        }
        const renderedTerm = this.generate(term, "sumTerm");
        return index === 0 ? renderedTerm : `+ ${renderedTerm}`;
      })
      .join(" ");
  }
}

function shouldGroupNegativeProductFactor(expr: Expr): boolean {
  return expr.kind === "multiply" || expr.kind === "add" || expr.kind === "divide" || expr.kind === "display_group";
}

export function exprToLatex(expr: Expr, tags: boolean): string {
  const generator = new LatexGenerator(expr, tags);
  return generator.generate();
}
