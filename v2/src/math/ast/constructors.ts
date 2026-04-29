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
