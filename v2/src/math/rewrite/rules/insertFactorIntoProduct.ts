import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, DownwardRewriteRule } from "../types";

export function insertFactorIntoProduct(): DownwardRewriteRule {
  return {
    id: "insertFactorIntoProduct",
    selectionKind: "*",
    moveType: "multiplicative",
    toKind: "multiply",
    canApply: (context, downContext) => {
      if (!context.payload) return false;
      if (isReciprocalPayload(context.payload)) return false;
      return downContext.sideNode.kind === "multiply" || downContext.sideId === downContext.destinationId;
    },
    apply: (context: MoveContext, downContext) => {
      if (!context.payload || isReciprocalPayload(context.payload)) return null;

      if (downContext.sideNode.kind !== "multiply") {
        if (downContext.sideId !== downContext.destinationId) return null;
        const destination = cloneExpr(downContext.sideNode);
        return {
          updatedNodeId: downContext.sideId,
          updatedNode: multiplyWithPayload(destination, context.payload, context.destinationSlot ?? "after"),
          insertionPreview: {
            containerId: downContext.sideId,
            containerKind: "multiply",
            destinationId: downContext.destinationId,
            destinationSlot: context.destinationSlot ?? "after",
            lineOrientation: "vertical",
          },
        };
      }

      const factorIds = context.document.index.childrenById[downContext.sideId] ?? [];
      const destinationAncestors = new Set(context.document.index.ancestorsById[downContext.destinationId] ?? []);
      const destinationFactorIndex = factorIds.findIndex(
        (factorId) => factorId === downContext.destinationId || destinationAncestors.has(factorId),
      );
      if (destinationFactorIndex < 0) return null;

      const factors = downContext.sideNode.factors.map(cloneExpr);
      const insertionIndex =
        context.destinationSlot === "after" ? destinationFactorIndex + 1 : destinationFactorIndex;
      factors.splice(insertionIndex, 0, cloneExpr(context.payload));

      return {
        updatedNodeId: downContext.sideId,
        updatedNode: { kind: "multiply", factors },
        insertionPreview: {
          containerId: downContext.sideId,
          containerKind: "multiply",
          destinationId: downContext.destinationId,
          destinationSlot: context.destinationSlot ?? "after",
          lineOrientation: "vertical",
        },
      };
    },
  };
}

function multiplyWithPayload(destination: Expr, payload: Expr, destinationSlot: "before" | "after"): Expr {
  if (isMultiplicativeIdentity(destination)) return cloneExpr(payload);
  if (isMultiplicativeIdentity(payload)) return destination;
  return {
    kind: "multiply",
    factors:
      destinationSlot === "after"
        ? [destination, cloneExpr(payload)]
        : [cloneExpr(payload), destination],
  };
}

function isMultiplicativeIdentity(expr: Expr): boolean {
  return expr.kind === "number" && String(expr.value) === "1";
}

function isReciprocalPayload(expr: Expr): boolean {
  return expr.kind === "divide" && expr.numerator.kind === "number" && String(expr.numerator.value) === "1";
}
