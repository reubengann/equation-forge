export type DelimiterKind = "paren" | "bracket" | "brace" | "angle" | "other";

export type NumberExpr = {
  kind: "number";
  value: number | string;
};

export type SymbolExpr = {
  kind: "symbol";
  name: string;
};

export type AddExpr = {
  kind: "add";
  terms: Expr[];
};

export type MultiplyExpr = {
  kind: "multiply";
  factors: Expr[];
};

export type PowerExpr = {
  kind: "power";
  base: Expr;
  exponent: Expr;
};

export type NegateExpr = {
  kind: "negate";
  value: Expr;
};

export type DivideExpr = {
  kind: "divide";
  numerator: Expr;
  denominator: Expr;
};

export type EquationExpr = {
  kind: "equation";
  sides: Expr[];
};

export type FunctionCallExpr = {
  kind: "call";
  callee: Expr;
  args: Expr[];
};

export type IntegralExpr = {
  kind: "integral";
  integrand: Expr;
  variable: Expr | null;
  lowerBound: Expr | null;
  upperBound: Expr | null;
  differentialSlot: "prefix" | "suffix" | "middle" | "unknown";
};

export type UniteratedIntegralExpr = {
  kind: "uniterated_integral";
  integrand: Expr;
  variable: Expr | null;
};

export type DifferentialExpr = {
  kind: "differential";
  variable: Expr;
};

export type PartialDerivativeExpr = {
  kind: "partial_derivative";
  variable: Expr;
  quantity: Expr;
};

export type DisplayGroupExpr = {
  kind: "display_group";
  delimiter: DelimiterKind;
  expression: Expr;
};

export type SecondOrderPartialDerivativeExpr = {
  kind: "second_order_partial_derivative";
  degree: number;
  dependentVariable: Expr;
  independentVariables: Expr[];
};

export type RawMathJsonExpr = {
  kind: "raw_mathjson";
  reason: string;
  value: unknown;
};

export type PartialAtConstQuantityExpr = {
  kind: "partial_at_const_quantity";
  variable: Expr;
  quantity: Expr;
  constantQuantity: Expr;
};

export type Expr =
  | NumberExpr
  | SymbolExpr
  | AddExpr
  | MultiplyExpr
  | PowerExpr
  | NegateExpr
  | DivideExpr
  | EquationExpr
  | FunctionCallExpr
  | IntegralExpr
  | UniteratedIntegralExpr
  | DifferentialExpr
  | PartialDerivativeExpr
  | DisplayGroupExpr
  | RawMathJsonExpr
  | PartialAtConstQuantityExpr
  | SecondOrderPartialDerivativeExpr;
