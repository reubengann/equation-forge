import { ExpressionTree, type MJ } from "../ExpressionTree";
import {
  computeDestinationIndex,
  isStructurallyValidMove,
  reorderAddAtPath,
} from "../movePath";
import type { Slot } from "./types";

function nearestAddContainerId(
  tree: ExpressionTree,
  nodeId: string
): string | null {
  const self = tree.nodesById[nodeId];
  if (self?.op === "Add") return nodeId;

  const p = tree.parentById[nodeId];
  if (!p) return null;

  return tree.nodesById[p]?.op === "Add" ? p : null;
}

export function applyMove(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
}): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;

  // TODO
  if (selectedIds.length !== 1) return null;
  if (targetSlot == null) return null;
  const movedId = selectedIds[0];
  const ban = isStructurallyValidMove(tree, movedId, hoverId);
  if (ban) return null;

  // If we're over a member of the sum or we're over the sum itself
  const addId = nearestAddContainerId(tree, hoverId);
  if (!addId) return null;

  // For now, we can only move to the same sum
  if (tree.parentById[movedId] !== addId) return null;

  // If we are the only term in the sum (should not happen, bail)
  const kids = tree.childrenById[addId] ?? [];
  if (kids.length < 2) return null;

  const fromIndex = tree.childIndexById[movedId];
  if (fromIndex == null) return null;

  let toIndex = computeDestinationIndex(targetSlot, fromIndex);
  toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));

  // Nothing to do, we're already here
  if (toIndex === fromIndex) return null;

  const addPath = tree.pathById[addId];
  if (!addPath) return null;

  const nextJson = reorderAddAtPath(tree.rootJson, addPath, fromIndex, toIndex);
  return ExpressionTree.create(nextJson);
}
