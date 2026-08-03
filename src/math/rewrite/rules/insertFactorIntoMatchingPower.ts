import type { DivideExpr, Expr, MultiplyExpr } from "../../ast/expr";
import { cloneExpr } from "../../ast/utils";
import { applySign, splitSign } from "../algebraUtils";
import type { DownwardRewriteContext, DownwardRewriteRule, MoveContext } from "../types";
import {
  areMatchingPowerContainers,
  enclosingPowerContainer,
  sourcePowerContainer,
} from "./samePowerContainers";

export function insertFactorIntoMatchingPower(): DownwardRewriteRule {
  return {
    id: "insertFactorIntoMatchingPower",
    selectionKind: "*",
    moveType: "multiplicative",
    toKind: "*",
    canApply: (context, downContext) => matchingContainers(context, downContext) != null,
    apply: (context: MoveContext, downContext) => {
      if (!context.payload) return null;
      const match = matchingContainers(context, downContext);
      if (!match) return null;

      const reciprocal = reciprocalPayload(context.payload);
      if (reciprocal) {
        const updatedDestination = divideByReciprocal(cloneExpr(downContext.destinationNode), reciprocal);
        const updatedContainer = replaceWithinContainer(
          context,
          downContext.sideId,
          downContext.destinationId,
          updatedDestination,
        );
        if (!updatedContainer) return null;
        return {
          updatedNodeId: downContext.sideId,
          updatedNode: updatedContainer,
          insertionPreview: {
            containerId: downContext.destinationId,
            containerKind: "divide",
            destinationId: downContext.destinationId,
            destinationSlot: "after",
            lineOrientation: "horizontal",
          },
        };
      }

      const product = destinationProduct(context, downContext.destinationId, match.innerId);
      if (product) {
        const updatedProduct = insertIntoProduct(
          context,
          product.id,
          product.node,
          downContext.destinationId,
          context.payload,
        );
        const updatedContainer = replaceWithinContainer(
          context,
          downContext.sideId,
          product.id,
          updatedProduct,
        );
        if (!updatedContainer) return null;
        return {
          updatedNodeId: downContext.sideId,
          updatedNode: updatedContainer,
          insertionPreview: {
            containerId: product.id,
            containerKind: "multiply",
            destinationId: downContext.destinationId,
            destinationSlot: context.destinationSlot ?? "after",
            lineOrientation: "vertical",
          },
        };
      }

      const updatedDestination = multiplyAtDestination(
        downContext.destinationNode,
        context.payload,
        context.destinationSlot ?? "after",
      );
      const updatedContainer = replaceWithinContainer(
        context,
        downContext.sideId,
        downContext.destinationId,
        updatedDestination,
      );
      if (!updatedContainer) return null;
      return {
        updatedNodeId: downContext.sideId,
        updatedNode: updatedContainer,
        insertionPreview: {
          containerId: downContext.destinationId,
          containerKind: "multiply",
          destinationId: downContext.destinationId,
          destinationSlot: context.destinationSlot ?? "after",
          lineOrientation: "vertical",
        },
      };
    },
  };
}

function matchingContainers(context: MoveContext, downContext: DownwardRewriteContext) {
  if (!context.payload) return null;
  const source = sourcePowerContainer(context.document, context.selection);
  const destination = enclosingPowerContainer(context.document, downContext.destinationId);
  if (!source || !destination || destination.id !== downContext.sideId) return null;
  if (source.id === destination.id || !areMatchingPowerContainers(source.node, destination.node)) return null;
  return destination;
}

function destinationProduct(
  context: MoveContext,
  destinationId: string,
  innerId: string,
): { id: string; node: MultiplyExpr } | null {
  let currentId: string | null = destinationId;
  while (currentId) {
    const node = context.document.index.nodeById[currentId];
    if (node?.kind === "multiply") return { id: currentId, node };
    if (currentId === innerId) return null;
    currentId = context.document.index.parentById[currentId];
  }
  return null;
}

function insertIntoProduct(
  context: MoveContext,
  productId: string,
  product: MultiplyExpr,
  destinationId: string,
  payload: Expr,
): MultiplyExpr {
  const factors = product.factors.map(cloneExpr);
  if (destinationId === productId) {
    factors.splice(context.destinationSlot === "before" ? 0 : factors.length, 0, cloneExpr(payload));
    return { kind: "multiply", factors };
  }

  const factorIds = context.document.index.childrenById[productId] ?? [];
  const destinationAncestors = new Set(context.document.index.ancestorsById[destinationId] ?? []);
  const destinationIndex = factorIds.findIndex(
    (factorId) => factorId === destinationId || destinationAncestors.has(factorId),
  );
  const insertionIndex =
    destinationIndex < 0
      ? factors.length
      : destinationIndex + (context.destinationSlot === "after" ? 1 : 0);
  factors.splice(insertionIndex, 0, cloneExpr(payload));
  return { kind: "multiply", factors };
}

function multiplyAtDestination(destination: Expr, payload: Expr, slot: "before" | "after"): MultiplyExpr {
  return {
    kind: "multiply",
    factors:
      slot === "after"
        ? [cloneExpr(destination), cloneExpr(payload)]
        : [cloneExpr(payload), cloneExpr(destination)],
  };
}

function replaceWithinContainer(
  context: MoveContext,
  containerId: string,
  targetId: string,
  replacement: Expr,
): Expr | null {
  let nextChild = cloneExpr(replacement);
  let currentId = targetId;

  while (currentId !== containerId) {
    const location = context.document.index.locationById[currentId];
    if (!location.parentId || !location.field) return null;
    const parent = context.document.index.nodeById[location.parentId];
    if (!parent) return null;

    const nextParent = cloneExpr(parent);
    const nextParentRecord = nextParent as Record<string, unknown>;
    const currentField = nextParentRecord[location.field];
    if (location.index != null) {
      if (!Array.isArray(currentField)) return null;
      const nextChildren = [...currentField];
      nextChildren[location.index] = nextChild;
      nextParentRecord[location.field] = nextChildren;
    } else {
      nextParentRecord[location.field] = nextChild;
    }

    nextChild = nextParent;
    currentId = location.parentId;
  }

  return nextChild;
}

function reciprocalPayload(expr: Expr): DivideExpr | null {
  const signed = splitSign(expr);
  const isReciprocal =
    signed.value.kind === "divide" &&
    signed.value.numerator.kind === "number" &&
    String(signed.value.numerator.value) === "1";
  if (!isReciprocal || signed.value.kind !== "divide") return null;
  return expr.kind === "divide" ? expr : signed.value;
}

function divideByReciprocal(numerator: Expr, payload: DivideExpr): Expr {
  const signed = splitSign(payload);
  if (signed.value.kind !== "divide") return numerator;
  return applySign(signed.sign, {
    kind: "divide",
    numerator,
    denominator: cloneExpr(signed.value.denominator),
  });
}
