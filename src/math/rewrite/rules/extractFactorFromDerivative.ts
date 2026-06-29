import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import { applySign, splitSign } from "../algebraUtils";
import type { MoveContext, UpwardRewriteRule } from "../types";

type DerivativeLikeExpr = Extract<
  Expr,
  { kind: "full_derivative_operator" | "partial_derivative" | "partial_derivative_operator" }
>;

export function extractFactorFromDerivative(): UpwardRewriteRule {
  return {
    id: "extractFactorFromDerivative",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "partial_derivative_operator",
    canApply: (context, edge) => {
      if (!context.payload) return false;
      if (!isDerivativeLike(edge.parentNode)) return false;
      return isDerivativeOperandEdge(context, edge.parentId, edge.childId);
    },
    apply: (context: MoveContext, edge) => {
      if (!context.payload) return null;
      if (!isDerivativeLike(edge.parentNode)) return null;
      if (!isDerivativeOperandEdge(context, edge.parentId, edge.childId)) return null;

      const signedDerivative = splitSign(edge.parentNode);
      const remainingDerivative = withDerivativeOperand(signedDerivative.value as DerivativeLikeExpr, edge.childNode);

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: remainingDerivative,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "after"
          ? [remainingDerivative, applySign(signedDerivative.sign, cloneExpr(context.payload))]
          : [applySign(signedDerivative.sign, cloneExpr(context.payload)), remainingDerivative];

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

function isDerivativeLike(expr: Expr): expr is DerivativeLikeExpr {
  return (
    expr.kind === "full_derivative_operator" ||
    expr.kind === "partial_derivative" ||
    expr.kind === "partial_derivative_operator"
  );
}

function isDerivativeOperandEdge(context: MoveContext, parentId: string, childId: string): boolean {
  const location = context.document.index.locationById[childId];
  return location?.parentId === parentId && (location.field === "operand" || location.field === "quantity");
}

function withDerivativeOperand(expr: DerivativeLikeExpr, operand: Expr): DerivativeLikeExpr {
  switch (expr.kind) {
    case "partial_derivative":
      return {
        ...expr,
        quantity: cloneExpr(operand),
      };
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return {
        ...expr,
        operand: cloneExpr(operand),
      };
  }
}
