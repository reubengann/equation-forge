import { ExpressionTree } from "../ExpressionTree";
import {
  computeDestinationIndex,
  isStructurallyValidMove,
  reorderAddAtPath,
} from "../movePath";
import { normalizeSelection } from "../selectionSemantics";
import type { Slot } from "./types";

export function applyMove(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
}): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (targetSlot == null) return null;
  // TODO
  if (selectedIds.length !== 1) return null;

  const movedId = normalizeSelection(tree, selectedIds[0]);

  const addId = hoverId;
  if (tree.nodesById[addId]?.op !== "Add") return null;
  if (tree.parentById[movedId] !== addId) return null;

  const ban = isStructurallyValidMove(tree, movedId, addId);
  if (ban) return null;

  const kids = tree.childrenById[addId] ?? [];
  if (kids.length < 2) return tree;

  const fromIndex = tree.childIndexById[movedId];
  if (fromIndex == null) return null;

  let toIndex = computeDestinationIndex(targetSlot, fromIndex);
  toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));
  if (toIndex === fromIndex) return null;

  const addPath = tree.pathById[addId];
  if (!addPath) return null;

  const nextJson = reorderAddAtPath(tree.rootJson, addPath, fromIndex, toIndex);
  return ExpressionTree.create(nextJson);
}
