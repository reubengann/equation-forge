import { immutableExpression, invalidInput, type Expr } from "../../ast";
import { parseLatexToExprWithUnifiedLatexResult } from "./unifiedLatexToExpr";

type ParseLatexOnError = "immutable_expression" | "null" | "throw";

export type ParseLatexToExprOptions = {
  onError?: ParseLatexOnError;
};

export function parseLatexToExpr(latex: string): Expr;
export function parseLatexToExpr(
  latex: string,
  options: { onError: "immutable_expression" },
): Expr;
export function parseLatexToExpr(
  latex: string,
  options: { onError: "throw" },
): Expr;
export function parseLatexToExpr(
  latex: string,
  options: { onError: "null" },
): Expr | null;
export function parseLatexToExpr(
  latex: string,
  options: ParseLatexToExprOptions = {},
): Expr | null {
  const { expr, error } = parseLatexToExprWithUnifiedLatexResult(latex);
  if (expr) return { ...expr, error: null };

  const onError = options.onError ?? "immutable_expression";
  if (onError === "null") return null;
  if (onError === "throw") {
    const reason = error?.message ?? "Unknown parse failure.";
    throw new Error(`Unable to parse LaTeX "${latex}": ${reason}`);
  }
  if (error?.code === "invalid_input") {
    return invalidInput(error.message, latex.trim());
  }
  return {
    ...immutableExpression(latex.trim()),
    ...(error?.message ? { error: error.message } : {}),
  };
}
