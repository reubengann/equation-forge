import { useState, useRef, useCallback } from "react";
import type { ExpressionTree } from "../ExpressionTree";
import type { MoveMode } from "../moveExpression/applyMove";
import type { MovePlan } from "../planMove";
import { planMove } from "../planMove";
import { applyMove } from "../moveExpression/applyMove";
import {
  createRectProvider,
  planToApplyMoveTarget,
  describeMovePlan,
  renderInsertOverlay,
} from "../helpers/dragHelpers";
import {
  hitTestNodeIdInMathliveShadow,
  remapEqualHoverToSide,
} from "../mathliveShadow";

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

  const collapseMultiplicativeSelection = useCallback(
    (ids: string[]): string[] => {
      if (!tree) return ids;
      // Early return for single ID - let the additive mode logic handle it below
      if (ids.length <= 1) {
        const id = ids[0];
        const parentId = id ? tree.parentById[id] : null;
        const parentOp = parentId ? tree.nodesById[parentId]?.op : null;

        if (
          moveMode === "multiplicative" &&
          parentId &&
          (parentOp === "InvisibleOperator" || parentOp === "Multiply")
        ) {
          const productParentId = tree.parentById[parentId];
          const productParentOp = productParentId
            ? tree.nodesById[productParentId]?.op
            : null;
          const parentIndex =
            productParentId != null ? tree.childIndexById[parentId] : null;
          const inDenominator =
            productParentOp === "Divide" && parentIndex === 1;
          const siblings = tree.childrenById[parentId] ?? [];
          const parentHasVector = siblings.some((sibId) => {
            const info = tree.nodesById[sibId];
            return (
              info?.op === "OverVector" || (info?.latex ?? "").includes("\\vec")
            );
          });

          // Promote scalar-only product that is a direct child of Equal so the whole
          // product moves together across '='. Keep vectors intact by not promoting.
          if (
            !parentHasVector &&
            (productParentOp === "Equal" || inDenominator)
          ) {
            return [parentId];
          }
        }

        // Only apply single-ID promotion in additive mode for products that are direct children of Equal
        if (moveMode === "additive" && ids.length === 1) {
          if (parentId) {
            if (parentOp === "InvisibleOperator" || parentOp === "Multiply") {
              const productParentId = tree.parentById[parentId];
              if (productParentId) {
                const productParentOp = tree.nodesById[productParentId]?.op;
                if (productParentOp === "Equal") {
                  // The product is a direct child of Equal, so use the product container
                  return [parentId];
                }
              }
            }
          }
        }
        return ids;
      }

      // Multiplicative mode: collapse if all selected share a product parent
      if (moveMode === "multiplicative") {
        const parents = ids.map((id) => tree.parentById[id]).filter(Boolean);
        const uniqueParents = Array.from(new Set(parents));
        if (uniqueParents.length === 1) {
          const parentId = uniqueParents[0]!;
          const pop = tree.nodesById[parentId]?.op;
          if (pop === "InvisibleOperator" || pop === "Multiply") {
            return [parentId];
          }
        }
        return ids;
      }

      // Additive mode: if factors from the same product are selected, collapse to the product container
      // Only collapse if the product is a direct child of Equal (like "m a" in "x^2 + v_x = m a")
      if (moveMode === "additive") {
        // Check if all selected IDs share the same multiplicative parent
        const parents = ids.map((id) => tree.parentById[id]).filter(Boolean);
        const uniqueParents = Array.from(new Set(parents));
        if (uniqueParents.length === 1) {
          const parentId = uniqueParents[0]!;
          const parentOp = tree.nodesById[parentId]?.op;
          if (parentOp === "InvisibleOperator" || parentOp === "Multiply") {
            // Check if all selected IDs are children of this parent
            const parentChildren = tree.childrenById[parentId] ?? [];
            const allSelectedAreChildren = ids.every((id) =>
              parentChildren.includes(id)
            );
            if (allSelectedAreChildren) {
              // Only collapse if the product is a direct child of Equal
              const productParentId = tree.parentById[parentId];
              if (productParentId) {
                const productParentOp = tree.nodesById[productParentId]?.op;
                if (productParentOp === "Equal") {
                  // All selected are factors of the same product that's a direct child of Equal,
                  // so use the product container
                  return [parentId];
                }
              }
            }
          }
        }
      }

      return ids;
    },
    [tree, moveMode]
  );

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

      let effectiveSelectedIds = collapseMultiplicativeSelection(
        drag.selectedIds
      );

      // For multiplicative mode, avoid promoting a single factor to its product
      // container when the hover target is inside that same product (i.e., a
      // pure reordering intent). Cross-equal moves keep the promotion so the
      // entire product moves together.
      if (
        moveMode === "multiplicative" &&
        drag.selectedIds.length === 1 &&
        tree
      ) {
        const originalId = drag.selectedIds[0];
        const parentId = tree.parentById[originalId];
        const parentOp = parentId ? tree.nodesById[parentId]?.op : null;
        const isMulParent =
          parentOp === "InvisibleOperator" || parentOp === "Multiply";

        if (hover && parentId && isMulParent) {
          let cur: string | null = hover;
          let hoverInSameProduct = false;
          while (cur) {
            if (cur === parentId) {
              hoverInSameProduct = true;
              break;
            }
            cur = tree.parentById[cur] ?? null;
          }
          if (hoverInSameProduct) {
            effectiveSelectedIds = [originalId];
          }
        }
      }

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
    [
      drag,
      tree,
      measureEl,
      displayEl,
      insertOverlayEl,
      moveMode,
      collapseMultiplicativeSelection,
      rectFor,
    ]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent): boolean => {
      if (!drag) return false;
      if (e.pointerId !== drag.pointerId) return false;

      const plan = lastPlanRef.current;
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
        let effectiveSelectedIds = collapseMultiplicativeSelection(
          drag.selectedIds
        );

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

      renderInsertOverlay(null, insertOverlayEl, displayEl, rectFor, tree);
      setDrag(null);
      lastPlanRef.current = null;
      return false;
    },
    [
      drag,
      tree,
      moveMode,
      collapseMultiplicativeSelection,
      onMoveComplete,
      insertOverlayEl,
      displayEl,
      rectFor,
    ]
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
