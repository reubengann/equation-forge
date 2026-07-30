import { canEvaluateAlgebrite, evaluateAlgebrite } from "../adapters/algebrite";
import { type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import type { TermSelection } from "../selection";
import { structuralKeyIgnoringDisplayGroups } from "./algebraUtils";
import { getSelectionRewriteTarget, replaceSelectionWithExpr } from "./selectionRewrite";

export type AlgebriteEvaluationFailureReason =
  | "no_selection"
  | "selection_not_found"
  | "not_translatable"
  | "unchanged"
  | "replacement_failed";

export type AlgebriteEvaluationResult =
  | { ok: true; expr: Expr }
  | { ok: false; reason: AlgebriteEvaluationFailureReason; detail?: string };

export function canEvaluateWithAlgebrite(document: CompiledMathDocument, selection: TermSelection | null): boolean {
  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return false;
  return canEvaluateAlgebrite(target.expr);
}

export function evaluateSelectionWithAlgebrite(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): AlgebriteEvaluationResult {
  if (!selection) return { ok: false, reason: "no_selection" };

  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return { ok: false, reason: "selection_not_found" };

  const rewritten = evaluateExprWithAlgebrite(target.expr);
  if (!rewritten.ok) return rewritten;

  const replaced = replaceSelectionWithExpr(document, selection, rewritten.expr);
  if (!replaced) return { ok: false, reason: "replacement_failed" };
  return { ok: true, expr: replaced };
}

function evaluateExprWithAlgebrite(expr: Expr): AlgebriteEvaluationResult {
  const output = evaluateAlgebrite(expr);
  if (!output) return { ok: false, reason: "not_translatable" };
  if (sameExpr(output, expr)) return { ok: false, reason: "unchanged" };
  return { ok: true, expr: output };
}

function sameExpr(left: Expr, right: Expr): boolean {
  return structuralKeyIgnoringDisplayGroups(left) === structuralKeyIgnoringDisplayGroups(right);
}
