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
      if (container.kind !== "multiply") return false;
      const sourceFactorIndex = context.sourceContainerIndex;
      const sourceFactorEndIndex = context.sourceContainerEndIndex ?? sourceFactorIndex;
      const destinationInsertionIndex = context.destinationInsertionIndex;
      return (
        sourceFactorIndex != null &&
        sourceFactorEndIndex != null &&
        destinationInsertionIndex != null &&
        !selectionContainsDestination(context)
      );
    },
    executeMove: (context: MoveContext, container: Expr, selectedNode: Expr) => {
      if (container.kind !== "multiply") return null;

      const sourceNodeId = getNodeIdForExpr(context, container);
      if (!sourceNodeId) return null;

      const sourceFactorIndex = context.sourceContainerIndex;
      const sourceFactorEndIndex = context.sourceContainerEndIndex ?? sourceFactorIndex;
      const insertionIndex = context.destinationInsertionIndex;
      if (sourceFactorIndex == null || sourceFactorEndIndex == null || insertionIndex == null) return null;
      if (selectionContainsDestination(context)) return null;

      const nextContainer = cloneExpr(container) as MultiplyExpr;
      const movedFactors = nextContainer.factors.splice(sourceFactorIndex, sourceFactorEndIndex - sourceFactorIndex + 1);
      if (movedFactors.length === 0) return null;
      const adjustedInsertionIndex =
        context.selection.kind === "multi" && insertionIndex > sourceFactorIndex
          ? insertionIndex - movedFactors.length
          : insertionIndex;
      nextContainer.factors.splice(adjustedInsertionIndex, 0, ...movedFactors);

      return {
        payload: cloneExpr(selectedNode),
        updatedNodeId: sourceNodeId,
        updatedNode: nextContainer,
      };
    },
  };
}

export function rearrangeMultipleFactorsInProduct(): SingleContainerRule {
  return {
    ...rearrangeFactorsInProduct(),
    id: "rearrangeMultipleFactorsInProduct",
    selectionKind: "multi",
  };
}

function selectionContainsDestination(context: MoveContext): boolean {
  return context.selection.kind === "single"
    ? context.destinationId === context.selection.nodeId
    : context.selection.nodeIds.includes(context.destinationId);
}

function getNodeIdForExpr(context: MoveContext, target: Expr): string | null {
  for (const [nodeId, expr] of Object.entries(context.document.index.nodeById)) {
    if (expr === target) return nodeId;
  }
  return null;
}
