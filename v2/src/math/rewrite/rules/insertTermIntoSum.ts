import { cloneExpr } from "../../ast/utils";
import type { MoveContext, DownwardRewriteRule } from "../types";

export function insertTermIntoSum(): DownwardRewriteRule {
  return {
    id: "insertTermIntoSum",
    selectionKind: "single",
    moveType: "additive",
    toKind: "add",
    canApply: (context, downContext) => {
      if (context.selection.kind !== "single") return false;
      if (!context.payload) return false;
      return downContext.sideNode.kind === "add" || downContext.sideId === downContext.destinationId;
    },
    apply: (context: MoveContext, downContext) => {
      if (!context.payload) return null;

      if (downContext.sideNode.kind !== "add") {
        if (downContext.sideId !== downContext.destinationId) return null;
        const destination = cloneExpr(downContext.sideNode);
        return {
          updatedNodeId: downContext.sideId,
          updatedNode: {
            kind: "add",
            terms:
              context.destinationSlot === "after"
                ? [destination, cloneExpr(context.payload)]
                : [cloneExpr(context.payload), destination],
          },
          insertionPreview: {
            containerId: downContext.sideId,
            containerKind: "add",
            destinationId: downContext.destinationId,
            destinationSlot: context.destinationSlot ?? "before",
            lineOrientation: "vertical",
          },
        };
      }

      const termIds = context.document.index.childrenById[downContext.sideId] ?? [];
      const destinationAncestors = new Set(context.document.index.ancestorsById[downContext.destinationId] ?? []);
      const destinationTermIndex = termIds.findIndex(
        (termId) => termId === downContext.destinationId || destinationAncestors.has(termId),
      );
      if (destinationTermIndex < 0) return null;

      const terms = downContext.sideNode.terms.map(cloneExpr);
      const insertionIndex =
        context.destinationSlot === "after" ? destinationTermIndex + 1 : destinationTermIndex;
      terms.splice(insertionIndex, 0, cloneExpr(context.payload));

      return {
        updatedNodeId: downContext.sideId,
        updatedNode: { kind: "add", terms },
        insertionPreview: {
          containerId: downContext.sideId,
          containerKind: "add",
          destinationId: downContext.destinationId,
          destinationSlot: context.destinationSlot ?? "before",
          lineOrientation: "vertical",
        },
      };
    },
  };
}
