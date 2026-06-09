import { cloneExpr } from "../../ast/utils";
import type { DivideExpr, Expr } from "../../ast/expr";
import type { MoveContext, DownwardRewriteRule } from "../types";

export function insertFactorIntoDenominator(): DownwardRewriteRule {
  return {
    id: "insertFactorIntoDenominator",
    selectionKind: "*",
    moveType: "multiplicative",
    toKind: "divide",
    canApply: (context, downContext) => {
      if (!context.payload) return false;
      if (!isReciprocalPayload(context.payload)) return false;
      return (
        isDestinationInDenominator(context, downContext.sideId, downContext.destinationId) ||
        isDestinationInsideSide(context, downContext.sideId, downContext.destinationId)
      );
    },
    apply: (context: MoveContext, downContext) => {
      if (!context.payload || !isReciprocalPayload(context.payload)) return null;
      const insertsIntoDenominator = isDestinationInDenominator(context, downContext.sideId, downContext.destinationId);
      const insertsUnderSide = isDestinationInsideSide(context, downContext.sideId, downContext.destinationId);
      if (!insertsIntoDenominator && !insertsUnderSide) return null;

      return {
        updatedNodeId: downContext.sideId,
        updatedNode: divideByPayload(cloneExpr(downContext.sideNode), context.payload.denominator),
        insertionPreview: {
          containerId: downContext.sideId,
          containerKind: "divide",
          destinationId: downContext.destinationId,
          destinationSlot: "after",
          lineOrientation: "horizontal",
        },
      };
    },
  };
}

function isReciprocalPayload(expr: Expr): expr is DivideExpr {
  return expr.kind === "divide" && expr.numerator.kind === "number" && String(expr.numerator.value) === "1";
}

function isDestinationInDenominator(context: MoveContext, sideId: string, destinationId: string): boolean {
  const sideNode = context.document.index.nodeById[sideId];
  if (sideNode?.kind !== "divide") return false;
  const denominatorId = context.document.index.childrenById[sideId]?.[1];
  if (!denominatorId) return false;
  if (destinationId === denominatorId) return true;
  return context.document.index.ancestorsById[destinationId]?.includes(denominatorId) ?? false;
}

function isDestinationInsideSide(context: MoveContext, sideId: string, destinationId: string): boolean {
  if (sideId === destinationId) return true;
  return context.document.index.ancestorsById[destinationId]?.includes(sideId) ?? false;
}

function divideByPayload(numerator: Expr, denominator: Expr): Expr {
  if (numerator.kind === "divide") {
    return {
      kind: "divide",
      numerator: numerator.numerator,
      denominator: {
        kind: "multiply",
        factors: [numerator.denominator, cloneExpr(denominator)],
      },
    };
  }

  return {
    kind: "divide",
    numerator,
    denominator: cloneExpr(denominator),
  };
}
