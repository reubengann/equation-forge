import type { ExpressionTree } from "../ExpressionTree";
import type { Slot } from "./types";
import {
  applyMoveAdditive,
  applyMoveOld as applyMoveOldAdditive,
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
  return applyMoveAdditive(args);
}

// Re-export additive helpers so existing imports keep working.
export const applyMoveOld = applyMoveOldAdditive;
export const maybeDropHere = maybeDropHereAdditive;
export const stepDown = stepDownAdditive;
export const stepUp = stepUpAdditive;
export type State = AdditiveState;
