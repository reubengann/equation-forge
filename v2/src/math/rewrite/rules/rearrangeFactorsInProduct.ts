import { cloneExpr } from "../../ast/utils";
import type { Expr, MultiplyExpr } from "../../ast/expr";
import type { MoveContext, SingleContainerRule } from "../types";

export function rearrangeFactorsInProduct(): SingleContainerRule {
  return {
    id: "rearrangeFactorsInProduct",
    moveType: "multiplicative",
    selectionKind: "single",
    containerKind: "multiply",
    canMove: (context: MoveContext, container: Expr) => {
      if (context.selection.kind !== "single") return false;
      if (container.kind !== "multiply") return false;
      const sourceFactorIndex = context.sourceContainerIndex;
      const destinationInsertionIndex = context.destinationInsertionIndex;
      return (
        sourceFactorIndex != null &&
        destinationInsertionIndex != null &&
        destinationInsertionIndex !== sourceFactorIndex
      );
    },
    executeMove: (context: MoveContext, container: Expr, selectedNode: Expr) => {
      if (context.selection.kind !== "single") return null;
      if (container.kind !== "multiply") return null;

      const sourceNodeId = getNodeIdForExpr(context, container);
      if (!sourceNodeId) return null;

      const sourceFactorIndex = context.sourceContainerIndex;
      const insertionIndex = context.destinationInsertionIndex;
      if (sourceFactorIndex == null || insertionIndex == null) return null;
      if (insertionIndex === sourceFactorIndex) return null;

      const nextContainer = cloneExpr(container) as MultiplyExpr;
      const [movedFactor] = nextContainer.factors.splice(sourceFactorIndex, 1);
      if (!movedFactor) return null;
      nextContainer.factors.splice(insertionIndex, 0, movedFactor);

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
