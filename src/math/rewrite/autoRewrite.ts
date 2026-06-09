import type { TermSelection } from "../../selection/types";
import type { Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { canCleanupExpr, cleanupExpr } from "./cleanup";
import { canDistributeExpr, distributeExpr } from "./distribute";
import { canFactorExpr, factorExpr } from "./factor";
import { getSelectionRewriteTarget, replaceSelectionWithExpr } from "./selectionRewrite";

export type AutoRewriteKind = "factor" | "distribute" | "cleanup";

export function canAutoRewrite(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  kind: AutoRewriteKind,
): boolean {
  if (!selection) return false;

  const selectionExpr = getSelectionRewriteTarget(document, selection)?.expr ?? null;
  if (!selectionExpr) return false;

  switch (kind) {
    case "factor":
      return canFactorExpr(selectionExpr);
    case "distribute":
      return canDistributeExpr(selectionExpr);
    case "cleanup":
      return canCleanupExpr(selectionExpr);
  }
}

export function autoRewriteSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  kind: AutoRewriteKind,
): Expr | null {
  if (!selection) return null;

  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return null;
  const rewritten = rewriteExpr(target.expr, kind);
  if (!rewritten) return null;
  return replaceSelectionWithExpr(document, selection, rewritten);
}

function rewriteExpr(expr: Expr, kind: AutoRewriteKind): Expr | null {
  switch (kind) {
    case "factor":
      return factorExpr(expr);
    case "distribute":
      return distributeExpr(expr);
    case "cleanup":
      return cleanupExpr(expr);
  }
}
