import type { ExpressionTree } from "../../ExpressionTree";
import type { MoveMode } from "../../moveExpression/applyMove";
import { applyMove } from "../../moveExpression/applyMove";
import type { RectLTRB } from "../../rectMath";
import { normalizeSelectedIdsForMove } from "./moveSelectionPolicy";
import { describeMovePlan, planToApplyMoveTarget } from "./movePlanAdapters";
import { planMove, type MovePlan } from "./planMove";
import type { RectProvider } from "./planMoveGeometry";

export type RectSnapshot = Record<string, RectLTRB>;

export type MoveTraceSample = {
  pointer: { x: number; y: number };
  hoverId: string | null;
  hoverUsedFallback?: boolean;
};

export type MoveCaptureFixture = {
  version: 1;
  name: string;
  expressionLatex: string;
  mode: MoveMode;
  selectedIds: string[];
  rects: RectSnapshot;
  samples: MoveTraceSample[];
};

export type MoveReplayFrame = {
  index: number;
  isFinalSample: boolean;
  pointer: { x: number; y: number };
  hoverId: string | null;
  hoverUsedFallback: boolean;
  effectiveSelectedIds: string[];
  plan: MovePlan | null;
  planDescription: string;
  applyTarget: { hoverId: string; targetSlot: number | null } | null;
  selectedNodes: MoveNodeRef[];
  hoverNode: MoveNodeRef | null;
  applyTargetNode: MoveNodeRef | null;
  planNodeIds: string[];
  planNodes: MoveNodeRef[];
};

export type MoveReplayResult = {
  frames: MoveReplayFrame[];
  finalFrame: MoveReplayFrame | null;
  finalPlan: MovePlan | null;
  finalTarget: { hoverId: string; targetSlot: number | null } | null;
};

export type MoveNodeRef = {
  id: string;
  op: string;
  latex: string;
  parentId: string | null;
  parentOp: string | null;
  childIds: string[];
  childOps: string[];
  childLatex: string[];
};

export function rectProviderFromSnapshot(rects: RectSnapshot): RectProvider {
  return (nodeId: string) => rects[nodeId] ?? null;
}

export function replayMoveCapture(args: {
  tree: ExpressionTree;
  mode: MoveMode;
  selectedIds: string[];
  rects: RectSnapshot;
  samples: MoveTraceSample[];
  sampleIndices?: number[];
}): MoveReplayResult {
  const { tree, mode, selectedIds, rects, samples, sampleIndices } = args;
  const rectFor = rectProviderFromSnapshot(rects);
  const frames: MoveReplayFrame[] = [];

  const wantedIndices =
    sampleIndices && sampleIndices.length > 0
      ? new Set(sampleIndices.filter((n) => Number.isInteger(n) && n >= 0))
      : null;

  let finalPlan: MovePlan | null = null;
  let finalTarget: { hoverId: string; targetSlot: number | null } | null = null;
  let finalFrame: MoveReplayFrame | null = null;

  for (let i = 0; i < samples.length; i += 1) {
    if (wantedIndices && !wantedIndices.has(i)) continue;
    const sample = samples[i];
    const effectiveSelectedIds = normalizeSelectedIdsForMove({
      tree,
      selectedIds,
      mode,
      hoverId: sample.hoverId,
    });
    const plan = planMove({
      tree,
      selectedIds: effectiveSelectedIds,
      hoverId: sample.hoverId,
      pointer: sample.pointer,
      rectFor,
      mode,
    });
    const applyTarget = planToApplyMoveTarget(plan);
    const planNodeIds = collectPlanNodeIds(tree, plan);
    const frame: MoveReplayFrame = {
      index: i,
      isFinalSample: i === samples.length - 1,
      pointer: sample.pointer,
      hoverId: sample.hoverId,
      hoverUsedFallback: sample.hoverUsedFallback === true,
      effectiveSelectedIds,
      plan,
      planDescription: describeMovePlan(plan),
      applyTarget,
      selectedNodes: effectiveSelectedIds
        .map((id) => dereferenceNode(tree, id))
        .filter((x): x is MoveNodeRef => !!x),
      hoverNode: sample.hoverId ? dereferenceNode(tree, sample.hoverId) : null,
      applyTargetNode: applyTarget
        ? dereferenceNode(tree, applyTarget.hoverId)
        : null,
      planNodeIds,
      planNodes: planNodeIds
        .map((id) => dereferenceNode(tree, id))
        .filter((x): x is MoveNodeRef => !!x),
    };
    frames.push(frame);

    finalPlan = plan;
    finalTarget = applyTarget;
    finalFrame = frame;
  }

  return { frames, finalFrame, finalPlan, finalTarget };
}

export function replayFinalMoveSample(args: {
  tree: ExpressionTree;
  mode: MoveMode;
  selectedIds: string[];
  rects: RectSnapshot;
  samples: MoveTraceSample[];
}): MoveReplayResult {
  const { samples } = args;
  if (samples.length === 0) {
    return { frames: [], finalFrame: null, finalPlan: null, finalTarget: null };
  }
  const capture = replayMoveCapture({
    ...args,
    sampleIndices: [samples.length - 1],
  });
  return capture;
}

export function applyReplayResult(args: {
  tree: ExpressionTree;
  mode: MoveMode;
  selectedIds: string[];
  replay: MoveReplayResult;
}): ExpressionTree | null {
  const { tree, mode, selectedIds, replay } = args;
  const target = replay.finalTarget;
  if (!target) return null;
  return applyMove({
    tree,
    selectedIds,
    hoverId: target.hoverId,
    targetSlot: target.targetSlot,
    mode,
  });
}

function dereferenceNode(
  tree: ExpressionTree,
  nodeId: string,
): MoveNodeRef | null {
  const node = tree.nodesById[nodeId];
  if (!node) return null;
  const parentId = tree.parentById[nodeId] ?? null;
  const childIds = tree.childrenById[nodeId] ?? [];
  return {
    id: node.id,
    op: node.op,
    latex: node.latex,
    parentId,
    parentOp: parentId ? (tree.nodesById[parentId]?.op ?? null) : null,
    childIds,
    childOps: childIds.map((id) => tree.nodesById[id]?.op ?? "?"),
    childLatex: childIds.map((id) => tree.nodesById[id]?.latex ?? "?"),
  };
}

function collectPlanNodeIds(
  tree: ExpressionTree,
  plan: MovePlan | null,
): string[] {
  if (!plan) return [];
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      if (tree.nodesById[value]) ids.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>))
        walk(item);
    }
  };
  walk(plan);
  return Array.from(ids);
}
