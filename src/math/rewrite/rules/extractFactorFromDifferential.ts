import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import { applySign, splitSign } from "../algebraUtils";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractFactorFromDifferential(): UpwardRewriteRule {
  return {
    id: "extractFactorFromDifferential",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "differential",
    canApply: (context, edge) => {
      if (!context.payload) return false;
      if (edge.parentNode.kind !== "differential") return false;
      return isDifferentialVariableEdge(context, edge.parentId, edge.childId);
    },
    apply: (context: MoveContext, edge) => {
      if (!context.payload) return null;
      if (edge.parentNode.kind !== "differential") return null;
      if (!isDifferentialVariableEdge(context, edge.parentId, edge.childId)) return null;

      const signedDifferential = splitSign(edge.parentNode);
      const remainingDifferential: Extract<Expr, { kind: "differential" }> = {
        ...(signedDifferential.value as Extract<Expr, { kind: "differential" }>),
        variable: cloneExpr(edge.childNode),
      };

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: remainingDifferential,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "after"
          ? [remainingDifferential, applySign(signedDifferential.sign, cloneExpr(context.payload))]
          : [applySign(signedDifferential.sign, cloneExpr(context.payload)), remainingDifferential];

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

function isDifferentialVariableEdge(context: MoveContext, parentId: string, childId: string): boolean {
  const location = context.document.index.locationById[childId];
  return location?.parentId === parentId && location.field === "variable";
}
