import type { ExpressionTree } from "../ExpressionTree";
import type { Slot } from "./types";
import {
  applyMoveAdditive,
  maybeDropHere as maybeDropHereAdditive,
  stepDown as stepDownAdditive,
  stepUp as stepUpAdditive,
  type State as AdditiveState,
} from "./applyMoveAdditive";
import { applyMoveMultiplicative } from "./applyMoveMultiplicative";

export type MoveMode = "additive" | "multiplicative";

export type ApplyMoveArgs = {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
  mode?: MoveMode;
};

export function applyMove(args: ApplyMoveArgs): ExpressionTree | null {
  const mode = args.mode ?? "additive";
  if (mode === "multiplicative") {
    return applyMoveMultiplicative(args);
  }

  const additive = applyMoveAdditive(args);
  if (additive) return additive;

  // Additive executor does not implement fraction merge semantics; if the hover is
  // a Divide node (or legacy null-slot mapping), retry through multiplicative path.
  if (args.targetSlot === null || args.tree.nodesById[args.hoverId]?.op === "Divide") {
    return applyMoveMultiplicative({ ...args, mode: "multiplicative" });
  }

  return null;
}

// Re-export additive helpers so existing imports keep working.
export const maybeDropHere = maybeDropHereAdditive;
export const stepDown = stepDownAdditive;
export const stepUp = stepUpAdditive;
export type State = AdditiveState;
