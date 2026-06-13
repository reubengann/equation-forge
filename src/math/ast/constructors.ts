import type { DelimiterKind, Expr } from "./expr";

type ExprOptions = {
  sign?: 1 | -1;
};

type DifferentialOptions = ExprOptions & {
  inexact?: boolean;
};

function withOptions<T extends Expr>(expr: T, options: ExprOptions = {}): Expr {
  return options.sign === -1 ? { ...expr, sign: -1 } : expr;
}

function withSign(expr: Expr, sign: 1 | -1): Expr {
  const next = { ...expr };
  delete next.sign;
  return sign === -1 ? { ...next, sign: -1 } : next;
}

export const num = (value: number | string, options?: ExprOptions): Expr => withOptions({ kind: "number", value }, options);

export const sym = (name: string, options?: ExprOptions): Expr => withOptions({ kind: "symbol", name }, options);

export const add = (terms: Expr[], options?: ExprOptions): Expr => withOptions({ kind: "add", terms }, options);

export const multiply = (factors: Expr[], options?: ExprOptions): Expr => withOptions({ kind: "multiply", factors }, options);

export const power = (base: Expr, exponent: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "power",
  base,
  exponent,
}, options);

export const negate = (value: Expr, _notation: "prefix" | "subtraction" = "prefix"): Expr =>
  withSign(value, value.sign === -1 ? 1 : -1);

export const divide = (numerator: Expr, denominator: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "divide",
  numerator,
  denominator,
}, options);

export const root = (value: Expr, degree = 2, options?: ExprOptions): Expr => withOptions({
  kind: "root",
  value,
  degree,
}, options);

export const equation = (sides: Expr[], options?: ExprOptions): Expr => withOptions({ kind: "equation", sides }, options);

export const inequality = (
  lhs: Expr,
  operator: "geq" | "leq" | "gt" | "lt",
  rhs: Expr,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "inequality",
  operator,
  lhs,
  rhs,
}, options);

export const call = (
  callee: Expr,
  args: Expr[],
  delimiter: "paren" | "bracket" | "bare" = "bare",
  options?: ExprOptions,
): Expr => withOptions({
  kind: "call",
  callee,
  args,
  delimiter,
}, options);

export const userFunction = (name: string, argument: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "user_function",
  name,
  argument,
}, options);

export const text = (value: string, options?: ExprOptions): Expr => withOptions({
  kind: "text",
  text: value,
}, options);

export const absoluteValue = (value: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "absolute_value",
  value,
}, options);

export const vector = (value: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "vector",
  value,
}, options);

export const hat = (value: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "hat",
  value,
}, options);

export const innerProduct = (factors: Expr[], options?: ExprOptions): Expr => withOptions({
  kind: "inner_product",
  factors,
}, options);

export const outerProduct = (factors: Expr[], options?: ExprOptions): Expr => withOptions({
  kind: "outer_product",
  factors,
}, options);

export const dottedExpr = (value: Expr, order: number, options?: ExprOptions): Expr => withOptions({
  kind: "dotted_expr",
  value,
  order,
}, options);

export const primed = (value: Expr, order: number, options?: ExprOptions): Expr => withOptions({
  kind: "primed",
  value,
  order,
  ...(value.kind === "symbol" ? { name: value.name } : {}),
}, options);

export const specialFont = (
  value: Expr,
  font: "script" | "calligraphic" | "blackboard",
  options?: ExprOptions,
): Expr => withOptions({
  kind: "special_font",
  value,
  font,
}, options);

export const bigSum = (
  summand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "big_sum",
  summand,
  lowerBound,
  upperBound,
}, options);

export const bigProd = (
  muliplicand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "big_prod",
  muliplicand,
  lowerBound,
  upperBound,
}, options);

export const limit = (expression: Expr, lowerBound: Expr | null, options?: ExprOptions): Expr => withOptions({
  kind: "limit",
  expression,
  lowerBound,
}, options);

export const integral = (
  integrand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "integral",
  integrand,
  lowerBound,
  upperBound,
}, options);

export const uniteratedIntegral = (integrand: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "uniterated_integral",
  integrand,
}, options);

export const closedIntegral = (integrand: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "closed_integral",
  integrand,
}, options);

export const multipleIntegral = (
  integrand: Expr,
  order: number,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "multiple_integral",
  integrand,
  order,
}, options);

export const differential = (variable: Expr, options?: DifferentialOptions): Expr => withOptions({
  kind: "differential",
  variable,
  ...(options?.inexact ? { inexact: true } : {}),
}, options);

export const partialDerivative = (quantity: Expr, variable: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "partial_derivative",
  quantity,
  variable,
}, options);

export const fullDerivativeOperator = (variable: Expr, operand: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "full_derivative_operator",
  variable,
  operand,
}, options);

export const partialDerivativeOperator = (variable: Expr, operand: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "partial_derivative_operator",
  variable,
  operand,
}, options);

export const secondOrderPartialDerivative = (
  dependentVariable: Expr,
  independentVariables: Expr[],
  degree = 2,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "second_order_partial_derivative",
  degree,
  dependentVariable,
  independentVariables,
}, options);

export const partialAtConstQuantity = (
  quantity: Expr,
  variable: Expr,
  constantQuantity: Expr,
  options?: ExprOptions,
): Expr => withOptions({
  kind: "partial_at_const_quantity",
  quantity,
  variable,
  constantQuantity,
}, options);

export const displayGroup = (delimiter: DelimiterKind, expression: Expr, options?: ExprOptions): Expr => withOptions({
  kind: "display_group",
  delimiter,
  expression,
}, options);

export const immutableExpression = (latex: string, options?: ExprOptions): Expr => withOptions({
  kind: "immutable_expression",
  latex,
}, options);

export const invalidInput = (message: string, latex: string, options?: ExprOptions): Expr => withOptions({
  kind: "invalid_input",
  latex,
  error: message,
}, options);
