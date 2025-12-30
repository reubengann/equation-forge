import type { ExpressionTree, MJ } from "../ExpressionTree";
import type { Slot } from "./types";

export function applyMove(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot | null;
}): ExpressionTree | null {
  return null;
}
