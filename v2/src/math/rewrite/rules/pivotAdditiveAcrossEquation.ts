import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, PivotRewriteRule } from "../types";

export function pivotAdditiveAcrossEquation(): PivotRewriteRule {
  return {
    id: "pivotAdditiveAcrossEquation",
    selectionKind: "*",
    moveType: "additive",
    pivotKind: "equation",
    canApply: (context, pivotContext) => {
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
  if (expr.kind === "add") {
    return { kind: "negate", value: { kind: "display_group", delimiter: "paren", expression: cloneExpr(expr) } };
  }
  return { kind: "negate", value: cloneExpr(expr) };
}
