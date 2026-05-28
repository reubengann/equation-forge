import type { Expr } from "../ast";
import { exprToLatex } from "../adapters/latex";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import type { TermSelection } from "../../selection/types";
import {
  getSelectionRewriteTarget,
  replaceSelectionWithExpr,
} from "./selectionRewrite";

export type SubstitutionSelection = {
  expr: Expr;
  latex: string;
};

export function isValidSubstitutionReplacement(expr: Expr): boolean {
  return expr.kind !== "equation" && expr.kind !== "inequality";
}

export function canSubstituteSelection(document: CompiledMathDocument, selection: TermSelection | null): boolean {
  return getSubstitutionSelection(document, selection) !== null;
}

export function getSubstitutionSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): SubstitutionSelection | null {
  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return null;
  return { expr: target.expr, latex: exprToLatex(target.expr, false) };
}

export function substituteSelection(
  document: CompiledMathDocument,
  selection: TermSelection,
  replacement: Expr,
): Expr | null {
  if (!isValidSubstitutionReplacement(replacement)) return null;
  return replaceSelectionWithExpr(document, selection, replacement);
}
