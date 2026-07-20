import {
  findIntegralDifferentialVariable,
  flipSign,
  splitSign,
  type Expr,
} from "../../ast";

export type ExprToSympyOptions = {
  /**
   * Python module or alias used in emitted code. Set to null to emit bare SymPy
   * calls, for example `Symbol("x")` instead of `sympy.Symbol("x")`.
   */
  namespace?: string | null;
};

export type ExprToSympyIssue = {
  reason: string;
  exprKind: Expr["kind"];
  detail?: string;
};

export type ExprToSympySuccess = {
  ok: true;
  code: string;
};

export type ExprToSympyFailure = {
  ok: false;
  issues: ExprToSympyIssue[];
};

export type ExprToSympyResult = ExprToSympySuccess | ExprToSympyFailure;

export class ExprToSympyError extends Error {
  readonly issues: ExprToSympyIssue[];

  constructor(issues: ExprToSympyIssue[]) {
    super(`Unable to convert expression to SymPy: ${issues.map((issue) => issue.reason).join(", ")}`);
    this.name = "ExprToSympyError";
    this.issues = issues;
  }
}

type RenderContext = {
  namespace: string | null;
  issues: ExprToSympyIssue[];
};

const KNOWN_FUNCTIONS = new Map([
  ["sin", "sin"],
  ["cos", "cos"],
  ["tan", "tan"],
  ["log", "log"],
  ["ln", "log"],
  ["exp", "exp"],
]);

export function exprToSympy(expr: Expr, options: ExprToSympyOptions = {}): string {
  const result = tryExprToSympy(expr, options);
  if (!result.ok) throw new ExprToSympyError(result.issues);
  return result.code;
}

export function tryExprToSympy(expr: Expr, options: ExprToSympyOptions = {}): ExprToSympyResult {
  const context: RenderContext = {
    namespace: options.namespace === undefined ? "sympy" : options.namespace,
    issues: [],
  };
  const code = renderExpr(expr, context);
  if (!code || context.issues.length > 0) return { ok: false, issues: context.issues };
  return { ok: true, code };
}

function renderExpr(expr: Expr, context: RenderContext): string | null {
  const signed = splitSign(expr);
  const rendered = renderPositiveExpr(signed.value, context);
  if (!rendered) return null;
  if (signed.sign === 1) return rendered;
  return sympyCall(context, "Mul", [sympyCall(context, "Integer", ["-1"]), rendered]);
}

function renderPositiveExpr(expr: Expr, context: RenderContext): string | null {
  switch (expr.kind) {
    case "number":
      return renderNumber(expr.value, context);
    case "symbol":
      return renderSymbol(expr.name, context);
    case "add":
      return renderNary("Add", expr.terms, context, sympyCall(context, "Integer", ["0"]));
    case "multiply":
      return renderNary("Mul", expr.factors, context, sympyCall(context, "Integer", ["1"]));
    case "power":
      return renderBinary("Pow", expr.base, expr.exponent, context);
    case "negate":
      return renderExpr(flipSign(expr.value), context);
    case "divide":
      return renderDivide(expr.numerator, expr.denominator, context);
    case "root":
      return sympyCall(context, "Pow", [
        required(renderExpr(expr.value, context)),
        sympyCall(context, "Rational", ["1", String(expr.degree)]),
      ]);
    case "equation":
      return renderEquation(expr.sides, context);
    case "inequality":
      return renderInequality(expr, context);
    case "call":
      return renderCall(expr, context);
    case "user_function":
      return renderUserFunction(expr.name, [expr.argument], context);
    case "display_group":
      return renderExpr(expr.expression, context);
    case "absolute_value":
      return sympyCall(context, "Abs", [required(renderExpr(expr.value, context))]);
    case "special_font":
      return expr.value.kind === "symbol"
        ? renderSymbol(`\\math${expr.font === "script" ? "scr" : expr.font === "calligraphic" ? "cal" : "bb"}{${expr.value.name}}`, context)
        : unsupported(context, expr, "unsupported_special_font_value");
    case "primed":
      return expr.value.kind === "symbol"
        ? renderSymbol(`${expr.value.name}${"'".repeat(expr.order)}`, context)
        : unsupported(context, expr, "unsupported_primed_value");
    case "dotted_expr":
      return expr.value.kind === "symbol"
        ? renderSymbol(`${"dot_".repeat(expr.order)}${expr.value.name}`, context)
        : unsupported(context, expr, "unsupported_dotted_value");
    case "integral":
      return renderIntegral(expr, context);
    case "uniterated_integral":
      return renderIntegral({ kind: "integral", integrand: expr.integrand, lowerBound: null, upperBound: null }, context);
    case "partial_derivative":
      return renderDerivative(expr.quantity, [expr.variable], context);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return renderDerivative(expr.operand, [expr.variable], context);
    case "second_order_partial_derivative":
      return renderSecondOrderPartial(expr, context);
    case "text":
    case "immutable_expression":
    case "invalid_input":
    case "vector":
    case "hat":
    case "inner_product":
    case "outer_product":
    case "big_sum":
    case "big_prod":
    case "limit":
    case "closed_integral":
    case "multiple_integral":
    case "differential":
    case "partial_at_const_quantity":
      return unsupported(context, expr, "unsupported_expr_kind");
  }
}

function renderNumber(value: number | string, context: RenderContext): string {
  const literal = String(value);
  if (/^-?\d+$/.test(literal)) return sympyCall(context, "Integer", [JSON.stringify(literal)]);
  return sympyCall(context, "Float", [JSON.stringify(literal)]);
}

function renderSymbol(name: string, context: RenderContext): string {
  if (name === String.raw`\pi`) return qualified(context, "pi");
  if (name === "e") return qualified(context, "E");
  return sympyCall(context, "Symbol", [JSON.stringify(name)]);
}

function renderNary(
  functionName: string,
  values: Expr[],
  context: RenderContext,
  identity: string,
): string | null {
  if (values.length === 0) return identity;
  const rendered = renderMany(values, context);
  return rendered ? sympyCall(context, functionName, rendered) : null;
}

function renderBinary(
  functionName: string,
  left: Expr,
  right: Expr,
  context: RenderContext,
): string | null {
  const renderedLeft = renderExpr(left, context);
  const renderedRight = renderExpr(right, context);
  return renderedLeft && renderedRight ? sympyCall(context, functionName, [renderedLeft, renderedRight]) : null;
}

function renderDivide(numerator: Expr, denominator: Expr, context: RenderContext): string | null {
  const renderedNumerator = renderExpr(numerator, context);
  const renderedDenominator = renderExpr(denominator, context);
  if (!renderedNumerator || !renderedDenominator) return null;
  return sympyCall(context, "Mul", [
    renderedNumerator,
    sympyCall(context, "Pow", [renderedDenominator, sympyCall(context, "Integer", ["-1"])]),
  ]);
}

function renderEquation(sides: Expr[], context: RenderContext): string | null {
  if (sides.length < 2) return unsupported(context, { kind: "equation", sides }, "equation_requires_two_sides");
  const renderedSides = renderMany(sides, context);
  if (!renderedSides) return null;
  const equalities = renderedSides.slice(1).map((side, index) => sympyCall(context, "Eq", [renderedSides[index]!, side]));
  return equalities.length === 1 ? equalities[0]! : sympyCall(context, "And", equalities);
}

function renderInequality(expr: Extract<Expr, { kind: "inequality" }>, context: RenderContext): string | null {
  const left = renderExpr(expr.lhs, context);
  const right = renderExpr(expr.rhs, context);
  if (!left || !right) return null;
  const functionName = expr.operator === "lt" ? "Lt" : expr.operator === "gt" ? "Gt" : expr.operator === "leq" ? "Le" : "Ge";
  return sympyCall(context, functionName, [left, right]);
}

function renderCall(expr: Extract<Expr, { kind: "call" }>, context: RenderContext): string | null {
  if (expr.callee.kind !== "symbol") return unsupported(context, expr, "unsupported_call_callee");
  const renderedArgs = renderMany(expr.args, context);
  if (!renderedArgs) return null;
  const knownFunction = KNOWN_FUNCTIONS.get(expr.callee.name);
  if (knownFunction) return sympyCall(context, knownFunction, renderedArgs);
  return renderUserFunction(expr.callee.name, expr.args, context);
}

function renderUserFunction(name: string, args: Expr[], context: RenderContext): string | null {
  const renderedArgs = renderMany(args, context);
  if (!renderedArgs) return null;
  return `${sympyCall(context, "Function", [JSON.stringify(name)])}(${renderedArgs.join(", ")})`;
}

function renderIntegral(expr: Extract<Expr, { kind: "integral" }>, context: RenderContext): string | null {
  const variable = findIntegralDifferentialVariable(expr.integrand);
  if (!variable) return unsupported(context, expr, "missing_integral_differential");
  const integrand = removeDifferentialFactor(expr.integrand);
  const renderedIntegrand = renderExpr(integrand, context);
  const renderedVariable = renderExpr(variable, context);
  if (!renderedIntegrand || !renderedVariable) return null;
  if (!expr.lowerBound && !expr.upperBound) return sympyCall(context, "Integral", [renderedIntegrand, renderedVariable]);
  if (!expr.lowerBound || !expr.upperBound) return unsupported(context, expr, "unsupported_one_sided_integral_bound");
  const lowerBound = renderExpr(expr.lowerBound, context);
  const upperBound = renderExpr(expr.upperBound, context);
  if (!lowerBound || !upperBound) return null;
  return sympyCall(context, "Integral", [renderedIntegrand, `(${renderedVariable}, ${lowerBound}, ${upperBound})`]);
}

function renderDerivative(quantity: Expr, variables: Expr[], context: RenderContext): string | null {
  const renderedQuantity = renderExpr(quantity, context);
  const renderedVariables = renderMany(variables, context);
  if (!renderedQuantity || !renderedVariables) return null;
  return sympyCall(context, "Derivative", [renderedQuantity, ...renderedVariables]);
}

function renderSecondOrderPartial(
  expr: Extract<Expr, { kind: "second_order_partial_derivative" }>,
  context: RenderContext,
): string | null {
  const dependentVariable = renderExpr(expr.dependentVariable, context);
  const independentVariables = renderMany(expr.independentVariables, context);
  if (!dependentVariable || !independentVariables) return null;
  if (independentVariables.length === 1) {
    return sympyCall(context, "Derivative", [
      dependentVariable,
      `(${independentVariables[0]}, ${sympyCall(context, "Integer", [String(expr.degree)])})`,
    ]);
  }
  return sympyCall(context, "Derivative", [dependentVariable, ...independentVariables]);
}

function renderMany(values: Expr[], context: RenderContext): string[] | null {
  const rendered = values.map((value) => renderExpr(value, context));
  return rendered.some((value) => !value) ? null : (rendered as string[]);
}

function removeDifferentialFactor(expr: Expr): Expr {
  if (expr.kind === "differential") return { kind: "number", value: 1 };
  if (expr.kind !== "multiply") return expr;

  const factors = expr.factors.filter((factor) => factor.kind !== "differential");
  if (factors.length === 0) return { kind: "number", value: 1 };
  if (factors.length === 1) return factors[0]!;
  return { kind: "multiply", factors };
}

function unsupported(context: RenderContext, expr: Expr, reason: string, detail?: string): null {
  context.issues.push({ reason, exprKind: expr.kind, ...(detail ? { detail } : {}) });
  return null;
}

function sympyCall(context: RenderContext, functionName: string, args: string[]): string {
  return `${qualified(context, functionName)}(${args.join(", ")})`;
}

function qualified(context: RenderContext, name: string): string {
  return context.namespace ? `${context.namespace}.${name}` : name;
}

function required(value: string | null): string {
  return value ?? "";
}
