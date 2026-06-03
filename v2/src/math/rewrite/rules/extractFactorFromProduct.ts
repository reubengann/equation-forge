import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
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
        return edge.parentNode.kind === "multiply" && isMultiplicativeIdentity(edge.childNode);
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
        if (edge.parentNode.kind !== "multiply" || !isMultiplicativeIdentity(edge.childNode)) return null;
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: productWithoutChild(context, edge.parentId, edge.parentNode, edge.childId),
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

      const split = splitProductFactors(edge.parentNode.factors, sourceFactorIndexes);

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
    if (selectedIds.has(factorId)) acc.push(index);
    return acc;
  }, []);
  return indexes.sort((a, b) => a - b);
}

function splitProductFactors(factors: Expr[], sourceFactorIndexes: number[]): { payload: Expr; remaining: Expr } {
  const selectedIndexSet = new Set(sourceFactorIndexes);
  const payloadFactors: Expr[] = [];
  const remainingFactors: Expr[] = [];
  let remainingSign: 1 | -1 = 1;

  factors.forEach((factor, index) => {
    if (!selectedIndexSet.has(index)) {
      remainingFactors.push(cloneExpr(factor));
      return;
    }

    const signedFactor = splitSignedFactor(factor);
    payloadFactors.push(signedFactor.payload);
    remainingSign *= signedFactor.remainingSign;
  });

  const remaining = collapseMultiplicativeFactors(remainingFactors);
  return {
    payload: collapseMultiplicativeFactors(payloadFactors),
    remaining: remainingSign === -1 ? { kind: "negate", value: remaining } : remaining,
  };
}

function splitSignedFactor(factor: Expr): { payload: Expr; remainingSign: 1 | -1 } {
  if (factor.kind !== "negate") return { payload: cloneExpr(factor), remainingSign: 1 };
  return {
    payload: cloneExpr(factor.value),
    remainingSign: -1,
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

function productWithoutChild(context: MoveContext, parentId: string, parentNode: Extract<Expr, { kind: "multiply" }>, childId: string): Expr {
  const childIds = context.document.index.childrenById[parentId] ?? [];
  const childIndex = childIds.indexOf(childId);
  if (childIndex < 0) return cloneExpr(parentNode);
  return collapseMultiplicativeFactors(parentNode.factors.filter((_, index) => index !== childIndex).map(cloneExpr));
}
