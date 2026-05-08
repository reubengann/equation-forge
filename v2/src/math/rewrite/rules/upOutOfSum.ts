import { add } from "../../ast";
import type { AddExpr, Expr } from "../../ast/expr";
import type { MoveContext, RewriteRule } from "../types";

export function upOutOfSum(): RewriteRule {
  return {
    id: "anyToSum",
    canMove: (_context: MoveContext, _source: AddExpr) => {
      // Any term whatsoever can be moved out of a sum.
      return true;
    },
    executeMove: (context: MoveContext, source: AddExpr) => {
      if (context.payload != null) return null;
      let payload: Expr | null = null;
      if (context.selection.kind === "single") {
        const selectedNode = context.document.index.nodeById[context.selection.nodeId]!;
        removeTermFromAdd(source, selectedNode);

        payload = selectedNode;
      }
      if (context.selection.kind === "multi") {
        const selectedNodes = context.selection.nodeIds.map((id) => context.document.index.nodeById[id]!);
        const newAdd = add(selectedNodes);
        selectedNodes.forEach((node) => removeTermFromAdd(source, node));
        payload = newAdd;
      }
      return {
        payload,
      };
    },
    direction: "up",
    moveType: "additive",
    selectionKind: "single",
  };
}

function removeTermFromAdd(source: AddExpr, selectedNode: Expr) {
  const index = source.terms.indexOf(selectedNode);
  if (index < 0) throw new Error("Node not found in add");
  source.terms.splice(index, 1);
}
