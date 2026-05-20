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
      if (context.payload) return false;
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
      if (context.payload) return null;

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

      const factors = edge.parentNode.factors.map(cloneExpr);
      const selectedIndexSet = new Set(sourceFactorIndexes);
      const payloadFactors = factors.filter((_, index) => selectedIndexSet.has(index));
      const remainingFactors = factors.filter((_, index) => !selectedIndexSet.has(index));
      const payload = collapseMultiplicativeFactors(payloadFactors);

      return {
        payload,
        updatedNodeId: edge.parentId,
        updatedNode: collapseMultiplicativeFactors(remainingFactors),
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

function collapseMultiplicativeFactors(factors: Expr[]): Expr {
  if (factors.length === 0) return { kind: "number", value: 1 };
  if (factors.length === 1) return factors[0];
  return { kind: "multiply", factors };
}

function isMultiplicativeIdentity(expr: Expr): boolean {
  return expr.kind === "number" && expr.value === 1;
}
