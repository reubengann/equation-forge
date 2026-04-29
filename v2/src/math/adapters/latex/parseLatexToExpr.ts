import { sym, type Expr } from "../../ast";
import { parseLatexToExprWithUnifiedLatex } from "./unifiedLatexToExpr";

export function parseLatexToExpr(latex: string): Expr {
  const unifiedExpr = parseLatexToExprWithUnifiedLatex(latex);
  if (unifiedExpr) return unifiedExpr;
  const fallback = latex.trim();
  return sym(fallback.length > 0 ? fallback : "unsupported");
}
