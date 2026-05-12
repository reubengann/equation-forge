import { cloneExpr } from "../../ast/utils";
import type { AddExpr, Expr } from "../../ast/expr";
import type { MoveContext, SingleContainerRule } from "../types";

export function rearrangeTermsInSum(): SingleContainerRule {
  return {
    id: "rearrangeTermsInSum",
    moveType: "additive",
    selectionKind: "single",
    containerKind: "add",
    canMove: (context: MoveContext, container: Expr) => {
      if (context.selection.kind !== "single") return false;
      if (container.kind !== "add") return false;
      const sourceTermIndex = context.sourceContainerIndex;
      const destinationInsertionIndex = context.destinationInsertionIndex;
      return sourceTermIndex != null && destinationInsertionIndex != null && destinationInsertionIndex !== sourceTermIndex;
    },
    executeMove: (context: MoveContext, container: Expr, selectedNode: Expr) => {
      if (context.selection.kind !== "single") return null;
      if (container.kind !== "add") return null;

      const sourceNodeId = getNodeIdForExpr(context, container);
      if (!sourceNodeId) return null;

      const sourceTermIndex = context.sourceContainerIndex;
      const insertionIndex = context.destinationInsertionIndex;
      if (sourceTermIndex == null || insertionIndex == null) return null;
      if (insertionIndex === sourceTermIndex) return null;

      const nextContainer = cloneExpr(container) as AddExpr;
      const [movedTerm] = nextContainer.terms.splice(sourceTermIndex, 1);
      if (!movedTerm) return null;
      nextContainer.terms.splice(insertionIndex, 0, movedTerm);

      return {
        payload: cloneExpr(selectedNode),
        updatedNodeId: sourceNodeId,
        updatedNode: nextContainer,
      };
    },
  };
}

function getNodeIdForExpr(context: MoveContext, target: Expr): string | null {
  for (const [nodeId, expr] of Object.entries(context.document.index.nodeById)) {
    if (expr === target) return nodeId;
  }
  return null;
}
