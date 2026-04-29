import { ComputeEngine } from "@cortex-js/compute-engine";
import { rawMathJson, type Expr } from "../../ast";
import { parseLatexToExprWithUnifiedLatex } from "./unifiedLatexToExpr";

export type ParseLatexToExprOptions = {
  computeEngine?: ComputeEngine;
};

export function parseLatexToMathJson(
  latex: string,
  options?: ParseLatexToExprOptions,
): unknown {
  const computeEngine = options?.computeEngine ?? new ComputeEngine();
  const boxedExpression = computeEngine.parse(latex);
  return boxedExpression.json;
}

export function parseLatexToExpr(
  latex: string,
  options?: ParseLatexToExprOptions,
): Expr {
  const unifiedExpr = parseLatexToExprWithUnifiedLatex(latex);
  if (unifiedExpr) return unifiedExpr;
  const mathJson = parseLatexToMathJson(latex, options);
  return rawMathJson("compute_engine_fallback", mathJson);
}
