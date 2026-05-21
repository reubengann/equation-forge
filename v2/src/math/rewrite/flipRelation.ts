import { cloneExpr } from "../ast/utils";
import type { Expr, InequalityExpr } from "../ast/expr";

export function canRun(expr: Expr): boolean {
  return expr.kind === "equation" || expr.kind === "inequality";
}

export function run(expr: Expr): Expr {
  if (expr.kind === "equation") {
    return {
      ...cloneExpr(expr),
      sides: expr.sides.map(cloneExpr).reverse(),
    };
  }

  if (expr.kind === "inequality") {
    return {
      ...cloneExpr(expr),
      operator: flipInequalityOperator(expr.operator),
      lhs: cloneExpr(expr.rhs),
      rhs: cloneExpr(expr.lhs),
    };
  }

  return cloneExpr(expr);
}

function flipInequalityOperator(operator: InequalityExpr["operator"]): InequalityExpr["operator"] {
  switch (operator) {
    case "geq":
      return "leq";
    case "leq":
      return "geq";
    case "gt":
      return "lt";
    case "lt":
      return "gt";
  }
}
