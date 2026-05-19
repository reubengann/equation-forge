import type { DelimiterKind, Expr } from "./expr";

export const num = (value: number | string): Expr => ({ kind: "number", value });

export const sym = (name: string): Expr => ({ kind: "symbol", name });

export const add = (terms: Expr[]): Expr => ({ kind: "add", terms });

export const multiply = (factors: Expr[]): Expr => ({ kind: "multiply", factors });

export const power = (base: Expr, exponent: Expr): Expr => ({
  kind: "power",
  base,
  exponent,
});

export const negate = (value: Expr, notation: "prefix" | "subtraction" = "prefix"): Expr => ({
  kind: "negate",
  value,
  notation,
});

export const divide = (numerator: Expr, denominator: Expr): Expr => ({
  kind: "divide",
  numerator,
  denominator,
});

export const root = (value: Expr, degree = 2): Expr => ({
  kind: "root",
  value,
  degree,
});

export const equation = (sides: Expr[]): Expr => ({ kind: "equation", sides });

export const inequality = (
  lhs: Expr,
  operator: "geq" | "leq" | "gt" | "lt",
  rhs: Expr,
): Expr => ({
  kind: "inequality",
  operator,
  lhs,
  rhs,
});

export const call = (
  callee: Expr,
  args: Expr[],
  delimiter: "paren" | "bracket" | "bare" = "bare",
): Expr => ({
  kind: "call",
  callee,
  args,
  delimiter,
});

export const text = (value: string): Expr => ({
  kind: "text",
  text: value,
});

export const absoluteValue = (value: Expr): Expr => ({
  kind: "absolute_value",
  value,
});

export const vector = (value: Expr): Expr => ({
  kind: "vector",
  value,
});

export const hat = (value: Expr): Expr => ({
  kind: "hat",
  value,
});

export const innerProduct = (factors: Expr[]): Expr => ({
  kind: "inner_product",
  factors,
});

export const outerProduct = (factors: Expr[]): Expr => ({
  kind: "outer_product",
  factors,
});

export const dottedExpr = (value: Expr, order: number): Expr => ({
  kind: "dotted_expr",
  value,
  order,
});

export const primed = (value: Expr, order: number): Expr => ({
  kind: "primed",
  value,
  order,
  ...(value.kind === "symbol" ? { name: value.name } : {}),
});

export const specialFont = (
  value: Expr,
  font: "script" | "calligraphic" | "blackboard",
): Expr => ({
  kind: "special_font",
  value,
  font,
});

export const bigSum = (
  summand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
): Expr => ({
  kind: "big_sum",
  summand,
  lowerBound,
  upperBound,
});

export const bigProd = (
  muliplicand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
): Expr => ({
  kind: "big_prod",
  muliplicand,
  lowerBound,
  upperBound,
});

export const integral = (
  integrand: Expr,
  lowerBound: Expr | null,
  upperBound: Expr | null,
): Expr => ({
  kind: "integral",
  integrand,
  lowerBound,
  upperBound,
});

export const uniteratedIntegral = (integrand: Expr): Expr => ({
  kind: "uniterated_integral",
  integrand,
});

export const closedIntegral = (integrand: Expr): Expr => ({
  kind: "closed_integral",
  integrand,
});

export const multipleIntegral = (
  integrand: Expr,
  order: number,
): Expr => ({
  kind: "multiple_integral",
  integrand,
  order,
});

export const differential = (variable: Expr): Expr => ({
  kind: "differential",
  variable,
});

export const partialDerivative = (quantity: Expr, variable: Expr): Expr => ({
  kind: "partial_derivative",
  quantity,
  variable,
});

export const fullDerivativeOperator = (variable: Expr, operand: Expr): Expr => ({
  kind: "full_derivative_operator",
  variable,
  operand,
});

export const partialDerivativeOperator = (variable: Expr, operand: Expr): Expr => ({
  kind: "partial_derivative_operator",
  variable,
  operand,
});

export const secondOrderPartialDerivative = (
  dependentVariable: Expr,
  independentVariables: Expr[],
  degree = 2,
): Expr => ({
  kind: "second_order_partial_derivative",
  degree,
  dependentVariable,
  independentVariables,
});

export const partialAtConstQuantity = (
  quantity: Expr,
  variable: Expr,
  constantQuantity: Expr,
): Expr => ({
  kind: "partial_at_const_quantity",
  quantity,
  variable,
  constantQuantity,
});

export const displayGroup = (delimiter: DelimiterKind, expression: Expr): Expr => ({
  kind: "display_group",
  delimiter,
  expression,
});

export const immutableExpression = (latex: string): Expr => ({
  kind: "immutable_expression",
  latex,
});

export const invalidInput = (message: string, latex: string): Expr => ({
  kind: "invalid_input",
  latex,
  error: message,
});
