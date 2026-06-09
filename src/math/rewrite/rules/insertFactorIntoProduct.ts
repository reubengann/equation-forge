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
      return (
        downContext.sideNode.kind === "multiply" ||
        downContext.sideId === downContext.destinationId ||
        isDestinationInNumerator(context, downContext.sideId, downContext.destinationId)
      );
    },
    apply: (context: MoveContext, downContext) => {
      if (!context.payload || isReciprocalPayload(context.payload)) return null;

      if (downContext.sideNode.kind !== "multiply") {
        const numeratorId = numeratorIdForDestination(context, downContext.sideId, downContext.destinationId);
        if (numeratorId) {
          if (downContext.sideNode.kind !== "divide") return null;
          return {
            updatedNodeId: downContext.sideId,
            updatedNode: {
              kind: "divide",
              numerator: multiplyWithPayload(
                cloneExpr(downContext.sideNode.numerator),
                context.payload,
                context.destinationSlot ?? "after",
              ),
              denominator: cloneExpr(downContext.sideNode.denominator),
            },
            insertionPreview: {
              containerId: numeratorId,
              containerKind: "multiply",
              destinationId: downContext.destinationId,
              destinationSlot: context.destinationSlot ?? "after",
              lineOrientation: "vertical",
            },
          };
        }

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

function isDestinationInNumerator(context: MoveContext, sideId: string, destinationId: string): boolean {
  return numeratorIdForDestination(context, sideId, destinationId) != null;
}

function numeratorIdForDestination(context: MoveContext, sideId: string, destinationId: string): string | null {
  const sideNode = context.document.index.nodeById[sideId];
  if (sideNode?.kind !== "divide") return null;
  const numeratorId = context.document.index.childrenById[sideId]?.[0];
  if (!numeratorId) return null;
  if (destinationId === numeratorId) return numeratorId;
  return context.document.index.ancestorsById[destinationId]?.includes(numeratorId) ? numeratorId : null;
}

function isReciprocalPayload(expr: Expr): boolean {
  return expr.kind === "divide" && expr.numerator.kind === "number" && String(expr.numerator.value) === "1";
}
