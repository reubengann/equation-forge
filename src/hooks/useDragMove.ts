import { useState, useRef, useCallback } from "react";
import type { ExpressionTree } from "../ExpressionTree";
import type { MoveMode } from "../moveExpression/applyMove";
import type { MovePlan } from "../planMove";
import { planMove } from "../planMove";
import { applyMove } from "../moveExpression/applyMove";
import {
  createRectProvider,
  snapshotRectsForTree,
} from "../infra/mathlive/rectProvider";
import {
  planToApplyMoveTarget,
  describeMovePlan,
} from "../domain/move/movePlanAdapters";
import { renderInsertOverlay } from "../ui/drag/renderInsertOverlay";
import {
  hitTestOrClosestNodeIdInMathliveShadow,
  remapEqualHoverToSide,
} from "../infra/mathlive/mathliveShadow";
import { normalizeSelectedIdsForMove } from "../domain/move/moveSelectionPolicy";

export type DragState = null | {
  pointerId: number;
  selectedIds: string[];
  startPointer: { x: number; y: number };
};

export type DragUpResult = {
  moved: boolean;
  dragged: boolean;
};

export type MoveDragCaptureHooks = {
  onDragStart?: (payload: {
    pointerId: number;
    selectedIds: string[];
    mode: MoveMode;
    rects: Record<string, { left: number; top: number; right: number; bottom: number }>;
  }) => void;
  onMoveSample?: (payload: {
    pointer: { x: number; y: number };
    selectedIds: string[];
    hoverId: string | null;
    hoverUsedFallback: boolean;
    mode: MoveMode;
    plan: MovePlan | null;
    infoArgs: string;
  }) => void;
  onDragEnd?: (payload: {
    pointer: { x: number; y: number };
    mode: MoveMode;
    moved: boolean;
    plan: MovePlan | null;
  }) => void;
  onApplyAttempt?: (payload: {
    source: "primary" | "pullOutFallback" | "crossEqualFallback";
    selectedIds: string[];
    hoverId: string;
    targetSlot: number | null;
    mode: MoveMode;
    planKind: MovePlan["kind"] | null;
    succeeded: boolean;
  }) => void;
};

export function useDragMove(
  tree: ExpressionTree | null,
  moveMode: MoveMode,
  measureEl: HTMLElement | null,
  displayEl: HTMLElement | null,
  insertOverlayEl: HTMLDivElement | null,
  onMoveComplete: (newTree: ExpressionTree, latex: string) => void,
  captureHooks?: MoveDragCaptureHooks
) {
  const [drag, setDrag] = useState<DragState>(null);
  const lastPlanRef = useRef<MovePlan | null>(null);
  const maxDragDistanceRef = useRef(0);
  const DRAG_APPLY_THRESHOLD_PX = 4;

  const rectFor = createRectProvider(measureEl, tree);

  const startDrag = useCallback((
    pointerId: number,
    selectedIds: string[],
    startPointer: { x: number; y: number }
  ) => {
    setDrag({ pointerId, selectedIds, startPointer });
    lastPlanRef.current = null;
    maxDragDistanceRef.current = 0;
    captureHooks?.onDragStart?.({
      pointerId,
      selectedIds,
      mode: moveMode,
      rects: snapshotRectsForTree(measureEl, tree),
    });
  }, [captureHooks, moveMode, measureEl, tree]);

  const handlePointerMove = useCallback(
    (
      e: React.PointerEvent
    ): {
      plan: MovePlan | null;
      planDescription: string;
      infoArgs: string;
      hoverId: string | null;
      hoverUsedFallback: boolean;
    } => {
      if (!drag) {
        return {
          plan: null,
          planDescription: "",
          infoArgs: "",
          hoverId: null,
          hoverUsedFallback: false,
        };
      }

      if (e.pointerId !== drag.pointerId) {
        return {
          plan: null,
          planDescription: "",
          infoArgs: "",
          hoverId: null,
          hoverUsedFallback: false,
        };
      }
      if (!tree || !measureEl) {
        return {
          plan: null,
          planDescription: "",
          infoArgs: "",
          hoverId: null,
          hoverUsedFallback: false,
        };
      }

      const hoverHit = hitTestOrClosestNodeIdInMathliveShadow(
        measureEl,
        e.clientX,
        e.clientY,
        { maxDistance: 40 }
      );

      const hover =
        hoverHit.id && tree.nodesById[hoverHit.id]?.op === "Equal"
          ? remapEqualHoverToSide(tree, measureEl, hoverHit.id, e.clientX)
          : hoverHit.id;

      const effectiveSelectedIds = normalizeSelectedIdsForMove({
        tree,
        selectedIds: drag.selectedIds,
        mode: moveMode,
        hoverId: hover,
      });

      const dx = e.clientX - drag.startPointer.x;
      const dy = e.clientY - drag.startPointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDragDistanceRef.current) {
        maxDragDistanceRef.current = distance;
      }

      const plan = planMove({
        tree,
        selectedIds: effectiveSelectedIds,
        hoverId: hover,
        pointer: { x: e.clientX, y: e.clientY },
        rectFor,
        mode: moveMode,
      });

      // Keep the most recent actionable plan so a transient hover miss at release
      // (common near pad edges in multi-pad layout) does not drop a valid move.
      if (plan) {
        lastPlanRef.current = plan;
      }

      const planDescription = describeMovePlan(plan);
      const infoArgs = JSON.stringify(
        {
          selectedIds: effectiveSelectedIds,
          hoverId: hover,
          hoverUsedFallback: hoverHit.usedFallback,
          pointer: { x: e.clientX, y: e.clientY },
          mode: moveMode,
        },
        null,
        2
      );

      // Render overlay
      renderInsertOverlay(plan, insertOverlayEl, displayEl, rectFor, tree);
      captureHooks?.onMoveSample?.({
        pointer: { x: e.clientX, y: e.clientY },
        selectedIds: effectiveSelectedIds,
        hoverId: hover,
        hoverUsedFallback: hoverHit.usedFallback,
        mode: moveMode,
        plan,
        infoArgs,
      });

      return {
        plan,
        planDescription,
        infoArgs,
        hoverId: hover,
        hoverUsedFallback: hoverHit.usedFallback,
      };
    },
    [drag, tree, measureEl, displayEl, insertOverlayEl, moveMode, rectFor, captureHooks]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent): DragUpResult => {
      if (!drag) return { moved: false, dragged: false };
      if (e.pointerId !== drag.pointerId) return { moved: false, dragged: false };

      let plan = lastPlanRef.current;
      const draggedEnough = maxDragDistanceRef.current >= DRAG_APPLY_THRESHOLD_PX;

      if (!draggedEnough) {
        renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
        setDrag(null);
        lastPlanRef.current = null;
        maxDragDistanceRef.current = 0;
        captureHooks?.onDragEnd?.({
          pointer: { x: e.clientX, y: e.clientY },
          mode: moveMode,
          moved: false,
          plan,
        });
        return { moved: false, dragged: false };
      }

      // If we somehow missed a pointer-move update, recompute a plan at pointer-up.
      if (!plan && tree && measureEl) {
        const hit = hitTestOrClosestNodeIdInMathliveShadow(
          measureEl,
          e.clientX,
          e.clientY,
          { maxDistance: 40 }
        );
        const hitId = hit.id;
        const hover =
          hitId && tree.nodesById[hitId]?.op === "Equal"
            ? remapEqualHoverToSide(tree, measureEl, hitId, e.clientX)
            : hitId;

        const effectiveSelectedIds = normalizeSelectedIdsForMove({
          tree,
          selectedIds: drag.selectedIds,
          mode: moveMode,
          hoverId: hover,
        });

        plan = planMove({
          tree,
          selectedIds: effectiveSelectedIds,
          hoverId: hover,
          pointer: { x: e.clientX, y: e.clientY },
          rectFor,
          mode: moveMode,
        });

        lastPlanRef.current = plan;
      }

      const moveTarget = planToApplyMoveTarget(plan);

      // If the computed plan is additive-only (Reorder/Insert/Wrap into Add) AND
      // both source/target containers are actually Add nodes, allow additive fallback.
      // Otherwise, preserve the user-chosen moveMode (important for multiplicative moves).
      const planIsAdditiveKind =
        plan &&
        (plan.kind === "ReorderAdd" ||
          plan.kind === "InsertIntoAdd" ||
          plan.kind === "WrapIntoAddThenInsert");

      const containerIds: string[] = [];
      if (plan) {
        if (plan.kind === "ReorderAdd") containerIds.push(plan.addId);
        if (plan.kind === "InsertIntoAdd") {
          containerIds.push(plan.fromAddId, plan.toAddId);
        }
        if (plan.kind === "WrapIntoAddThenInsert") {
          containerIds.push(plan.replaceParentId, plan.fromAddId);
        }
        if (plan.kind === "MoveAcrossEqual" && plan.drop.kind === "intoAdd") {
          containerIds.push(plan.drop.addId);
        }
      }

      const containersAreAdd =
        planIsAdditiveKind &&
        containerIds.length > 0 &&
        containerIds.every((id) => tree?.nodesById[id]?.op === "Add");

      const selectionParentsAreAdd =
        planIsAdditiveKind &&
        drag.selectedIds.every((id) => {
          const pid = tree?.parentById[id];
          return pid ? tree?.nodesById[pid]?.op === "Add" : false;
        });

      const shouldFallbackToAdd =
        moveMode === "multiplicative" &&
        planIsAdditiveKind &&
        containersAreAdd &&
        selectionParentsAreAdd;

      const effectiveMode: MoveMode = shouldFallbackToAdd
        ? "additive"
        : moveMode;

      if (tree && plan && moveTarget) {
        let effectiveSelectedIds = normalizeSelectedIdsForMove({
          tree,
          selectedIds: drag.selectedIds,
          mode: moveMode,
          hoverId: moveTarget.hoverId,
        });

        // If the plan is a simple reorder/insert (additive-kind) while in
        // multiplicative mode, keep the original factor selection so we don't
        // promote to the whole product when reordering within it.
        const planIsAdditiveKind =
          plan.kind === "ReorderAdd" ||
          plan.kind === "InsertIntoAdd" ||
          plan.kind === "WrapIntoAddThenInsert";
        if (moveMode === "multiplicative" && planIsAdditiveKind) {
          effectiveSelectedIds = drag.selectedIds;
        }

        const next = applyMove({
          tree,
          selectedIds: effectiveSelectedIds,
          hoverId: moveTarget.hoverId,
          targetSlot: moveTarget.targetSlot,
          mode: effectiveMode,
        });
        captureHooks?.onApplyAttempt?.({
          source: "primary",
          selectedIds: effectiveSelectedIds,
          hoverId: moveTarget.hoverId,
          targetSlot: moveTarget.targetSlot,
          mode: effectiveMode,
          planKind: plan.kind,
          succeeded: !!next,
        });
        if (next) {
          onMoveComplete(next, next.latexPlain);
          renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
          setDrag(null);
          lastPlanRef.current = null;
          maxDragDistanceRef.current = 0;
          captureHooks?.onDragEnd?.({
            pointer: { x: e.clientX, y: e.clientY },
            mode: moveMode,
            moved: true,
            plan,
          });
          return { moved: true, dragged: true };
        }
      }

      // Fallback: if planner predicted a pull-out from fraction but execution
      // failed with normalized runtime selections, retry with plan-native ids.
      if (tree && plan?.kind === "PullOutOfFraction" && moveMode === "multiplicative") {
        const retry = applyMove({
          tree,
          selectedIds: [plan.movedId],
          hoverId: plan.divideId,
          targetSlot: plan.insertIndex,
          mode: "multiplicative",
        });
        captureHooks?.onApplyAttempt?.({
          source: "pullOutFallback",
          selectedIds: [plan.movedId],
          hoverId: plan.divideId,
          targetSlot: plan.insertIndex,
          mode: "multiplicative",
          planKind: plan.kind,
          succeeded: !!retry,
        });
        if (retry) {
          onMoveComplete(retry, retry.latexPlain);
          renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
          setDrag(null);
          lastPlanRef.current = null;
          maxDragDistanceRef.current = 0;
          captureHooks?.onDragEnd?.({
            pointer: { x: e.clientX, y: e.clientY },
            mode: moveMode,
            moved: true,
            plan,
          });
          return { moved: true, dragged: true };
        }
      }

      // Fallback: if the multiplicative cross-equal executor rejected (e.g. due to
      // an over-normalized selection), retry with the raw plan ids even if the
      // computed moveTarget is missing.
      if (tree && plan && plan.kind === "MoveAcrossEqual" && moveMode === "multiplicative") {
        const fallbackHover =
          plan.drop.kind === "intoAdd"
            ? plan.drop.addId
            : plan.drop.kind === "ontoSideFactor"
            ? plan.drop.factorId
            : plan.drop.replaceId;
        const fallbackSlot =
          plan.drop.kind === "intoAdd"
            ? plan.drop.toIndex
            : plan.drop.kind === "ontoSideRoot"
            ? plan.drop.insertIndex
            : plan.drop.kind === "ontoSideFactor"
            ? plan.drop.insertIndex
            : null;

        const retry = applyMove({
          tree,
          selectedIds: [plan.movedId],
          hoverId: fallbackHover,
          targetSlot: fallbackSlot,
          mode: "multiplicative",
        });
        captureHooks?.onApplyAttempt?.({
          source: "crossEqualFallback",
          selectedIds: [plan.movedId],
          hoverId: fallbackHover,
          targetSlot: fallbackSlot,
          mode: "multiplicative",
          planKind: plan.kind,
          succeeded: !!retry,
        });

        if (retry) {
          onMoveComplete(retry, retry.latexPlain);
          renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
          setDrag(null);
          lastPlanRef.current = null;
          maxDragDistanceRef.current = 0;
          captureHooks?.onDragEnd?.({
            pointer: { x: e.clientX, y: e.clientY },
            mode: moveMode,
            moved: true,
            plan,
          });
          return { moved: true, dragged: true };
        }
      }

      renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
      setDrag(null);
      lastPlanRef.current = null;
      maxDragDistanceRef.current = 0;
      captureHooks?.onDragEnd?.({
        pointer: { x: e.clientX, y: e.clientY },
        mode: moveMode,
        moved: false,
        plan,
      });
      return { moved: false, dragged: true };
    },
    [
      drag,
      tree,
      moveMode,
      onMoveComplete,
      insertOverlayEl,
      displayEl,
      rectFor,
      captureHooks,
    ]
  );

  const cancelDrag = useCallback(() => {
    renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
    setDrag(null);
    lastPlanRef.current = null;
    maxDragDistanceRef.current = 0;
  }, [insertOverlayEl, displayEl, rectFor, tree]);

  return {
    drag,
    startDrag,
    handlePointerMove,
    handlePointerUp,
    cancelDrag,
    lastPlanRef,
  };
}
