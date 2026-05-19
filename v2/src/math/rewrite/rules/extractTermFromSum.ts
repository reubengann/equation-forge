import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractTermFromSum(): UpwardRewriteRule {
  return {
    id: "extractTermFromSum",
    selectionKind: "*",
    moveType: "additive",
    fromKind: "*",
    toKind: "add",
    canApply: (context, edge) => {
      if (context.payload) return false;
      if (context.selection.kind === "single") {
        return (
          edge.parentNode.kind === "add" ||
          (edge.parentNode.kind === "equation" && edge.childId === context.selection.nodeId)
        );
      }
      return edge.parentNode.kind === "add" && context.selection.containerNodeId === edge.parentId;
    },
    apply: (context: MoveContext, edge) => {
      if (context.payload) return null;

      if (edge.parentNode.kind !== "add") {
        if (context.selection.kind !== "single") return null;
        const selectionNodeId = context.selection.nodeId;
        if (edge.parentNode.kind !== "equation") return null;
        if (edge.childId !== selectionNodeId) return null;
        return {
          payload: cloneExpr(edge.childNode),
          updatedNodeId: edge.childId,
          updatedNode: { kind: "number", value: 0 },
        };
      }

      const termIds = context.document.index.childrenById[edge.parentId] ?? [];
      const sourceTermIndexes = selectedTermIndexes(context, termIds);
      if (sourceTermIndexes.length === 0) return null;

      const terms = edge.parentNode.terms.map(cloneExpr);
      const selectedIndexSet = new Set(sourceTermIndexes);
      const payloadTerms = terms.filter((_, index) => selectedIndexSet.has(index));
      const remainingTerms = terms.filter((_, index) => !selectedIndexSet.has(index));
      const payload = collapseAdditiveTerms(payloadTerms);

      return {
        payload,
        updatedNodeId: edge.parentId,
        updatedNode: collapseAdditiveTerms(remainingTerms),
      };
    },
  };
}

function selectedTermIndexes(context: MoveContext, termIds: string[]): number[] {
  if (context.selection.kind === "single") {
    const selectionNodeId = context.selection.nodeId;
    const selectionAncestors = new Set(context.document.index.ancestorsById[selectionNodeId] ?? []);
    const sourceTermIndex = termIds.findIndex(
      (termId) => termId === selectionNodeId || selectionAncestors.has(termId),
    );
    return sourceTermIndex < 0 ? [] : [sourceTermIndex];
  }

  const selectedIds = new Set(context.selection.nodeIds);
  const indexes = termIds.reduce<number[]>((acc, termId, index) => {
    if (selectedIds.has(termId)) acc.push(index);
    return acc;
  }, []);
  return indexes.sort((a, b) => a - b);
}

function collapseAdditiveTerms(terms: Expr[]): Expr {
  if (terms.length === 0) return { kind: "number", value: 0 };
  if (terms.length === 1) return terms[0];
  return { kind: "add", terms };
}
