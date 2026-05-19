import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractTermFromSum(): UpwardRewriteRule {
  return {
    id: "extractTermFromSum",
    selectionKind: "single",
    moveType: "additive",
    fromKind: "*",
    toKind: "add",
    canApply: (context, edge) => {
      if (context.selection.kind !== "single") return false;
      if (context.payload) return false;
      return edge.parentNode.kind === "add" || edge.childId === context.selection.nodeId;
    },
    apply: (context: MoveContext, edge) => {
      if (context.selection.kind !== "single") return null;
      if (context.payload) return null;

      if (edge.parentNode.kind !== "add") {
        if (edge.childId !== context.selection.nodeId) return null;
        return {
          payload: cloneExpr(edge.childNode),
          updatedNodeId: edge.childId,
          updatedNode: { kind: "number", value: 0 },
        };
      }

      const termIds = context.document.index.childrenById[edge.parentId] ?? [];
      const selectionAncestors = new Set(context.document.index.ancestorsById[context.selection.nodeId] ?? []);
      const sourceTermIndex = termIds.findIndex(
        (termId) => termId === context.selection.nodeId || selectionAncestors.has(termId),
      );
      if (sourceTermIndex < 0) return null;

      const terms = edge.parentNode.terms.map(cloneExpr);
      const [payload] = terms.splice(sourceTermIndex, 1);
      if (!payload) return null;

      return {
        payload,
        updatedNodeId: edge.parentId,
        updatedNode: collapseAdditiveTerms(terms),
      };
    },
  };
}

function collapseAdditiveTerms(terms: Expr[]): Expr {
  if (terms.length === 0) return { kind: "number", value: 0 };
  return { kind: "add", terms };
}
