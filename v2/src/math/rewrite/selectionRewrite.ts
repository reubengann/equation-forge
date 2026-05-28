import type { TermSelection } from "../../selection/types";
import { add, displayGroup, multiply, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";

export type SelectionRewriteTarget = {
  expr: Expr;
};

type MultiSelectionRange = {
  parentId: string;
  parent: Expr;
  start: number;
  end: number;
  selectedExpr: Expr;
};

export function getSelectionRewriteTarget(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): SelectionRewriteTarget | null {
  if (!selection) return null;

  if (selection.kind === "single") {
    const expr = document.index.nodeById[selection.nodeId];
    return expr ? { expr: cloneExpr(expr) } : null;
  }

  const range = resolveMultiSelectionRange(document, selection);
  return range ? { expr: cloneExpr(range.selectedExpr) } : null;
}

export function replaceSelectionWithExpr(
  document: CompiledMathDocument,
  selection: TermSelection,
  replacement: Expr,
): Expr | null {
  if (selection.kind === "single") {
    const existing = document.index.nodeById[selection.nodeId];
    if (!existing) return null;
    return replaceCompiledNode(document, selection.nodeId, wrapReplacementForLocation(document, selection.nodeId, replacement));
  }

  const range = resolveMultiSelectionRange(document, selection);
  if (!range) return null;

  const nextParent = cloneExpr(range.parent);
  const replacementForSlice = wrapReplacementForContainerChild(range.parent, replacement);
  if (nextParent.kind === "add") {
    nextParent.terms = [
      ...nextParent.terms.slice(0, range.start),
      replacementForSlice,
      ...nextParent.terms.slice(range.end + 1),
    ];
  } else if (nextParent.kind === "multiply") {
    nextParent.factors = [
      ...nextParent.factors.slice(0, range.start),
      replacementForSlice,
      ...nextParent.factors.slice(range.end + 1),
    ];
  } else {
    return null;
  }

  return replaceCompiledNode(document, range.parentId, nextParent);
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

  const childList = parent.kind === "add" ? parent.terms : parent.factors;
  const selectedChildren = childList.slice(start, end + 1).map(cloneExpr);
  if (selectedChildren.length !== indexedChildren.length) return null;

  const selectedExpr = parent.kind === "add" ? add(selectedChildren) : multiply(selectedChildren);
  return { parentId: containerNodeId, parent, start, end, selectedExpr };
}

function wrapReplacementForLocation(document: CompiledMathDocument, nodeId: string, replacement: Expr): Expr {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId || !location.field) return cloneExpr(replacement);

  const parent = document.index.nodeById[location.parentId];
  if (!parent) return cloneExpr(replacement);

  if (parent.kind === "power" && location.field === "base") return wrapIfCompound(replacement);
  return wrapReplacementForContainerChild(parent, replacement);
}

function wrapReplacementForContainerChild(parent: Expr, replacement: Expr): Expr {
  if (parent.kind === "multiply" && (replacement.kind === "add" || replacement.kind === "negate")) {
    return displayGroup("paren", cloneExpr(replacement));
  }
  return cloneExpr(replacement);
}

function wrapIfCompound(replacement: Expr): Expr {
  switch (replacement.kind) {
    case "add":
    case "negate":
    case "multiply":
    case "divide":
    case "partial_derivative":
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return displayGroup("paren", cloneExpr(replacement));
    default:
      return cloneExpr(replacement);
  }
}
