import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractNumeratorFromFraction(): UpwardRewriteRule {
  return {
    id: "extractNumeratorFromFraction",
    selectionKind: "single",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "divide",
    canApply: (context, edge) => {
      if (context.selection.kind !== "single") return false;
      if (edge.parentNode.kind !== "divide") return false;
      if (context.document.index.locationById[edge.childId]?.field !== "numerator") return false;
      return context.payload ? true : edge.childId === context.selection.nodeId;
    },
    apply: (context: MoveContext, edge) => {
      if (edge.parentNode.kind !== "divide") return null;
      if (context.document.index.locationById[edge.childId]?.field !== "numerator") return null;

      if (context.payload) {
        const remainingFraction: Expr = {
          kind: "divide",
          numerator: cloneExpr(edge.childNode),
          denominator: cloneExpr(edge.parentNode.denominator),
        };

        if (edge.isFinalUpwardEdge) {
          if (context.destinationId !== edge.parentId) return null;
          const outputFactors =
            context.destinationSlot === "after"
              ? [remainingFraction, cloneExpr(context.payload)]
              : [cloneExpr(context.payload), remainingFraction];

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
              destinationSlot: context.destinationSlot ?? "after",
              lineOrientation: "vertical",
            },
          };
        }

        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: remainingFraction,
        };
      }

      if (context.selection.kind !== "single") return null;
      if (edge.childId !== context.selection.nodeId) return null;

      const reciprocalDenominator: Expr = {
        kind: "divide",
        numerator: { kind: "number", value: 1 },
        denominator: cloneExpr(edge.parentNode.denominator),
      };

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: cloneExpr(edge.childNode),
          updatedNodeId: edge.parentId,
          updatedNode: reciprocalDenominator,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "after"
          ? [reciprocalDenominator, cloneExpr(edge.childNode)]
          : [cloneExpr(edge.childNode), reciprocalDenominator];

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

