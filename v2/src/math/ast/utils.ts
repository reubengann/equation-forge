import type { Expr } from "./expr";

export function cloneExpr(expr: Expr): Expr {
  return structuredClone(expr);
}
