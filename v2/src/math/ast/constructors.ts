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

export const negate = (value: Expr): Expr => ({ kind: "negate", value });

export const divide = (numerator: Expr, denominator: Expr): Expr => ({
  kind: "divide",
  numerator,
  denominator,
});

export const equation = (sides: Expr[]): Expr => ({ kind: "equation", sides });

export const call = (callee: Expr, args: Expr[]): Expr => ({
  kind: "call",
  callee,
  args,
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

export const integral = (
  integrand: Expr,
  variable: Expr | null,
  lowerBound: Expr | null,
  upperBound: Expr | null,
  differentialSlot: "prefix" | "suffix" | "middle" | "unknown",
): Expr => ({
  kind: "integral",
  integrand,
  variable,
  lowerBound,
  upperBound,
  differentialSlot,
});

export const uniteratedIntegral = (integrand: Expr, variable: Expr | null): Expr => ({
  kind: "uniterated_integral",
  integrand,
  variable,
});

export const closedIntegral = (integrand: Expr, variable: Expr | null): Expr => ({
  kind: "closed_integral",
  integrand,
  variable,
});

export const multipleIntegral = (
  integrand: Expr,
  order: number,
  variable: Expr | null,
): Expr => ({
  kind: "multiple_integral",
  integrand,
  order,
  variable,
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

export const rawMathJson = (reason: string, value: unknown): Expr => ({
  kind: "raw_mathjson",
  reason,
  value,
});
