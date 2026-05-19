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
      return downContext.sideId === downContext.destinationId;
    },
    apply: (context: MoveContext, downContext) => {
      if (!context.payload || !isReciprocalPayload(context.payload)) return null;
      if (downContext.sideId !== downContext.destinationId) return null;

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
