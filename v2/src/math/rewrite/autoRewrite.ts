import type { TermSelection } from "../../selection/types";
import { add, displayGroup, multiply, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";
import { canCleanupExpr, cleanupExpr } from "./cleanup";
import { canDistributeExpr, distributeExpr } from "./distribute";
import { canFactorExpr, factorExpr } from "./factor";

export type AutoRewriteKind = "factor" | "distribute" | "cleanup";

type MultiSelectionRange = {
  parentId: string;
  parent: Expr;
  start: number;
  end: number;
  selectedExpr: Expr;
};

export function canAutoRewrite(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  kind: AutoRewriteKind,
): boolean {
  if (!selection) return false;

  const selectionExpr = exprForSelection(document, selection);
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

  if (selection.kind === "single") {
    const selected = document.index.nodeById[selection.nodeId];
    if (!selected) return null;
    const rewritten = rewriteExpr(selected, kind);
    if (!rewritten) return null;
    return replaceCompiledNode(document, selection.nodeId, wrapReplacementForLocation(document, selection.nodeId, rewritten));
  }

  const range = resolveMultiSelectionRange(document, selection);
  if (!range) return null;
  const rewritten = rewriteExpr(range.selectedExpr, kind);
  if (!rewritten) return null;

  const nextParent = cloneExpr(range.parent);
  const replacement = wrapReplacementForContainerChild(range.parent, rewritten);
  if (nextParent.kind === "add") {
    nextParent.terms = [
      ...nextParent.terms.slice(0, range.start),
      replacement,
      ...nextParent.terms.slice(range.end + 1),
    ];
  } else if (nextParent.kind === "multiply") {
    nextParent.factors = [
      ...nextParent.factors.slice(0, range.start),
      replacement,
      ...nextParent.factors.slice(range.end + 1),
    ];
  } else {
    return null;
  }
  return replaceCompiledNode(document, range.parentId, nextParent);
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

function exprForSelection(document: CompiledMathDocument, selection: TermSelection): Expr | null {
  if (selection.kind === "single") {
    return document.index.nodeById[selection.nodeId] ?? null;
  }
  return resolveMultiSelectionRange(document, selection)?.selectedExpr ?? null;
}

function resolveMultiSelectionRange(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "multi" }>,
): MultiSelectionRange | null {
  const { containerNodeId } = selection;
  if (!containerNodeId || selection.nodeIds.length === 0) return null;

  const parent = document.index.nodeById[containerNodeId];
  if (!parent || (parent.kind !== "add" && parent.kind !== "multiply")) return null;

  const indexedChildren = selection.nodeIds
    .map((nodeId) => {
      const location = document.index.locationById[nodeId];
      if (location?.parentId !== containerNodeId || location.index == null) return null;
      return { index: location.index };
    })
    .filter((child): child is { index: number } => child !== null)
    .sort((a, b) => a.index - b.index);

  if (indexedChildren.length !== selection.nodeIds.length) return null;

  const start = indexedChildren[0]?.index;
  const end = indexedChildren[indexedChildren.length - 1]?.index;
  if (start == null || end == null) return null;
  if (end - start + 1 !== indexedChildren.length) return null;

  const selectedChildren =
    parent.kind === "add"
      ? parent.terms.slice(start, end + 1).map(cloneExpr)
      : parent.factors.slice(start, end + 1).map(cloneExpr);
  if (selectedChildren.length !== indexedChildren.length) return null;

  return {
    parentId: containerNodeId,
    parent,
    start,
    end,
    selectedExpr: parent.kind === "add" ? add(selectedChildren) : multiply(selectedChildren),
  };
}

function wrapReplacementForLocation(document: CompiledMathDocument, nodeId: string, replacement: Expr): Expr {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId || !location.field) return cloneExpr(replacement);

  const parent = document.index.nodeById[location.parentId];
  if (!parent) return cloneExpr(replacement);

  if (parent.kind === "power" && location.field === "base") return displayGroup("paren", cloneExpr(replacement));
  return wrapReplacementForContainerChild(parent, replacement);
}

function wrapReplacementForContainerChild(parent: Expr, replacement: Expr): Expr {
  if (parent.kind === "multiply" && replacement.kind === "add") return displayGroup("paren", cloneExpr(replacement));
  return cloneExpr(replacement);
}
