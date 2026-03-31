import { ExpressionTree } from "../ExpressionTree";
import { normalizeMathJson, parse } from "../computeEngine";
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

function deepEqualMJ(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

function assertRoundTripInvariant(next: ExpressionTree) {
  const reparsed = parse(next.latexPlain);
  if (!reparsed) {
    throw new Error(
      `Round-trip parse failed for move result latex: ${next.latexPlain}`
    );
  }

  const normalizedCurrent = normalizeMathJson(next.rootJson) ?? next.rootJson;
  const normalizedReparsed = normalizeMathJson(reparsed) ?? reparsed;
  if (!deepEqualMJ(normalizedCurrent, normalizedReparsed)) {
    throw new Error(
      [
        "Move result failed round-trip tree invariant.",
        `latex: ${next.latexPlain}`,
        `current: ${JSON.stringify(normalizedCurrent)}`,
        `reparsed: ${JSON.stringify(normalizedReparsed)}`,
      ].join("\n")
    );
  }
}

export function applyMove(args: ApplyMoveArgs): ExpressionTree | null {
  const canonicalize = (next: ExpressionTree | null): ExpressionTree | null => {
    if (!next) return null;
    const normalized = normalizeMathJson(next.rootJson);
    const canonicalTree =
      !normalized || next.rootJson === normalized
        ? next
        : ExpressionTree.create(normalized);
    assertRoundTripInvariant(canonicalTree);
    return canonicalTree;
  };
  const mode = args.mode ?? "additive";
  if (mode === "multiplicative") {
    return canonicalize(applyMoveMultiplicative(args));
  }

  const additive = applyMoveAdditive(args);
  if (additive) return canonicalize(additive);

  // Additive executor does not implement fraction merge semantics; if the hover is
  // a Divide node (or legacy null-slot mapping), retry through multiplicative path.
  if (args.targetSlot === null || args.tree.nodesById[args.hoverId]?.op === "Divide") {
    return canonicalize(applyMoveMultiplicative({ ...args, mode: "multiplicative" }));
  }

  return null;
}

// Re-export additive helpers so existing imports keep working.
export const maybeDropHere = maybeDropHereAdditive;
export const stepDown = stepDownAdditive;
export const stepUp = stepUpAdditive;
export type State = AdditiveState;
