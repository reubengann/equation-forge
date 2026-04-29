import { ComputeEngine } from "@cortex-js/compute-engine";
import type { Expr } from "../../ast";
import { fromMathJson, type MathJsonValue } from "../mathjson";

export type ParseLatexToExprOptions = {
  computeEngine?: ComputeEngine;
};

export function parseLatexToMathJson(
  latex: string,
  options?: ParseLatexToExprOptions,
): MathJsonValue {
  const computeEngine = options?.computeEngine ?? new ComputeEngine();
  const boxedExpression = computeEngine.parse(latex);
  return boxedExpression.json as MathJsonValue;
}

export function parseLatexToExpr(
  latex: string,
  options?: ParseLatexToExprOptions,
): Expr {
  const mathJson = parseLatexToMathJson(latex, options);
  return fromMathJson(mathJson);
}
