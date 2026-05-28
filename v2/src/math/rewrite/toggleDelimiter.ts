import type { TermSelection } from "../../selection/types";
import { add, displayGroup, multiply, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";

type ToggleDelimiterTarget = {
  nodeId: string;
  replacement: Expr;
};

type MultiSelectionRange = {
  parentId: string;
  parent: Expr;
  start: number;
  end: number;
  selectedExpr: Expr;
};

export function canToggleDelimiterSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): boolean {
  return resolveToggleDelimiterTarget(document, selection) !== null;
}

export function toggleDelimiterSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): Expr | null {
  const target = resolveToggleDelimiterTarget(document, selection);
  if (!target) return null;
  return replaceCompiledNode(document, target.nodeId, target.replacement);
}

function resolveToggleDelimiterTarget(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): ToggleDelimiterTarget | null {
  if (!selection) return null;
  if (selection.kind === "single") return resolveSingleSelection(document, selection.nodeId);
  return resolveMultiSelection(document, selection);
}

function resolveSingleSelection(document: CompiledMathDocument, nodeId: string): ToggleDelimiterTarget | null {
  const selected = document.index.nodeById[nodeId];
  if (!selected) return null;

  if (selected.kind !== "display_group") {
    return {
      nodeId,
      replacement: displayGroup("paren", cloneExpr(selected)),
    };
  }

  const parentId = document.index.parentById[nodeId];
  const parent = parentId ? document.index.nodeById[parentId] : null;
  if (!canRemoveDisplayGroup(selected.expression, parent)) return null;

  return {
    nodeId,
    replacement: cloneExpr(selected.expression),
  };
}

function resolveMultiSelection(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "multi" }>,
): ToggleDelimiterTarget | null {
  const range = resolveMultiSelectionRange(document, selection);
  if (!range) return null;

  const nextParent = cloneExpr(range.parent);
  const groupedSelection = displayGroup("paren", range.selectedExpr);
  if (nextParent.kind === "add") {
    nextParent.terms = [
      ...nextParent.terms.slice(0, range.start),
      groupedSelection,
      ...nextParent.terms.slice(range.end + 1),
    ];
  } else if (nextParent.kind === "multiply") {
    nextParent.factors = [
      ...nextParent.factors.slice(0, range.start),
      groupedSelection,
      ...nextParent.factors.slice(range.end + 1),
    ];
  } else {
    return null;
  }

  return {
    nodeId: range.parentId,
    replacement: nextParent,
  };
}

function canRemoveDisplayGroup(expr: Expr, parent: Expr | null): boolean {
  if (!parent) return true;
  if (parent.kind === "add") return true;
  if (parent.kind === "multiply") return expr.kind !== "add" && expr.kind !== "negate";
  if (parent.kind === "divide") return true;
  return false;
}

function resolveMultiSelectionRange(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "multi" }>,
): MultiSelectionRange | null {
  const { containerNodeId } = selection;
  if (!containerNodeId || selection.nodeIds.length < 2) return null;

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
