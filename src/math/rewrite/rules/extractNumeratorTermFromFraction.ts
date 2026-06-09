import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import { multiplySigns, splitSign, withSign } from "../algebraUtils";
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

      const parentSign = edge.parentNode.sign === -1 ? -1 : 1;
      const numeratorSplit = splitSign(edge.childNode);
      const payloadSplit = splitSign(context.payload);
      const remainingFraction: Expr = fractionWithSign(
        cloneExpr(numeratorSplit.value),
        cloneExpr(edge.parentNode.denominator),
        multiplySigns(parentSign, numeratorSplit.sign),
      );
      const payloadFraction: Expr = fractionWithSign(
        cloneExpr(payloadSplit.value),
        cloneExpr(edge.parentNode.denominator),
        multiplySigns(parentSign, payloadSplit.sign),
      );

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

function fractionWithSign(numerator: Expr, denominator: Expr, sign: 1 | -1): Expr {
  return withSign({
    kind: "divide",
    numerator,
    denominator,
  }, sign);
}

function shouldWrapAdditiveReplacement(context: MoveContext, nodeId: string): boolean {
  const parentId = context.document.index.parentById[nodeId];
  if (!parentId) return false;
  const parent = context.document.index.nodeById[parentId];
  return parent?.kind === "multiply";
}
