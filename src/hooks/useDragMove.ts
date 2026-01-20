import { useState, useRef, useCallback } from "react";
import type { ExpressionTree } from "../ExpressionTree";
import type { MoveMode } from "../moveExpression/applyMove";
import type { MovePlan } from "../planMove";
import { planMove } from "../planMove";
import { applyMove } from "../moveExpression/applyMove";
import { createRectProvider } from "../infra/mathlive/rectProvider";
import {
  planToApplyMoveTarget,
  describeMovePlan,
} from "../domain/move/movePlanAdapters";
import { renderInsertOverlay } from "../ui/drag/renderInsertOverlay";
import {
  hitTestNodeIdInMathliveShadow,
  remapEqualHoverToSide,
} from "../infra/mathlive/mathliveShadow";
import { normalizeSelectedIdsForMove } from "../domain/move/moveSelectionPolicy";

export type DragState = null | {
  pointerId: number;
  selectedIds: string[];
};

export function useDragMove(
  tree: ExpressionTree | null,
  moveMode: MoveMode,
  measureEl: HTMLElement | null,
  displayEl: HTMLElement | null,
  insertOverlayEl: HTMLDivElement | null,
  onMoveComplete: (newTree: ExpressionTree, latex: string) => void
) {
  const [drag, setDrag] = useState<DragState>(null);
  const lastPlanRef = useRef<MovePlan | null>(null);

  const rectFor = createRectProvider(measureEl, tree);

  const startDrag = useCallback((pointerId: number, selectedIds: string[]) => {
    setDrag({ pointerId, selectedIds });
    lastPlanRef.current = null;
  }, []);

  const handlePointerMove = useCallback(
    (
      e: React.PointerEvent
    ): {
      plan: MovePlan | null;
      planDescription: string;
      infoArgs: string;
      hoverId: string | null;
    } => {
      if (!drag) {
        return { plan: null, planDescription: "", infoArgs: "", hoverId: null };
      }

      if (e.pointerId !== drag.pointerId) {
        return { plan: null, planDescription: "", infoArgs: "", hoverId: null };
      }
      if (!tree || !measureEl) {
        return { plan: null, planDescription: "", infoArgs: "", hoverId: null };
      }

      const hoverId = hitTestNodeIdInMathliveShadow(
        measureEl,
        e.clientX,
        e.clientY
      );

      const hover =
        hoverId && tree.nodesById[hoverId]?.op === "Equal"
          ? remapEqualHoverToSide(tree, measureEl, hoverId, e.clientX)
          : hoverId;

      const effectiveSelectedIds = normalizeSelectedIdsForMove({
        tree,
        selectedIds: drag.selectedIds,
        mode: moveMode,
        hoverId: hover,
      });

      const plan = planMove({
        tree,
        selectedIds: effectiveSelectedIds,
        hoverId: hover,
        pointer: { x: e.clientX, y: e.clientY },
        rectFor,
        mode: moveMode,
      });

      lastPlanRef.current = plan;

      const planDescription = describeMovePlan(plan);
      const infoArgs = JSON.stringify(
        {
          selectedIds: effectiveSelectedIds,
          hoverId: hover,
          pointer: { x: e.clientX, y: e.clientY },
          mode: moveMode,
        },
        null,
        2
      );

      // Render overlay
      renderInsertOverlay(plan, insertOverlayEl, displayEl, rectFor, tree);

      return { plan, planDescription, infoArgs, hoverId: hover };
    },
    [drag, tree, measureEl, displayEl, insertOverlayEl, moveMode, rectFor]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent): boolean => {
      if (!drag) return false;
      if (e.pointerId !== drag.pointerId) return false;

      let plan = lastPlanRef.current;

      // If we somehow missed a pointer-move update, recompute a plan at pointer-up.
      if (!plan && tree && measureEl) {
        const hitId = hitTestNodeIdInMathliveShadow(
          measureEl,
          e.clientX,
          e.clientY
        );
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
        if (next) {
          onMoveComplete(next, next.latexPlain);
          renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
          setDrag(null);
          lastPlanRef.current = null;
          return true;
        }
      }

      // Fallback: if the multiplicative cross-equal executor rejected (e.g. due to
      // an over-normalized selection), retry with the raw plan ids even if the
      // computed moveTarget is missing.
      if (tree && plan && plan.kind === "MoveAcrossEqual" && moveMode === "multiplicative") {
        const fallbackHover =
          plan.drop.kind === "intoAdd" ? plan.drop.addId : plan.drop.replaceId;
        const fallbackSlot =
          plan.drop.kind === "intoAdd"
            ? plan.drop.toIndex
            : plan.drop.kind === "ontoSideRoot"
            ? plan.drop.insertIndex
            : null;

        const retry = applyMove({
          tree,
          selectedIds: [plan.movedId],
          hoverId: fallbackHover,
          targetSlot: fallbackSlot,
          mode: "multiplicative",
        });

        if (retry) {
          onMoveComplete(retry, retry.latexPlain);
          renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
          setDrag(null);
          lastPlanRef.current = null;
          return true;
        }
      }

      renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
      setDrag(null);
      lastPlanRef.current = null;
      return false;
    },
    [drag, tree, moveMode, onMoveComplete, insertOverlayEl, displayEl, rectFor]
  );

  const cancelDrag = useCallback(() => {
    renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
    setDrag(null);
    lastPlanRef.current = null;
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
