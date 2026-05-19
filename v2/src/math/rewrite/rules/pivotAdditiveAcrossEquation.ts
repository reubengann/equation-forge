import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, PivotRewriteRule } from "../types";

export function pivotAdditiveAcrossEquation(): PivotRewriteRule {
  return {
    id: "pivotAdditiveAcrossEquation",
    selectionKind: "single",
    moveType: "additive",
    pivotKind: "equation",
    canApply: (context, pivotContext) => {
      if (context.selection.kind !== "single") return false;
      if (!context.payload) return false;
      if (pivotContext.pivotNode.kind !== "equation") return false;
      return pivotContext.sourceBranchId !== pivotContext.destinationBranchId;
    },
    apply: (context: MoveContext, pivotContext) => {
      if (!context.payload) return null;
      if (pivotContext.pivotNode.kind !== "equation") return null;

      return {
        payload: additiveInverse(context.payload),
      };
    },
  };
}

function additiveInverse(expr: Expr): Expr {
  if (expr.kind === "negate") return cloneExpr(expr.value);
  return { kind: "negate", value: cloneExpr(expr) };
}
