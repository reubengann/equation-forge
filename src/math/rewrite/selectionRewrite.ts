import type { TermSelection } from "../../selection/types";
import { add, displayGroup, divide, multiply, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";
import { flipSign, isNegativeExpr, splitSign } from "./algebraUtils";

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
    const spliceResult = replaceSingleContainerChildWithExpr(document, selection.nodeId, replacement);
    if (spliceResult) return spliceResult;
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

function replaceSingleContainerChildWithExpr(
  document: CompiledMathDocument,
  nodeId: string,
  replacement: Expr,
): Expr | null {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId) return null;

  const parent = document.index.nodeById[location.parentId];
  if (!parent) return null;

  if (parent.kind === "multiply" && replacement.kind === "multiply" && location.index != null) {
    const mergedProduct = mergeReciprocalReplacementIntoProduct(parent, location.index, replacement);
    if (mergedProduct) return replaceCompiledNode(document, location.parentId, mergedProduct);

    if (startsWithNegatedFactor(replacement)) {
      return null;
    }

    const nextParent = cloneExpr(parent);
    if (nextParent.kind !== "multiply") return null;
    nextParent.factors = [
      ...parent.factors.slice(0, location.index).map(cloneExpr),
      ...replacement.factors.map(cloneExpr),
      ...parent.factors.slice(location.index + 1).map(cloneExpr),
    ];
    return replaceCompiledNode(document, location.parentId, nextParent);
  }

  const nextParent = cloneExpr(parent);
  if (nextParent.kind === "add" && replacement.kind === "add" && location.index != null) {
    nextParent.terms = [
      ...nextParent.terms.slice(0, location.index),
      ...replacement.terms.map(cloneExpr),
      ...nextParent.terms.slice(location.index + 1),
    ];
    return replaceCompiledNode(document, location.parentId, nextParent);
  }

  const parentLocation = document.index.locationById[location.parentId];
  const grandparent = parentLocation?.parentId ? document.index.nodeById[parentLocation.parentId] : null;
  if (
    parent.kind === "negate" &&
    parentLocation?.parentId &&
    parentLocation.index != null &&
    grandparent?.kind === "add" &&
    replacement.kind === "add"
  ) {
    const nextGrandparent = cloneExpr(grandparent);
    if (nextGrandparent.kind !== "add") return null;
    nextGrandparent.terms = [
      ...nextGrandparent.terms.slice(0, parentLocation.index),
      ...replacement.terms.map(flipAdditiveSign),
      ...nextGrandparent.terms.slice(parentLocation.index + 1),
    ];
    return replaceCompiledNode(document, parentLocation.parentId, nextGrandparent);
  }

  return null;
}

function flipAdditiveSign(term: Expr): Expr {
  return flipSign(term);
}

function startsWithNegatedFactor(expr: Extract<Expr, { kind: "multiply" }>): boolean {
  const firstFactor = expr.factors[0];
  return firstFactor ? isNegativeExpr(firstFactor) : false;
}

function mergeReciprocalReplacementIntoProduct(
  parent: Extract<Expr, { kind: "multiply" }>,
  replacementIndex: number,
  replacement: Extract<Expr, { kind: "multiply" }>,
): Expr | null {
  const signedReplacement = splitSign(replacement);
  if (signedReplacement.value.kind !== "multiply") return null;

  const [firstReplacementFactor, ...remainingReplacementFactors] = signedReplacement.value.factors;
  if (!firstReplacementFactor) return null;

  const signedFirstReplacementFactor = splitSign(firstReplacementFactor);
  const mergedSign = signedReplacement.sign === signedFirstReplacementFactor.sign ? 1 : -1;
  if (signedFirstReplacementFactor.value.kind !== "divide") return null;
  if (
    signedFirstReplacementFactor.value.numerator.kind !== "number" ||
    Number(signedFirstReplacementFactor.value.numerator.value) !== 1
  ) {
    return null;
  }

  const precedingFactors = parent.factors.slice(0, replacementIndex).map(cloneExpr);
  if (precedingFactors.length === 0) return null;
  const mergedFraction = divide(
    collapseProduct(precedingFactors),
    signedFirstReplacementFactor.value.denominator,
  );

  return multiply([
    mergedSign === -1 ? flipSign(mergedFraction) : mergedFraction,
    ...remainingReplacementFactors.map(cloneExpr),
    ...parent.factors.slice(replacementIndex + 1).map(cloneExpr),
  ]);
}

function collapseProduct(factors: Expr[]): Expr {
  if (factors.length === 0) return { kind: "number", value: 1 };
  if (factors.length === 1) return cloneExpr(factors[0]);
  return multiply(factors.map(cloneExpr));
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
      const normalized = normalizeSelectedContainerChild(document, nodeId, containerNodeId);
      return normalized?.index == null ? null : { index: normalized.index, nodeId: normalized.nodeId };
    })
    .filter((child): child is { index: number; nodeId: string } => child !== null)
    .sort((a, b) => a.index - b.index);

  if (indexedChildren.length !== selection.nodeIds.length) return null;
  if (new Set(indexedChildren.map((child) => child.nodeId)).size !== indexedChildren.length) return null;

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

function normalizeSelectedContainerChild(
  document: CompiledMathDocument,
  nodeId: string,
  containerNodeId: string,
): { nodeId: string; index: number } | null {
  const location = document.index.locationById[nodeId];
  if (location?.parentId === containerNodeId && location.index != null) return { nodeId, index: location.index };

  const parentId = location?.parentId;
  if (!parentId) return null;
  const parent = document.index.nodeById[parentId];
  const parentLocation = document.index.locationById[parentId];
  if (parent?.kind === "negate" && parentLocation?.parentId === containerNodeId && parentLocation.index != null) {
    return { nodeId: parentId, index: parentLocation.index };
  }

  return null;
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
  if (
    parent.kind === "multiply" &&
    (replacement.kind === "add" ||
      isNegativeExpr(replacement) ||
      (replacement.kind === "multiply" && startsWithNegatedFactor(replacement)))
  ) {
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
