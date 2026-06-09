import type { Expr } from "./expr";

export type CompiledExprNodeLocation = {
  parentId: string | null;
  field: string | null;
  index?: number;
};

export type CompiledExprIndex = {
  rootId: string;
  nodeById: Record<string, Expr>;
  parentById: Record<string, string | null>;
  ancestorsById: Record<string, string[]>;
  childrenById: Record<string, string[]>;
  locationById: Record<string, CompiledExprNodeLocation>;
};

type ExprChildLocation = {
  expr: Expr;
  field: string;
  index?: number;
};

function exprChildLocations(expr: Expr): ExprChildLocation[] {
  switch (expr.kind) {
    case "number":
    case "symbol":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return [];
    case "add":
      return expr.terms.map((term, index) => ({ expr: term, field: "terms", index }));
    case "multiply":
      return expr.factors.map((factor, index) => ({ expr: factor, field: "factors", index }));
    case "power":
      return [
        { expr: expr.base, field: "base" },
        { expr: expr.exponent, field: "exponent" },
      ];
    case "negate":
      return [{ expr: expr.value, field: "value" }];
    case "divide":
      return [
        { expr: expr.numerator, field: "numerator" },
        { expr: expr.denominator, field: "denominator" },
      ];
    case "root":
      return [{ expr: expr.value, field: "value" }];
    case "equation":
      return expr.sides.map((side, index) => ({ expr: side, field: "sides", index }));
    case "inequality":
      return [
        { expr: expr.lhs, field: "lhs" },
        { expr: expr.rhs, field: "rhs" },
      ];
    case "call":
      return [
        { expr: expr.callee, field: "callee" },
        ...expr.args.map((arg, index) => ({ expr: arg, field: "args", index })),
      ];
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      return [{ expr: expr.value, field: "value" }];
    case "inner_product":
    case "outer_product":
      return expr.factors.map((factor, index) => ({ expr: factor, field: "factors", index }));
    case "big_sum":
      return [
        ...(expr.lowerBound ? [{ expr: expr.lowerBound, field: "lowerBound" }] : []),
        ...(expr.upperBound ? [{ expr: expr.upperBound, field: "upperBound" }] : []),
        { expr: expr.summand, field: "summand" },
      ];
    case "big_prod":
      return [
        ...(expr.lowerBound ? [{ expr: expr.lowerBound, field: "lowerBound" }] : []),
        ...(expr.upperBound ? [{ expr: expr.upperBound, field: "upperBound" }] : []),
        { expr: expr.muliplicand, field: "muliplicand" },
      ];
    case "limit":
      return [
        ...(expr.lowerBound ? [{ expr: expr.lowerBound, field: "lowerBound" }] : []),
        { expr: expr.expression, field: "expression" },
      ];
    case "integral":
      return [
        ...(expr.lowerBound ? [{ expr: expr.lowerBound, field: "lowerBound" }] : []),
        ...(expr.upperBound ? [{ expr: expr.upperBound, field: "upperBound" }] : []),
        { expr: expr.integrand, field: "integrand" },
      ];
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      return [{ expr: expr.integrand, field: "integrand" }];
    case "differential":
      return [{ expr: expr.variable, field: "variable" }];
    case "partial_derivative":
      return [
        { expr: expr.quantity, field: "quantity" },
        { expr: expr.variable, field: "variable" },
      ];
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return [
        { expr: expr.variable, field: "variable" },
        { expr: expr.operand, field: "operand" },
      ];
    case "display_group":
      return [{ expr: expr.expression, field: "expression" }];
    case "second_order_partial_derivative":
      return [
        { expr: expr.dependentVariable, field: "dependentVariable" },
        ...expr.independentVariables.map((variable, index) => ({
          expr: variable,
          field: "independentVariables",
          index,
        })),
      ];
    case "partial_at_const_quantity":
      return [
        { expr: expr.quantity, field: "quantity" },
        { expr: expr.variable, field: "variable" },
        { expr: expr.constantQuantity, field: "constantQuantity" },
      ];
  }
}

export function buildCompiledExprIndex(root: Expr): CompiledExprIndex {
  const nodeById: Record<string, Expr> = {};
  const parentById: Record<string, string | null> = {};
  const ancestorsById: Record<string, string[]> = {};
  const childrenById: Record<string, string[]> = {};
  const locationById: Record<string, CompiledExprNodeLocation> = {};
  let nextId = 1;

  const visit = (
    expr: Expr,
    parentId: string | null,
    ancestors: string[],
    location: Omit<CompiledExprNodeLocation, "parentId">,
  ): string => {
    const id = `n${nextId++}`;
    nodeById[id] = expr;
    parentById[id] = parentId;
    ancestorsById[id] = ancestors;
    locationById[id] = { parentId, ...location };
    if (!childrenById[id]) childrenById[id] = [];
    if (parentId) childrenById[parentId].push(id);
    const nextAncestors = [...ancestors, id];
    for (const child of exprChildLocations(expr)) {
      visit(child.expr, id, nextAncestors, {
        field: child.field,
        ...(child.index != null ? { index: child.index } : {}),
      });
    }
    return id;
  };

  const rootId = visit(root, null, [], { field: null });
  return { rootId, nodeById, parentById, ancestorsById, childrenById, locationById };
}
