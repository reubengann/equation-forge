import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractThroughDisplayGroup(): UpwardRewriteRule {
  return {
    id: "extractThroughDisplayGroup",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "display_group",
    canApply: (context, edge) => {
      if (!context.payload) return false;
      if (edge.parentNode.kind !== "display_group") return false;
      return edge.childId === context.document.index.childrenById[edge.parentId]?.[0];
    },
    apply: (context: MoveContext, edge) => {
      if (!context.payload) return null;
      if (edge.parentNode.kind !== "display_group") return null;

      const groupedRemainder: Expr = {
        kind: "display_group",
        delimiter: edge.parentNode.delimiter,
        expression: cloneExpr(edge.childNode),
      };

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: groupedRemainder,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "after"
          ? [groupedRemainder, cloneExpr(context.payload)]
          : [cloneExpr(context.payload), groupedRemainder];

      return {
        updatedNodeId: edge.parentId,
        updatedNode: {
          kind: "multiply",
          factors: outputFactors,
        },
        insertionPreview: {
          containerId: edge.parentId,
          containerKind: "multiply",
          destinationId: edge.parentId,
          destinationSlot: context.destinationSlot ?? "before",
          lineOrientation: "vertical",
        },
      };
    },
  };
}
