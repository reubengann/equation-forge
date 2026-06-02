import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractNumeratorTermFromFraction(): UpwardRewriteRule {
  return {
    id: "extractNumeratorTermFromFraction",
    selectionKind: "*",
    moveType: "additive",
    fromKind: "*",
    toKind: "divide",
    canApply: (context, edge) => {
      if (!context.payload) return false;
      if (edge.parentNode.kind !== "divide") return false;
      return context.document.index.locationById[edge.childId]?.field === "numerator";
    },
    apply: (context: MoveContext, edge) => {
      if (!context.payload) return null;
      if (edge.parentNode.kind !== "divide") return null;
      if (context.document.index.locationById[edge.childId]?.field !== "numerator") return null;

      const remainingFraction: Expr = {
        kind: "divide",
        numerator: cloneExpr(edge.childNode),
        denominator: cloneExpr(edge.parentNode.denominator),
      };
      const payloadFraction: Expr = {
        kind: "divide",
        numerator: cloneExpr(context.payload),
        denominator: cloneExpr(edge.parentNode.denominator),
      };

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: payloadFraction,
          updatedNodeId: edge.parentId,
          updatedNode: remainingFraction,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputTerms =
        context.destinationSlot === "before"
          ? [payloadFraction, remainingFraction]
          : [remainingFraction, payloadFraction];
      const updatedNode: Expr = {
        kind: "add",
        terms: outputTerms,
      };

      return {
        updatedNodeId: edge.parentId,
        updatedNode: shouldWrapAdditiveReplacement(context, edge.parentId)
          ? { kind: "display_group", delimiter: "paren", expression: updatedNode }
          : updatedNode,
        insertionPreview: {
          containerId: edge.parentId,
          containerKind: "add",
          destinationId: edge.parentId,
          destinationSlot: context.destinationSlot ?? "after",
          lineOrientation: "vertical",
        },
      };
    },
  };
}

function shouldWrapAdditiveReplacement(context: MoveContext, nodeId: string): boolean {
  const parentId = context.document.index.parentById[nodeId];
  if (!parentId) return false;
  const parent = context.document.index.nodeById[parentId];
  return parent?.kind === "multiply";
}
