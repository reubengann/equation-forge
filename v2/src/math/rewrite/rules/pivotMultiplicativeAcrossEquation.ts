import { cloneExpr } from "../../ast/utils";
import type { Expr } from "../../ast/expr";
import type { MoveContext, PivotRewriteRule } from "../types";

export function pivotMultiplicativeAcrossEquation(): PivotRewriteRule {
  return {
    id: "pivotMultiplicativeAcrossEquation",
    selectionKind: "*",
    moveType: "multiplicative",
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
        payload: reciprocalPayload(context.payload),
      };
    },
  };
}

function reciprocalPayload(expr: Expr): Expr {
  return {
    kind: "divide",
    numerator: { kind: "number", value: 1 },
    denominator: cloneExpr(expr),
  };
}
