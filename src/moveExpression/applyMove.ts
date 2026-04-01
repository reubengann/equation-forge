import { ExpressionTree, type MJ } from "../ExpressionTree";
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

function normalizeRoundTripAliases(expr: MJ): MJ {
  if (expr === "d_upright") return "DifferentialD";
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((child) => normalizeRoundTripAliases(child as MJ));

  if (op === "InvisibleOperator" || op === "Multiply") {
    if (kids.length === 2 && kids[0] === "d_upright") {
      return ["Differential", kids[1] as MJ] as MJ;
    }
    if (
      kids.length === 7 &&
      Array.isArray(kids[0]) &&
      (kids[0] as MJ[])[0] === "Subscript" &&
      (kids[0] as MJ[])[1] === "d" &&
      (kids[0] as MJ[])[2] === "u" &&
      kids[1] === "p" &&
      kids[2] === "r" &&
      kids[3] === "i" &&
      kids[4] === "g" &&
      kids[5] === "h" &&
      kids[6] === "t"
    ) {
      // In some reparses, `d_upright` is split into d_u p r i g h t factors.
      return "DifferentialD";
    }
    if (
      kids.length === 8 &&
      Array.isArray(kids[0]) &&
      (kids[0] as MJ[])[0] === "Subscript" &&
      (kids[0] as MJ[])[1] === "d" &&
      (kids[0] as MJ[])[2] === "u" &&
      kids[1] === "p" &&
      kids[2] === "r" &&
      kids[3] === "i" &&
      kids[4] === "g" &&
      kids[5] === "h" &&
      kids[6] === "t"
    ) {
      return ["Differential", kids[7] as MJ] as MJ;
    }
  }

  if (
    op === "Subscript" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "Differential"
  ) {
    // Canonicalize d(x)_s into d x_s so equivalent parse/render forms compare equal.
    const diffInner = (kids[0] as MJ[])[1] as MJ;
    return ["InvisibleOperator", "DifferentialD", ["Subscript", diffInner, kids[1] as MJ]] as MJ;
  }

  return [op, ...kids] as MJ;
}

function assertRoundTripInvariant(next: ExpressionTree) {
  const reparsed = parse(next.latexPlain);
  if (!reparsed) {
    throw new Error(
      `Round-trip parse failed for move result latex: ${next.latexPlain}`
    );
  }

  const canonicalize = (root: MJ): MJ => {
    const normalized = normalizeRoundTripAliases(
      (normalizeMathJson(root) ?? root) as MJ
    );
    // Canonicalize through app LaTeX rendering + parse to collapse equivalent
    // representations (e.g. FractionDerivative vs Divide+d_upright, gamma aliases).
    const latex = ExpressionTree.create(normalized).latexPlain;
    const reparsedCanonical = parse(latex) as MJ | null;
    if (!reparsedCanonical) return normalized;
    return normalizeRoundTripAliases(
      (normalizeMathJson(reparsedCanonical) ?? reparsedCanonical) as MJ
    );
  };

  const canonicalCurrent = canonicalize(next.rootJson);
  const canonicalReparsed = canonicalize(reparsed as MJ);
  const normalizeLatex = (s: string) => s.replace(/\s+/g, " ").trim();
  const currentLatex = normalizeLatex(ExpressionTree.create(canonicalCurrent).latexPlain);
  const reparsedLatex = normalizeLatex(ExpressionTree.create(canonicalReparsed).latexPlain);
  if (currentLatex !== reparsedLatex) {
    throw new Error(
      [
        "Move result failed round-trip tree invariant.",
        `latex: ${currentLatex}`,
        `reparsed latex: ${reparsedLatex}`,
        `current: ${JSON.stringify(canonicalCurrent)}`,
        `reparsed: ${JSON.stringify(canonicalReparsed)}`,
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
