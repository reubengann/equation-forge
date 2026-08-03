import { cloneExpr } from "../../ast/utils";
import type { MoveContext, UpwardRewriteRule } from "../types";
import {
  areMatchingPowerContainers,
  enclosingPowerContainer,
  powerContainerAt,
} from "./samePowerContainers";

export function extractFactorFromMatchingPower(): UpwardRewriteRule {
  return {
    id: "extractFactorFromMatchingPower",
    selectionKind: "*",
    moveType: "multiplicative",
    fromKind: "*",
    toKind: "*",
    canApply: (context, edge) => {
      const source = powerContainerAt(context.document, edge.parentId);
      if (!source || source.innerId !== edge.childId) return false;

      const destination = enclosingPowerContainer(context.document, context.destinationId);
      if (!destination || destination.id === source.id) return false;
      if (!areMatchingPowerContainers(source.node, destination.node)) return false;

      return context.payload != null || selectionReachesInnerDirectly(context, edge.childId);
    },
    apply: (context: MoveContext, edge) => {
      const source = powerContainerAt(context.document, edge.parentId);
      const destination = enclosingPowerContainer(context.document, context.destinationId);
      if (!source || source.innerId !== edge.childId || !destination) return null;
      if (!areMatchingPowerContainers(source.node, destination.node)) return null;

      if (context.payload) {
        return { payload: cloneExpr(context.payload) };
      }
      if (!selectionReachesInnerDirectly(context, edge.childId)) return null;

      return {
        payload: cloneExpr(edge.childNode),
        updatedNodeId: edge.parentId,
        updatedNode: { kind: "number", value: 1 },
      };
    },
  };
}

function selectionReachesInnerDirectly(context: MoveContext, innerId: string): boolean {
  if (context.selection.kind !== "single") return false;
  let currentId = context.selection.nodeId;
  if (currentId === innerId) return true;

  while (currentId !== innerId) {
    const parentId = context.document.index.parentById[currentId];
    if (!parentId) return false;
    if (parentId !== innerId && context.document.index.nodeById[parentId]?.kind !== "display_group") {
      return false;
    }
    currentId = parentId;
  }
  return true;
}
