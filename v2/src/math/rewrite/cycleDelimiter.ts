import type { TermSelection } from "../../selection/types";
import { type DelimiterKind, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";

export function canCycleDelimiterSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): boolean {
  return resolveCycleDelimiterTarget(document, selection) !== null;
}

export function cycleDelimiterSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): Expr | null {
  const target = resolveCycleDelimiterTarget(document, selection);
  if (!target) return null;

  const nextExpr = cloneExpr(target.expr);
  nextExpr.delimiter = nextDelimiterKind(target.expr.delimiter);
  return replaceCompiledNode(document, target.nodeId, nextExpr);
}

function resolveCycleDelimiterTarget(
  document: CompiledMathDocument,
  selection: TermSelection | null,
):
  | { nodeId: string; expr: Extract<Expr, { kind: "display_group" }> }
  | { nodeId: string; expr: Extract<Expr, { kind: "call" }> }
  | null {
  if (!selection || selection.kind !== "single") return null;
  const expr = document.index.nodeById[selection.nodeId];
  if (expr?.kind === "display_group" && isCyclableDelimiter(expr.delimiter)) {
    return { nodeId: selection.nodeId, expr };
  }
  if (expr?.kind === "call" && isCyclableDelimiter(expr.delimiter)) {
    return { nodeId: selection.nodeId, expr };
  }
  return null;
}

function isCyclableDelimiter(delimiter: DelimiterKind | "bare"): delimiter is "paren" | "bracket" {
  return delimiter === "paren" || delimiter === "bracket";
}

function nextDelimiterKind(delimiter: "paren" | "bracket"): "paren" | "bracket" {
  return delimiter === "paren" ? "bracket" : "paren";
}
