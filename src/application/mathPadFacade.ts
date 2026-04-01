import { parse } from "../computeEngine";
import { ExpressionTree, type MJ } from "../ExpressionTree";
import { applyMove, type MoveMode } from "../moveExpression/applyMove";
import type { Slot } from "../moveExpression/types";
import {
  applyOperationToBothSides,
  cancelTerm,
  canCancelTerm,
  canEvaluateSelection,
  canFactorSelection,
  evaluateSelection,
  expandSubexpression,
  factorSelection,
  forceDelimiter,
  canForceDelimiter,
  flipEquation,
  isFlippableEquation,
  substitute,
  substituteMany,
  substituteSpan,
  toggleDelimiterStyle,
  canToggleDelimiterStyle,
  type SubstituteScope,
} from "../operations";
import {
  chooseBestAllowedSelectedNode,
  normalizeSelection,
  type ExprSelection,
} from "../selectionSemantics";

export type NodeSelector =
  | { path: number[] }
  | { latex: string }
  | { nodeId: string };

export type SelectionSpec =
  | { kind: "node"; by: NodeSelector }
  | {
      kind: "span";
      parent: NodeSelector;
      op: "Add" | "InvisibleOperator";
      start: number;
      end: number;
    }
  | { kind: "multi"; items: NodeSelector[] };

export type MathAction =
  | { type: "flip" }
  | { type: "expand"; targetId?: string }
  | { type: "factor" }
  | { type: "cancel" }
  | { type: "forceDelimiter" }
  | { type: "toggleDelimiterStyle" }
  | { type: "evaluate" }
  | { type: "applyToBothSides"; operationLatex: string }
  | {
      type: "substitute";
      replacement: MJ;
      scope: SubstituteScope;
      targetId?: string;
    }
  | {
      type: "move";
      selectedIds: string[];
      hoverId: string;
      targetSlot: Slot;
      mode?: MoveMode;
    };

export type ApplyActionInput = {
  tree: ExpressionTree;
  selection: ExprSelection | null;
  action: MathAction;
};

export type ApplyActionResult =
  | { ok: true; tree: ExpressionTree }
  | { ok: false; reason: string };

function pathKey(path: number[]): string {
  return path.join(".");
}

function getSubstituteTargetId(
  tree: ExpressionTree,
  selection: ExprSelection | null
): string | null {
  if (!selection) return null;
  if (selection.kind === "node") return selection.nodeId;
  if (selection.kind !== "span") return null;

  const parentOp = tree.nodesById[selection.parentId]?.op;
  const isMultiplicative =
    parentOp === "InvisibleOperator" || parentOp === "Multiply";
  const kids = tree.childrenById[selection.parentId] ?? [];
  const coversAll =
    kids.length > 0 &&
    selection.start === 0 &&
    selection.end === kids.length - 1;

  return isMultiplicative && coversAll ? selection.parentId : null;
}

function multiSelectionAsSpan(
  tree: ExpressionTree,
  selection: ExprSelection | null
): { parentId: string; op: "Add" | "InvisibleOperator"; start: number; end: number } | null {
  if (!selection || selection.kind !== "multi") return null;
  const ids = Array.from(new Set(selection.nodeIds));
  if (ids.length < 2) return null;

  const firstParent = tree.parentById[ids[0]];
  if (!firstParent) return null;
  if (!ids.every((id) => tree.parentById[id] === firstParent)) return null;

  const parentOpRaw = tree.nodesById[firstParent]?.op;
  if (parentOpRaw !== "Add" && parentOpRaw !== "InvisibleOperator" && parentOpRaw !== "Multiply") {
    return null;
  }
  const op: "Add" | "InvisibleOperator" =
    parentOpRaw === "Add" ? "Add" : "InvisibleOperator";

  const indices = ids
    .map((id) => tree.childIndexById[id])
    .filter((idx): idx is number => idx !== undefined)
    .sort((a, b) => a - b);
  if (indices.length !== ids.length) return null;
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) return null;
  }

  return {
    parentId: firstParent,
    op,
    start: indices[0],
    end: indices[indices.length - 1],
  };
}

function getExpandTargetId(
  tree: ExpressionTree,
  selection: ExprSelection | null
): string | null {
  if (!selection) return null;
  if (selection.kind === "multi") {
    const span = multiSelectionAsSpan(tree, selection);
    if (!span) return null;
    const kids = tree.childrenById[span.parentId] ?? [];
    const coversAll =
      kids.length > 0 &&
      span.start === 0 &&
      span.end === kids.length - 1;
    return coversAll ? span.parentId : null;
  }
  if (selection.kind === "node") return selection.nodeId;

  const kids = tree.childrenById[selection.parentId] ?? [];
  const coversAll =
    kids.length > 0 &&
    selection.start === 0 &&
    selection.end === kids.length - 1;
  return coversAll ? selection.parentId : null;
}

function toEvaluationSelection(
  tree: ExpressionTree,
  selection: ExprSelection
): ExprSelection {
  if (selection.kind !== "node") return selection;

  let target = selection.nodeId;
  while (true) {
    const targetOp = tree.nodesById[target]?.op;
    const parentId = tree.parentById[target];
    if (!parentId) break;
    const parentOp = tree.nodesById[parentId]?.op;
    if (
      parentOp &&
      parentOp !== "Equal" &&
      (targetOp === "Number" ||
        targetOp === "Degrees" ||
        targetOp === "Delimiter")
    ) {
      target = parentId;
      continue;
    }
    break;
  }

  return { kind: "node", nodeId: target };
}

function resolveNodeId(
  tree: ExpressionTree,
  selector: NodeSelector
): string | null {
  if ("nodeId" in selector) {
    return tree.nodesById[selector.nodeId] ? selector.nodeId : null;
  }
  if ("path" in selector) {
    const id = tree.idByPath[pathKey(selector.path)];
    return id ?? null;
  }

  const hit = Object.values(tree.nodesById).find(
    (node) => node.latex === selector.latex
  );
  return hit?.id ?? null;
}

function resolveSelection(
  tree: ExpressionTree,
  spec: SelectionSpec | null
): ExprSelection | null {
  if (!spec) return null;

  if (spec.kind === "node") {
    const nodeId = resolveNodeId(tree, spec.by);
    return nodeId ? { kind: "node", nodeId } : null;
  }

  if (spec.kind === "span") {
    const parentId = resolveNodeId(tree, spec.parent);
    if (!parentId) return null;
    const kids = tree.childrenById[parentId] ?? [];
    if (
      spec.start < 0 ||
      spec.end < 0 ||
      spec.start > spec.end ||
      spec.end >= kids.length
    ) {
      return null;
    }
    return {
      kind: "span",
      parentId,
      op: spec.op,
      start: spec.start,
      end: spec.end,
    };
  }

  const nodeIds = spec.items
    .map((item) => resolveNodeId(tree, item))
    .filter((id): id is string => !!id);
  if (nodeIds.length === 0) return null;
  return { kind: "multi", nodeIds };
}

function applyAction(input: ApplyActionInput): ApplyActionResult {
  const { tree, selection, action } = input;

  if (action.type === "flip") {
    const flipped = flipEquation(tree.rootJson);
    if (!flipped) return { ok: false, reason: "Equation is not flippable." };
    return { ok: true, tree: ExpressionTree.create(flipped) };
  }

  if (action.type === "expand") {
    const targetId = action.targetId ?? getExpandTargetId(tree, selection);
    if (!targetId) return { ok: false, reason: "No expand target selected." };
    const next = expandSubexpression(tree, targetId);
    if (!next) return { ok: false, reason: "Expand action produced no change." };
    return { ok: true, tree: next };
  }

  if (action.type === "factor") {
    if (!selection) return { ok: false, reason: "No selection for factor." };
    const next = factorSelection(tree, selection);
    if (!next) return { ok: false, reason: "Factor action produced no change." };
    return { ok: true, tree: next };
  }

  if (action.type === "cancel") {
    if (!selection) return { ok: false, reason: "No selection for cancel." };
    const next = cancelTerm(tree, selection);
    if (!next) return { ok: false, reason: "Cancel action produced no change." };
    return { ok: true, tree: next };
  }

  if (action.type === "forceDelimiter") {
    const next = forceDelimiter(tree, selection);
    if (!next) return { ok: false, reason: "No node selected." };
    return { ok: true, tree: next };
  }

  if (action.type === "toggleDelimiterStyle") {
    const next = toggleDelimiterStyle(tree, selection);
    if (!next) return { ok: false, reason: "No delimiter selected." };
    return { ok: true, tree: next };
  }

  if (action.type === "evaluate") {
    if (!selection) return { ok: false, reason: "No selection for evaluate." };
    const evalSelection = toEvaluationSelection(tree, selection);
    const next = evaluateSelection(tree, evalSelection);
    if (!next) return { ok: false, reason: "Evaluate action produced no change." };
    return { ok: true, tree: next };
  }

  if (action.type === "applyToBothSides") {
    try {
      const result = applyOperationToBothSides(tree.rootJson, action.operationLatex);
      return { ok: true, tree: ExpressionTree.create(result) };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not apply operation.";
      return { ok: false, reason: message };
    }
  }

  if (action.type === "move") {
    const next = applyMove({
      tree,
      selectedIds: action.selectedIds,
      hoverId: action.hoverId,
      targetSlot: action.targetSlot,
      mode: action.mode,
    });
    if (!next) return { ok: false, reason: "Move action produced no change." };
    return { ok: true, tree: next };
  }

  let next: ExpressionTree | null = null;
  if (selection?.kind === "multi" && !action.targetId) {
    const span = multiSelectionAsSpan(tree, selection);
    if (span && action.scope === "single") {
      next = substituteSpan({
        tree,
        parentId: span.parentId,
        start: span.start,
        end: span.end,
        replacement: action.replacement,
      });
    } else {
      next = substituteMany({
        tree,
        targetIds: selection.nodeIds,
        replacement: action.replacement,
        scope: action.scope,
      });
    }
  } else if (selection?.kind === "span" && !action.targetId) {
    next = substituteSpan({
      tree,
      parentId: selection.parentId,
      start: selection.start,
      end: selection.end,
      replacement: action.replacement,
    });
  } else {
    const targetId = action.targetId ?? getSubstituteTargetId(tree, selection);
    if (!targetId) return { ok: false, reason: "No substitute target selected." };
    next = substitute({
      tree,
      targetId,
      replacement: action.replacement,
      scope: action.scope,
    });
  }
  if (!next) return { ok: false, reason: "Substitution failed." };
  return { ok: true, tree: next };
}

export const mathPadFacade = {
  parseLatex(latex: string): MJ | null {
    return parse(latex);
  },

  createTree(rootJson: MJ): ExpressionTree {
    return ExpressionTree.create(rootJson);
  },

  chooseBestAllowedSelectedNode,
  normalizeSelection,

  isFlippableEquation,

  canExpand(tree: ExpressionTree | null, selection: ExprSelection | null): boolean {
    if (!tree) return false;
    const targetId = getExpandTargetId(tree, selection);
    if (!targetId) return false;
    return expandSubexpression(tree, targetId) !== null;
  },

  canSubstitute(
    tree: ExpressionTree | null,
    selection: ExprSelection | null
  ): boolean {
    if (!tree) return false;
    if (selection?.kind === "multi") return selection.nodeIds.length > 0;
    if (selection?.kind === "span") {
      return (
        (tree.childrenById[selection.parentId] ?? []).slice(
          selection.start,
          selection.end + 1
        ).length > 0
      );
    }
    return getSubstituteTargetId(tree, selection) != null;
  },

  canCancel(tree: ExpressionTree | null, selection: ExprSelection | null): boolean {
    return canCancelTerm(tree, selection);
  },

  canToggleDelimiterStyle(
    tree: ExpressionTree | null,
    selection: ExprSelection | null
  ): boolean {
    return canToggleDelimiterStyle(tree, selection);
  },

  canForceDelimiter(
    tree: ExpressionTree | null,
    selection: ExprSelection | null
  ): boolean {
    return canForceDelimiter(tree, selection);
  },

  canEvaluate(
    tree: ExpressionTree | null,
    selection: ExprSelection | null
  ): boolean {
    return canEvaluateSelection(tree, selection);
  },

  canFactor(tree: ExpressionTree | null, selection: ExprSelection | null): boolean {
    return canFactorSelection(tree, selection);
  },

  getExpandTargetId,
  getSubstituteTargetId,
  multiSelectionAsSpan,
  toEvaluationSelection,

  resolveNodeId,
  resolveSelection,
  applyAction,
};

export type { ExprSelection, MJ, SubstituteScope };
