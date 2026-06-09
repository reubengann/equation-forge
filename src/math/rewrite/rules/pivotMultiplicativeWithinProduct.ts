import type { MoveContext, PivotRewriteRule } from "../types";

export function pivotMultiplicativeWithinProduct(): PivotRewriteRule {
  return {
    id: "pivotMultiplicativeWithinProduct",
    selectionKind: "*",
    moveType: "multiplicative",
    pivotKind: "multiply",
    canApply: (context, pivotContext) => {
      if (!context.payload) return false;
      if (pivotContext.pivotNode.kind !== "multiply") return false;
      return pivotContext.sourceBranchId !== pivotContext.destinationBranchId;
    },
    apply: (context: MoveContext) => {
      if (!context.payload) return null;
      return { payload: context.payload };
    },
  };
}
