import type { TermSelection } from "../../selection/types";
import { add, displayGroup, multiply, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";
import { applySign, collapseProduct, flipSign, multiplySigns, splitSign, withSign, type Sign } from "./algebraUtils";

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
    const parentId = document.index.parentById[nodeId];
    const parent = parentId ? document.index.nodeById[parentId] : null;
    if (parent?.kind === "display_group") {
      return resolveSingleSelection(document, parentId!);
    }

    return {
      nodeId,
      replacement: displayGroup("paren", cloneExpr(selected)),
    };
  }

  const parentId = document.index.parentById[nodeId];
  const parent = parentId ? document.index.nodeById[parentId] : null;
  const location = document.index.locationById[nodeId];
  if (parent?.kind === "differential" && location?.field === "variable") return null;
  if (!canRemoveDisplayGroup(selected.expression, parent)) return null;

  if (
    parentId &&
    parent?.kind === "multiply" &&
    selected.expression.kind === "multiply" &&
    location?.index != null
  ) {
    return {
      nodeId: parentId,
      replacement: flattenGroupedProductIntoProduct(parent, selected.expression, location.index),
    };
  }

  const signedSelected = splitSign(selected);
  if (
    signedSelected.sign === 1 &&
    signedSelected.value.kind === "display_group" &&
    parentId &&
    parent?.kind === "multiply" &&
    location?.index != null
  ) {
    const signedExpression = splitSign(signedSelected.value.expression);
    if (signedExpression.sign === -1 && signedExpression.value.kind !== "add") {
      return {
        nodeId: parentId,
        replacement: replaceGroupedFactorWithSignedExpression(parent, signedExpression.value, -1, location.index),
      };
    }
  }

  if (signedSelected.sign === -1 && signedSelected.value.kind === "display_group" && signedSelected.value.expression.kind === "add") {
    if (parentId && parent?.kind === "add" && location?.index != null) {
      return {
        nodeId: parentId,
        replacement: {
          kind: "add",
          terms: [
            ...parent.terms.slice(0, location.index).map(cloneExpr),
            ...signedSelected.value.expression.terms.map(flipAdditiveTermSign),
            ...parent.terms.slice(location.index + 1).map(cloneExpr),
          ],
        },
      };
    }
    return {
      nodeId,
      replacement: add(signedSelected.value.expression.terms.map(flipAdditiveTermSign)),
    };
  }

  return {
    nodeId,
    replacement: signedSelected.value.kind === "display_group"
      ? applySign(signedSelected.sign, cloneExpr(signedSelected.value.expression))
      : applySign(signedSelected.sign, cloneExpr(selected)),
  };
}

function flipAdditiveTermSign(term: Expr): Expr {
  const signed = splitAdditiveTermSign(term);
  return signed.sign === -1 ? signed.value : flipSign(signed.value);
}

function splitAdditiveTermSign(expr: Expr): { sign: Sign; value: Expr } {
  const signed = splitSign(expr);
  if (signed.value.kind !== "multiply") return signed;

  let sign = signed.sign;
  const factors = signed.value.factors.map((factor) => {
    const signedFactor = splitSign(factor);
    sign = multiplySigns(sign, signedFactor.sign);
    return signedFactor.value;
  });

  return {
    sign,
    value: collapseProduct(factors),
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
  if (parent.kind === "equation" || parent.kind === "inequality") return true;
  if (parent.kind === "multiply") return expr.kind !== "add" && expr.kind !== "negate";
  if (parent.kind === "divide") return true;
  return false;
}

function flattenGroupedProductIntoProduct(
  parent: Extract<Expr, { kind: "multiply" }>,
  groupedProduct: Extract<Expr, { kind: "multiply" }>,
  groupedIndex: number,
): Expr {
  const signedParent = splitSign(parent);
  const parentProduct = signedParent.value as Extract<Expr, { kind: "multiply" }>;
  const signedGroupedProduct = splitSign(groupedProduct);
  const groupedProductValue = signedGroupedProduct.value as Extract<Expr, { kind: "multiply" }>;

  const factors = [
    ...parentProduct.factors.slice(0, groupedIndex),
    ...groupedProductValue.factors,
    ...parentProduct.factors.slice(groupedIndex + 1),
  ];
  let sign: Sign = multiplySigns(signedParent.sign, signedGroupedProduct.sign);
  const unsignedFactors = factors.map((factor) => {
    const signedFactor = splitSign(factor);
    sign = multiplySigns(sign, signedFactor.sign);
    return signedFactor.value;
  });

  return withSign(multiply(unsignedFactors), sign);
}

function replaceGroupedFactorWithSignedExpression(
  parent: Extract<Expr, { kind: "multiply" }>,
  expression: Expr,
  expressionSign: Sign,
  groupedIndex: number,
): Expr {
  const signedParent = splitSign(parent);
  const parentProduct = signedParent.value as Extract<Expr, { kind: "multiply" }>;
  let sign: Sign = multiplySigns(signedParent.sign, expressionSign);
  const factors = parentProduct.factors.map((factor, index) => {
    if (index === groupedIndex) return cloneExpr(expression);
    const signedFactor = splitSign(factor);
    sign = multiplySigns(sign, signedFactor.sign);
    return signedFactor.value;
  });
  return withSign(multiply(factors), sign);
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
