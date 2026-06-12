import { immutableExpression, invalidInput, type Expr } from "../../ast";
import { normalizeLegacyNegates } from "../../rewrite/algebraUtils";
import { coerceLatexForExpressionParser } from "./coerceLatexForExpressionParser";
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
  const parseLatex = coerceLatexForExpressionParser(latex).latex;
  const { expr, error } = parseLatexToExprWithUnifiedLatexResult(parseLatex);
  if (expr) {
    const normalized = normalizeLegacyNegates(expr);
    return { ...normalized, error: normalized.error ?? null };
  }

  const onError = options.onError ?? "immutable_expression";
  if (onError === "null") return null;
  if (onError === "throw") {
    const reason = error?.message ?? "Unknown parse failure.";
    throw new Error(`Unable to parse LaTeX "${latex}": ${reason}`);
  }
  if (error?.code === "invalid_input") {
    return invalidInput(error.message, parseLatex.trim());
  }
  return {
    ...immutableExpression(parseLatex.trim()),
    ...(error?.message ? { error: error.message } : {}),
  };
}
