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
  notation?: "prefix" | "subtraction";
};

export type DivideExpr = {
  kind: "divide";
  numerator: Expr;
  denominator: Expr;
};

export type RootExpr = {
  kind: "root";
  value: Expr;
  degree: number;
};

export type EquationExpr = {
  kind: "equation";
  sides: Expr[];
};

export type InequalityExpr = {
  kind: "inequality";
  operator: "geq" | "leq" | "gt" | "lt";
  lhs: Expr;
  rhs: Expr;
};

/*
Note: although callee will always be symbol for an normal parsed function call, it's possible
to define a call of the form (f+g)(x) or f(x)(y) that would not adhere to this.
*/
export type FunctionCallExpr = {
  kind: "call";
  callee: Expr;
  args: Expr[];
  delimiter: "paren" | "bracket" | "bare";
};

export type TextExpr = {
  kind: "text";
  text: string;
};

export type AbsoluteValueExpr = {
  kind: "absolute_value";
  value: Expr;
};

export type VectorExpr = {
  kind: "vector";
  value: Expr;
};

export type HatExpr = {
  kind: "hat";
  value: Expr;
};

export type InnerProductExpr = {
  kind: "inner_product";
  factors: Expr[];
};

export type OuterProductExpr = {
  kind: "outer_product";
  factors: Expr[];
};

export type DottedExpr = {
  kind: "dotted_expr";
  value: Expr;
  order: number;
};

export type PrimedExpr = {
  kind: "primed";
  value: Expr;
  order: number;
  name?: string;
};

export type SpecialFontExpr = {
  kind: "special_font";
  value: Expr;
  font: "script" | "calligraphic" | "blackboard";
};

export type BigSumExpr = {
  kind: "big_sum";
  summand: Expr;
  lowerBound: Expr | null;
  upperBound: Expr | null;
};

export type BigProdExpr = {
  kind: "big_prod";
  muliplicand: Expr;
  lowerBound: Expr | null;
  upperBound: Expr | null;
};

export type IntegralExpr = {
  kind: "integral";
  integrand: Expr;
  lowerBound: Expr | null;
  upperBound: Expr | null;
};

export type UniteratedIntegralExpr = {
  kind: "uniterated_integral";
  integrand: Expr;
};

export type ClosedIntegralExpr = {
  kind: "closed_integral";
  integrand: Expr;
};

export type MultipleIntegralExpr = {
  kind: "multiple_integral";
  integrand: Expr;
  order: number;
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

export type FullDerivativeOperatorExpr = {
  kind: "full_derivative_operator";
  variable: Expr;
  operand: Expr;
};

export type PartialDerivativeOperatorExpr = {
  kind: "partial_derivative_operator";
  variable: Expr;
  operand: Expr;
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

export type PartialAtConstQuantityExpr = {
  kind: "partial_at_const_quantity";
  variable: Expr;
  quantity: Expr;
  constantQuantity: Expr;
};

export type ImmutableExpressionExpr = {
  kind: "immutable_expression";
  latex: string;
};

export type InvalidInputExpr = {
  kind: "invalid_input";
  latex: string;
};

type ExprMeta = {
  error?: string | null;
};

type ExprCore =
  | NumberExpr
  | SymbolExpr
  | AddExpr
  | MultiplyExpr
  | PowerExpr
  | NegateExpr
  | DivideExpr
  | RootExpr
  | EquationExpr
  | InequalityExpr
  | FunctionCallExpr
  | TextExpr
  | AbsoluteValueExpr
  | VectorExpr
  | HatExpr
  | InnerProductExpr
  | OuterProductExpr
  | DottedExpr
  | PrimedExpr
  | SpecialFontExpr
  | BigSumExpr
  | BigProdExpr
  | IntegralExpr
  | UniteratedIntegralExpr
  | ClosedIntegralExpr
  | MultipleIntegralExpr
  | DifferentialExpr
  | PartialDerivativeExpr
  | FullDerivativeOperatorExpr
  | PartialDerivativeOperatorExpr
  | DisplayGroupExpr
  | PartialAtConstQuantityExpr
  | SecondOrderPartialDerivativeExpr
  | ImmutableExpressionExpr
  | InvalidInputExpr;

export type Expr = ExprCore & ExprMeta;
