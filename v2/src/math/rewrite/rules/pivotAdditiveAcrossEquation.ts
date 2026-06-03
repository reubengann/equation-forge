import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import { flipSign } from "../algebraUtils";
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
  if (expr.kind === "add") return flipSign({ kind: "display_group", delimiter: "paren", expression: cloneExpr(expr) });
  return flipSign(expr);
}
