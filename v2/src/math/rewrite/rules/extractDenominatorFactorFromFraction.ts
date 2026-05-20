import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

export function extractDenominatorFactorFromFraction(): UpwardRewriteRule {
  return {
    id: "extractDenominatorFactorFromFraction",
    selectionKind: "single",
    moveType: "multiplicative",
    fromKind: "multiply",
    toKind: "divide",
    canApply: (context, edge) => {
      if (context.payload) return false;
      if (context.selection.kind !== "single") return false;
      if (edge.parentNode.kind !== "divide") return false;
      if (edge.childNode.kind !== "multiply") return false;
      if (context.document.index.locationById[edge.childId]?.field !== "denominator") return false;
      return isWholeDenominatorSelection(context, edge.childId) || selectedFactorIndex(context, edge.childId) != null;
    },
    apply: (context: MoveContext, edge) => {
      if (context.selection.kind !== "single") return null;
      if (edge.parentNode.kind !== "divide") return null;
      if (edge.childNode.kind !== "multiply") return null;
      if (context.document.index.locationById[edge.childId]?.field !== "denominator") return null;

      if (isWholeDenominatorSelection(context, edge.childId)) {
        const remainingNumerator = cloneExpr(edge.parentNode.numerator);
        const reciprocalDenominator: Expr = {
          kind: "divide",
          numerator: { kind: "number", value: 1 },
          denominator: cloneExpr(edge.childNode),
        };

        if (!edge.isFinalUpwardEdge) {
          return {
            payload: reciprocalDenominator,
            updatedNodeId: edge.parentId,
            updatedNode: remainingNumerator,
          };
        }

        if (context.destinationId !== edge.parentId) return null;

        const outputFactors =
          context.destinationSlot === "before"
            ? [reciprocalDenominator, remainingNumerator]
            : [remainingNumerator, reciprocalDenominator];

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

      const sourceFactorIndex = selectedFactorIndex(context, edge.childId);
      if (sourceFactorIndex == null) return null;

      const factors = edge.childNode.factors.map(cloneExpr);
      const [selectedFactor] = factors.splice(sourceFactorIndex, 1);
      if (!selectedFactor) return null;

      const remainingFraction: Expr = {
        kind: "divide",
        numerator: cloneExpr(edge.parentNode.numerator),
        denominator: collapseMultiplicativeFactors(factors),
      };
      const reciprocalSelectedFactor: Expr = {
        kind: "divide",
        numerator: { kind: "number", value: 1 },
        denominator: selectedFactor,
      };

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: reciprocalSelectedFactor,
          updatedNodeId: edge.parentId,
          updatedNode: remainingFraction,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "before"
          ? [reciprocalSelectedFactor, remainingFraction]
          : [remainingFraction, reciprocalSelectedFactor];

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
    },
  };
}

function isWholeDenominatorSelection(context: MoveContext, denominatorId: string): boolean {
  return context.selection.kind === "single" && context.selection.nodeId === denominatorId;
}

function selectedFactorIndex(context: MoveContext, denominatorId: string): number | null {
  if (context.selection.kind !== "single") return null;
  const factorIds = context.document.index.childrenById[denominatorId] ?? [];
  const index = factorIds.indexOf(context.selection.nodeId);
  return index >= 0 ? index : null;
}

function collapseMultiplicativeFactors(factors: Expr[]): Expr {
  if (factors.length === 0) return { kind: "number", value: 1 };
  if (factors.length === 1) return factors[0];
  return { kind: "multiply", factors };
}

