import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import { multiplySigns, splitSign, type Sign, withSign } from "../algebraUtils";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractFactorFromProduct(): UpwardRewriteRule {
  return {
    id: "extractFactorFromProduct",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "multiply",
    canApply: (context, edge) => {
      if (context.payload) {
        return edge.parentNode.kind === "multiply";
      }
      if (context.document.index.locationById[edge.parentId]?.field === "denominator") return false;
      if (context.selection.kind === "single") {
        return (
          edge.parentNode.kind === "multiply" ||
          (edge.parentNode.kind === "equation" &&
            edge.childId === context.selection.nodeId &&
            !isMultiplicativeIdentity(edge.childNode))
        );
      }
      return edge.parentNode.kind === "multiply" && context.selection.containerNodeId === edge.parentId;
    },
    apply: (context: MoveContext, edge) => {
      if (context.payload) {
        if (edge.parentNode.kind !== "multiply") return null;
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: productWithUpdatedChild(context, edge.parentId, edge.parentNode, edge.childId, edge.childNode),
        };
      }

      if (edge.parentNode.kind !== "multiply") {
        if (context.selection.kind !== "single") return null;
        const selectionNodeId = context.selection.nodeId;
        if (edge.parentNode.kind !== "equation") return null;
        if (edge.childId !== selectionNodeId) return null;
        if (isMultiplicativeIdentity(edge.childNode)) return null;
        return {
          payload: cloneExpr(edge.childNode),
          updatedNodeId: edge.childId,
          updatedNode: { kind: "number", value: 1 },
        };
      }

      const factorIds = context.document.index.childrenById[edge.parentId] ?? [];
      const sourceFactorIndexes = selectedFactorIndexes(context, factorIds);
      if (sourceFactorIndexes.length === 0) return null;

      const split = splitProductFactors(edge.parentNode, sourceFactorIndexes);

      return {
        payload: split.payload,
        updatedNodeId: edge.parentId,
        updatedNode: split.remaining,
      };
    },
  };
}

function selectedFactorIndexes(context: MoveContext, factorIds: string[]): number[] {
  if (context.selection.kind === "single") {
    const selectionNodeId = context.selection.nodeId;
    const selectionAncestors = new Set(context.document.index.ancestorsById[selectionNodeId] ?? []);
    const sourceFactorIndex = factorIds.findIndex(
      (factorId) => factorId === selectionNodeId || selectionAncestors.has(factorId),
    );
    return sourceFactorIndex < 0 ? [] : [sourceFactorIndex];
  }

  const selectedIds = new Set(context.selection.nodeIds);
  const indexes = factorIds.reduce<number[]>((acc, factorId, index) => {
    const factorAncestors = context.document.index.ancestorsById[factorId] ?? [];
    const hasSelectedDescendant = context.selection.kind === "multi" && context.selection.nodeIds.some((nodeId) => {
      const selectedAncestors = context.document.index.ancestorsById[nodeId] ?? [];
      return selectedIds.has(factorId) || selectedAncestors.includes(factorId) || factorAncestors.includes(nodeId);
    });
    if (selectedIds.has(factorId) || hasSelectedDescendant) acc.push(index);
    return acc;
  }, []);
  return indexes.sort((a, b) => a - b);
}

function splitProductFactors(product: Extract<Expr, { kind: "multiply" }>, sourceFactorIndexes: number[]): { payload: Expr; remaining: Expr } {
  const signedProduct = splitSign(product);
  const productValue = signedProduct.value as Extract<Expr, { kind: "multiply" }>;
  const factors = productValue.factors;
  const selectedIndexSet = new Set(sourceFactorIndexes);
  const payloadFactors: Expr[] = [];
  const remainingFactors: Expr[] = [];
  let remainingSign: Sign = signedProduct.sign;

  factors.forEach((factor, index) => {
    if (!selectedIndexSet.has(index)) {
      remainingFactors.push(cloneExpr(factor));
      return;
    }

    const signedFactor = splitSign(factor);
    payloadFactors.push(signedFactor.value);
    remainingSign = multiplySigns(remainingSign, signedFactor.sign);
  });

  const remaining = collapseMultiplicativeFactors(remainingFactors);
  return {
    payload: collapseMultiplicativeFactors(payloadFactors),
    remaining: withSign(remaining, remainingSign),
  };
}

function collapseMultiplicativeFactors(factors: Expr[]): Expr {
  const keptFactors = factors.filter((factor) => !isMultiplicativeIdentity(factor));
  if (keptFactors.length === 0) return { kind: "number", value: 1 };
  if (keptFactors.length === 1) return keptFactors[0]!;
  return { kind: "multiply", factors: keptFactors };
}

function isMultiplicativeIdentity(expr: Expr): boolean {
  return expr.kind === "number" && expr.value === 1;
}

function productWithUpdatedChild(
  context: MoveContext,
  parentId: string,
  parentNode: Extract<Expr, { kind: "multiply" }>,
  childId: string,
  childNode: Expr,
): Expr {
  const childIds = context.document.index.childrenById[parentId] ?? [];
  const childIndex = childIds.indexOf(childId);
  if (childIndex < 0) return cloneExpr(parentNode);
  return collapseMultiplicativeFactors(
    parentNode.factors
      .map((factor, index) => (index === childIndex ? cloneExpr(childNode) : cloneExpr(factor)))
      .filter((factor) => !isMultiplicativeIdentity(factor)),
  );
}
