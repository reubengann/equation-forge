import type { Expr } from "./expr";

export type CompiledExprIndex = {
  rootId: string;
  nodeById: Record<string, Expr>;
  parentById: Record<string, string | null>;
  ancestorsById: Record<string, string[]>;
  childrenById: Record<string, string[]>;
};

function exprChildren(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "number":
    case "symbol":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return [];
    case "add":
      return expr.terms;
    case "multiply":
      return expr.factors;
    case "power":
      return [expr.base, expr.exponent];
    case "negate":
      return [expr.value];
    case "divide":
      return [expr.numerator, expr.denominator];
    case "root":
      return [expr.value];
    case "equation":
      return expr.sides;
    case "inequality":
      return [expr.lhs, expr.rhs];
    case "call":
      return [expr.callee, ...expr.args];
    case "absolute_value":
      return [expr.value];
    case "vector":
      return [expr.value];
    case "hat":
      return [expr.value];
    case "inner_product":
      return expr.factors;
    case "outer_product":
      return expr.factors;
    case "dotted_expr":
      return [expr.value];
    case "primed":
      return [expr.value];
    case "special_font":
      return [expr.value];
    case "big_sum":
      return [
        ...(expr.lowerBound ? [expr.lowerBound] : []),
        ...(expr.upperBound ? [expr.upperBound] : []),
        expr.summand,
      ];
    case "big_prod":
      return [
        ...(expr.lowerBound ? [expr.lowerBound] : []),
        ...(expr.upperBound ? [expr.upperBound] : []),
        expr.muliplicand,
      ];
    case "integral":
      return [
        ...(expr.lowerBound ? [expr.lowerBound] : []),
        ...(expr.upperBound ? [expr.upperBound] : []),
        expr.integrand,
      ];
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      return [expr.integrand];
    case "differential":
      return [expr.variable];
    case "partial_derivative":
      return [expr.quantity, expr.variable];
    case "full_derivative_operator":
      return [expr.variable, expr.operand];
    case "partial_derivative_operator":
      return [expr.variable, expr.operand];
    case "display_group":
      return [expr.expression];
    case "second_order_partial_derivative":
      return [expr.dependentVariable, ...expr.independentVariables];
    case "partial_at_const_quantity":
      return [expr.quantity, expr.variable, expr.constantQuantity];
  }
}

export function buildCompiledExprIndex(root: Expr): CompiledExprIndex {
  const nodeById: Record<string, Expr> = {};
  const parentById: Record<string, string | null> = {};
  const ancestorsById: Record<string, string[]> = {};
  const childrenById: Record<string, string[]> = {};
  let nextId = 1;

  const visit = (
    expr: Expr,
    parentId: string | null,
    ancestors: string[],
  ): string => {
    const id = `n${nextId++}`;
    nodeById[id] = expr;
    parentById[id] = parentId;
    ancestorsById[id] = ancestors;
    if (!childrenById[id]) childrenById[id] = [];
    if (parentId) childrenById[parentId].push(id);
    const nextAncestors = [...ancestors, id];
    for (const child of exprChildren(expr)) {
      visit(child, id, nextAncestors);
    }
    return id;
  };

  const rootId = visit(root, null, []);
  return { rootId, nodeById, parentById, ancestorsById, childrenById };
}
