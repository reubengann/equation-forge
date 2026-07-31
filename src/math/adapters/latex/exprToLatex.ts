import { splitSign, type DelimiterKind, type Expr } from "../../ast";

type RenderContext =
  | "default"
  | "sumTerm"
  | "productFactor"
  | "prefixOperand"
  | "postfixDifferentialVariable";

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
    if (!this.isTrigPowerBase(base)) {
      return this.wrap(`${this.generatePowerBase(base)}^{${this.generate(expr.exponent)}}`, id);
    }

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
    if (context === "productFactor" && shouldGroupProductFactor(signed.value)) {
      return this.wrap(`\\left(${this.generateUnsignedBody(signed.value)}\\right)`, id);
    }
    return this.generateUnsignedWithId(signed.value, id, context);
  }

  generateUnsignedWithId(expr: Expr, id: string, context: RenderContext): string {
    if (
      context === "postfixDifferentialVariable" &&
      expr.kind === "power" &&
      expr.exponent.kind === "display_group" &&
      expr.exponent.delimiter === "paren"
    ) {
      return this.wrap(
        `{${this.generate(expr.base)}}^{${this.generate(expr.exponent)}}`,
        id,
      );
    }
    return this.generateUnsignedWithIdLegacy(expr, id);
  }

  generateUnsignedBody(expr: Expr): string {
    switch (expr.kind) {
      case "number":
        return expr.value.toString();
      case "symbol":
        return renderSymbolName(expr.name);
      case "add":
        return this.generateAddTerms(expr.terms);
      case "multiply":
        return this.generateProductFactors(expr.factors);
      case "power":
        return `${this.generatePowerBase(expr.base)}^{${this.generate(expr.exponent)}}`;
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
            return `\\${expr.callee.name} ${expr.args.map((x) => this.generateBareCallArgument(x)).join(", ")} `;
        }
      case "user_function":
        return `${expr.name}\\left(${this.generate(expr.argument)}\\right)`;
      case "display_group": {
        const [open, close] = this.delimiterPair(expr.delimiter);
        return `\\left${open}${this.generate(expr.expression)}\\right${close}`;
      }
      case "integral":
        return this.generateIntegralBody(expr);
      case "uniterated_integral":
        return `\\int ${this.generateIntegralIntegrand(expr.integrand)}`;
      case "closed_integral":
        return `\\oint ${this.generateIntegralIntegrand(expr.integrand)}`;
      case "multiple_integral":
        return `${"\\int".repeat(expr.order)} ${this.generateIntegralIntegrand(expr.integrand)}`;
      case "differential":
        return this.generateDifferentialBody(expr);
      case "partial_derivative":
        return `\\frac{\\partial{${this.generate(expr.quantity)}}}{\\partial{${this.generate(expr.variable)}}}`;
      case "full_derivative_operator":
        return this.generateFullDerivativeOperatorBody(expr);
      case "partial_derivative_operator":
        return `\\frac{\\partial}{\\partial{${this.generate(expr.variable)}}} ${this.generate(expr.operand)}`;
      case "second_order_partial_derivative":
        return this.generateSecondOrderPartialDerivative(expr);
      case "partial_at_const_quantity":
        return this.generatePartialAtConstBody(expr);
      default:
        return this.generate(expr);
    }
  }

  generateIntegralBody(expr: Extract<Expr, { kind: "integral" }>): string {
    const maybeLower = expr.lowerBound ? `_{${this.generate(expr.lowerBound)}}` : "";
    const maybeUpper = expr.upperBound ? `^{${this.generate(expr.upperBound)}}` : "";
    const signedIntegrand = splitSign(expr.integrand);
    let integratedThing = "";
    if (signedIntegrand.value.kind === "multiply") {
      const integrandId = this.newId();
      integratedThing = this.generateProductFactors(signedIntegrand.value.factors);
      integratedThing = this.wrap(integratedThing, integrandId);
    } else {
      integratedThing = this.generateIntegralIntegrand(signedIntegrand.value);
    }
    return `${signedIntegrand.sign === -1 ? "-" : ""}\\int${maybeLower}${maybeUpper} ${integratedThing}`;
  }

  generateIntegralIntegrand(expr: Expr): string {
    const rendered = this.generate(expr);
    return shouldGroupIntegralIntegrand(expr) ? `\\left(${rendered}\\right)` : rendered;
  }

  generateDifferentialBody(expr: Extract<Expr, { kind: "differential" }>): string {
    const operator = `\\mathrm{d${expr.inexact ? "'" : ""}}`;
    if (
      expr.postfixVariableSuperscript &&
      expr.variable.kind === "power" &&
      expr.variable.exponent.kind === "display_group" &&
      expr.variable.exponent.delimiter === "paren"
    ) {
      return `${operator}${this.generate(
        expr.variable,
        "postfixDifferentialVariable",
      )}`;
    }
    const variable = this.generate(expr.variable);
    return expr.variable.kind === "display_group" ? `${operator}${variable}` : `${operator}{${variable}}`;
  }

  generateFullDerivativeOperatorBody(expr: Extract<Expr, { kind: "full_derivative_operator" }>): string {
    const compact = this.compactRepeatedFullDerivative(expr);
    if (compact) {
      return `\\frac{\\mathrm{d}^{${compact.degree}}{${this.generate(compact.operand)}}}{\\mathrm{d}{${this.generate(compact.variable)}}^{${compact.degree}}}`;
    }
    return `\\frac{\\mathrm{d}}{\\mathrm{d}{${this.generate(expr.variable)}}} ${this.generate(expr.operand)}`;
  }

  compactRepeatedFullDerivative(expr: Extract<Expr, { kind: "full_derivative_operator" }>): {
    degree: number;
    variable: Expr;
    operand: Expr;
  } | null {
    let degree = 1;
    let operand = expr.operand;
    while (
      operand.kind === "full_derivative_operator" &&
      sameExpr(operand.variable, expr.variable)
    ) {
      degree += 1;
      operand = operand.operand;
    }
    return degree > 1 ? { degree, variable: expr.variable, operand } : null;
  }

  generatePowerBase(base: Expr): string {
    if (base.kind === "display_group") return this.generateDisplayGroupPowerBase(base);
    const rendered = this.generate(base);
    return shouldGroupPowerBase(base) ? `\\left(${rendered}\\right)` : rendered;
  }

  generateDisplayGroupPowerBase(base: Extract<Expr, { kind: "display_group" }>): string {
    if (!this.tags) return this.generate(base);
    this.newId(); // Reserve the display group id without wrapping the \left...\right power base.
    const [open, close] = this.delimiterPair(base.delimiter);
    return `\\left${open}${this.generate(base.expression)}\\right${close}`;
  }

  generateUnsignedWithIdLegacy(expr: Expr, id: string): string {
    switch (expr.kind) {
      case "number":
        return this.wrap(expr.value.toString(), id);
      case "symbol":
        return this.wrap(renderSymbolName(expr.name), id);
      case "add":
        return this.wrap(this.generateAddTerms(expr.terms), id);
      case "multiply":
        return this.wrap(this.generateProductFactors(expr.factors), id);
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
              this.wrap(`\\${expr.callee.name} ${expr.args.map((x) => this.generateBareCallArgument(x)).join(", ")}`, id) +
              " "
            );
        }
      case "user_function":
        return this.wrap(
          this.tags
            ? `\\class{pdp-user-function}{${expr.name}\\!\\left(${this.generate(expr.argument)}\\right)}`
            : `${expr.name}\\left(${this.generate(expr.argument)}\\right)`,
          id,
        );
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
        return this.wrap(this.generateIntegralBody(expr), id);
      case "uniterated_integral":
        return this.wrap(`\\int ${this.generateIntegralIntegrand(expr.integrand)}`, id);
      case "closed_integral":
        return this.wrap(`\\oint ${this.generateIntegralIntegrand(expr.integrand)}`, id);
      case "multiple_integral":
        return this.wrap(`${"\\int".repeat(expr.order)} ${this.generateIntegralIntegrand(expr.integrand)}`, id);
      case "differential":
        return this.wrap(this.generateDifferentialBody(expr), id);
      case "partial_derivative":
        return this.wrap(
          `\\frac{\\partial{${this.generate(expr.quantity)}}}{\\partial{${this.generate(expr.variable)}}}`,
          id,
        );
      case "full_derivative_operator":
        return this.wrap(this.generateFullDerivativeOperatorBody(expr), id);
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
          this.generateSecondOrderPartialDerivative(expr),
          id,
        );
      case "partial_at_const_quantity":
        return this.wrap(
          `${this.generatePartialAtConstBody(expr)}`,
          id,
        );
      case "immutable_expression":
        return this.wrap(expr.latex, id);
      case "invalid_input":
        throw new Error(`Invalid input: ${expr.latex}`);
    }
  }

  generateAddTerms(terms: Expr[]): string {
    return flattenBareAddTerms(terms)
      .map((term, index) => {
        const signedTerm = splitAdditiveTermSign(term);
        if (signedTerm.sign === -1 && (index > 0 || term.kind !== "negate" || term.notation !== "prefix")) {
          const renderedValue = this.generateUnsigned(signedTerm.value, "sumTerm");
          return index === 0 ? `-${renderedValue}` : `- ${renderedValue}`;
        }
        const renderedTerm = this.generate(term, "sumTerm");
        return index === 0 ? renderedTerm : `+ ${renderedTerm}`;
      })
      .join(" ");
  }

  generateSecondOrderPartialDerivative(expr: Extract<Expr, { kind: "second_order_partial_derivative" }>): string {
    return `\\frac{\\partial^{${expr.degree}}{${this.generate(expr.dependentVariable)}}}{${this.generateSecondOrderPartialDenominator(expr)}}`;
  }

  generateSecondOrderPartialDenominator(expr: Extract<Expr, { kind: "second_order_partial_derivative" }>): string {
    if (expr.independentVariables.length === 1) {
      const [variable] = expr.independentVariables;
      return `\\partial{${this.generate(variable)}}${expr.degree === 1 ? "" : `^{${expr.degree}}`}`;
    }
    return expr.independentVariables.map((variable) => `\\partial{${this.generate(variable)}}`).join(" ");
  }

  generatePartialAtConstBody(expr: Extract<Expr, { kind: "partial_at_const_quantity" }>): string {
    if (expr.quantity.kind === "second_order_partial_derivative") {
      const quantity = this.generate(expr.quantity);
      if (this.tags) this.generate(expr.variable); // Reserve the duplicate variable id so rendered ids stay aligned.
      return `\\left(${quantity}\\right)_{${this.generate(expr.constantQuantity)}}`;
    }
    return `\\left(\\frac{\\partial{${this.generate(expr.quantity)}}}{\\partial{${this.generate(expr.variable)}}}\\right)_{${this.generate(expr.constantQuantity)}}`;
  }

  generateBareCallArgument(expr: Expr): string {
    const rendered = this.generate(expr);
    return shouldGroupBareCallArgument(expr) ? `\\left(${rendered}\\right)` : rendered;
  }

  generateProductFactors(factors: Expr[]): string {
    let productSign: 1 | -1 = 1;
    const unsignedFactors = factors.map((factor) => {
      if (factor.kind === "multiply" && splitSign(factor).sign === -1) return factor;
      const signed = splitSign(factor);
      if (signed.sign === -1) productSign = productSign === 1 ? -1 : 1;
      return signed.value;
    });
    return unsignedFactors
      .map((factor, index) => {
        const rendered = this.generate(factor, "productFactor");
        if (index === 0) return `${productSign === -1 ? "-" : ""}${rendered}`;
        if (unsignedFactors[index - 1]?.kind === "number" && factor.kind === "number") return `\\left(${rendered}\\right)`;
        return factor.kind === "differential" ? `\\,${rendered}` : rendered;
      })
      .join(" ");
  }
}

function flattenBareAddTerms(terms: Expr[]): Expr[] {
  return terms.flatMap((term) => {
    const signed = splitSign(term);
    return signed.sign === 1 && signed.value.kind === "add" ? signed.value.terms : [term];
  });
}

function shouldGroupNegativeProductFactor(expr: Expr): boolean {
  return expr.kind === "multiply" || expr.kind === "add" || expr.kind === "divide" || expr.kind === "display_group";
}

function shouldGroupProductFactor(expr: Expr): boolean {
  return expr.kind === "add" || (expr.kind === "multiply" && startsWithNegativeFactor(expr));
}

function shouldGroupBareCallArgument(expr: Expr): boolean {
  const signed = splitSign(expr);
  if (signed.sign === -1) return true;
  switch (signed.value.kind) {
    case "add":
    case "multiply":
      return true;
    default:
      return false;
  }
}

function shouldGroupIntegralIntegrand(expr: Expr): boolean {
  const signed = splitSign(expr);
  return signed.value.kind === "add";
}

function shouldGroupPowerBase(expr: Expr): boolean {
  const signed = splitSign(expr);
  return (
    signed.sign === -1 ||
    signed.value.kind === "add" ||
    signed.value.kind === "multiply" ||
    signed.value.kind === "divide" ||
    signed.value.kind === "display_group" ||
    signed.value.kind === "full_derivative_operator" ||
    signed.value.kind === "partial_derivative" ||
    signed.value.kind === "partial_derivative_operator" ||
    signed.value.kind === "partial_at_const_quantity" ||
    signed.value.kind === "second_order_partial_derivative"
  );
}

function startsWithNegativeFactor(expr: Extract<Expr, { kind: "multiply" }>): boolean {
  let negativeFactorCount = 0;
  const unsignedFactors = expr.factors.map((factor) => {
    if (factor.kind === "multiply" && splitSign(factor).sign === -1) return factor;
    const signed = splitSign(factor);
    if (signed.sign === -1) negativeFactorCount += 1;
    return signed.value;
  });
  if (negativeFactorCount % 2 === 1) return true;

  const firstFactor = unsignedFactors[0];
  return firstFactor?.kind === "multiply" ? startsWithNegativeFactor(firstFactor) : false;
}

function sameExpr(left: Expr, right: Expr): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function renderSymbolName(name: string): string {
  const separatorIndex = name.indexOf("_");
  if (separatorIndex <= 0 || separatorIndex === name.length - 1 || name.endsWith("}")) return name;
  const base = name.slice(0, separatorIndex);
  const subscript = name.slice(separatorIndex + 1);
  return subscript.length === 1 ? name : `${base}_{${subscript}}`;
}

function splitAdditiveTermSign(expr: Expr): { sign: 1 | -1; value: Expr } {
  const signed = splitSign(expr);
  if (signed.sign === -1 || signed.value.kind !== "multiply") return signed;

  let sign: 1 | -1 = 1;
  let changed = false;
  const factors = signed.value.factors.map((factor) => {
    const signedFactor = splitSign(factor);
    if (signedFactor.sign === -1) {
      sign = sign === 1 ? -1 : 1;
      changed = true;
    }
    return signedFactor.value;
  });
  if (!changed) return signed;
  return {
    sign,
    value: {
      ...signed.value,
      factors,
    },
  };
}

export function exprToLatex(expr: Expr, tags: boolean): string {
  const generator = new LatexGenerator(expr, tags);
  return generator.generate();
}

export function exprToPlainLatex(expr: Expr): string {
  return exprToLatex(expr, false);
}

export function exprToTaggedLatex(expr: Expr): string {
  return exprToLatex(expr, true);
}
