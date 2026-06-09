import { cloneExpr } from "../ast/utils";
import type { Expr, InequalityExpr } from "../ast/expr";

export function canRun(expr: Expr): boolean {
  return expr.kind === "equation" || expr.kind === "inequality";
}

export function run(expr: Expr): Expr {
  if (expr.kind === "equation") {
    const nextExpr = cloneExpr(expr) as typeof expr;
    nextExpr.sides = expr.sides.map(cloneExpr).reverse();
    return nextExpr;
  }

  if (expr.kind === "inequality") {
    const nextExpr = cloneExpr(expr) as typeof expr;
    nextExpr.operator = flipInequalityOperator(expr.operator);
    nextExpr.lhs = cloneExpr(expr.rhs);
    nextExpr.rhs = cloneExpr(expr.lhs);
    return nextExpr;
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
