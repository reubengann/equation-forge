import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, UpwardRewriteRule } from "../types";

type IntegralLikeExpr = Extract<
  Expr,
  { kind: "integral" | "uniterated_integral" | "closed_integral" | "multiple_integral" }
>;

export function extractFactorFromIntegral(): UpwardRewriteRule {
  return {
    id: "extractFactorFromIntegral",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "integral",
    canApply: (context, edge) => {
      if (!context.payload) return false;
      if (!isIntegralLike(edge.parentNode)) return false;
      if (containsDifferential(context.payload)) return false;
      return context.document.index.locationById[edge.childId]?.field === "integrand";
    },
    apply: (context: MoveContext, edge) => {
      if (!context.payload) return null;
      if (!isIntegralLike(edge.parentNode)) return null;
      if (containsDifferential(context.payload)) return null;
      if (context.document.index.locationById[edge.childId]?.field !== "integrand") return null;

      const remainingIntegral = withIntegrand(edge.parentNode, edge.childNode);

      if (!edge.isFinalUpwardEdge) {
        return {
          payload: cloneExpr(context.payload),
          updatedNodeId: edge.parentId,
          updatedNode: remainingIntegral,
        };
      }

      if (context.destinationId !== edge.parentId) return null;

      const outputFactors =
        context.destinationSlot === "after"
          ? [remainingIntegral, cloneExpr(context.payload)]
          : [cloneExpr(context.payload), remainingIntegral];

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

function isIntegralLike(expr: Expr): expr is IntegralLikeExpr {
  return (
    expr.kind === "integral" ||
    expr.kind === "uniterated_integral" ||
    expr.kind === "closed_integral" ||
    expr.kind === "multiple_integral"
  );
}

function withIntegrand(expr: IntegralLikeExpr, integrand: Expr): Expr {
  return {
    ...cloneExpr(expr),
    integrand: cloneExpr(integrand),
  };
}

function containsDifferential(expr: Expr): boolean {
  switch (expr.kind) {
    case "differential":
      return true;
    case "add":
      return expr.terms.some(containsDifferential);
    case "multiply":
      return expr.factors.some(containsDifferential);
    case "power":
      return containsDifferential(expr.base) || containsDifferential(expr.exponent);
    case "negate":
      return containsDifferential(expr.value);
    case "divide":
      return containsDifferential(expr.numerator) || containsDifferential(expr.denominator);
    case "display_group":
      return containsDifferential(expr.expression);
    default:
      return false;
  }
}
