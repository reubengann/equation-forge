import { immutableExpression, type Expr } from "../../ast";
import { parseLatexToExprWithUnifiedLatex } from "./unifiedLatexToExpr";

export function parseLatexToExpr(latex: string): Expr {
  const unifiedExpr = parseLatexToExprWithUnifiedLatex(latex);
  if (unifiedExpr) return unifiedExpr;
  return immutableExpression(latex.trim());
}
