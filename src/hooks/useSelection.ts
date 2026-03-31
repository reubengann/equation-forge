import { useState, useRef, useCallback } from "react";
import type { ExpressionTree } from "../ExpressionTree";
import type { ExprSelection } from "../selectionSemantics";
import {
  normalizeSelection,
  promoteSelection,
  expandSelection,
} from "../selectionSemantics";
import type { MoveMode } from "../moveExpression/applyMove";
import { normalizeSelectedIdsForMove } from "../domain/move/moveSelectionPolicy";
function getNodeIdsFromComposedPath(path: unknown[]): string[] {
  const ids: string[] = [];
  for (const p of path) {
    if (!(p instanceof HTMLElement)) continue;
    const id = p.dataset?.nodeId;
    if (id) ids.push(id);
  }
  return ids;
}

export type ClickState = {
  nodeId: string | null;
  ts: number;
  count: number;
};

export function useSelection(tree: ExpressionTree | null, moveMode: MoveMode) {
  const [selection, setSelection] = useState<ExprSelection | null>(null);
  const lastClickRef = useRef<ClickState>({ nodeId: null, ts: 0, count: 0 });

  const selectionContainsId = useCallback(
    (sel: ExprSelection, id: string, tree: ExpressionTree): boolean => {
      if (sel.kind === "multi") return sel.nodeIds.includes(id);
      if (sel.kind === "node") return sel.nodeId === id;
      const idx = tree.childIndexById[id];
      return (
        idx != null &&
        idx >= sel.start &&
        idx <= sel.end &&
        tree.parentById[id] === sel.parentId
      );
    },
    []
  );

  const handleClick = useCallback(
    (
      clickedId: string,
      shiftKey: boolean,
      modKey: boolean,
      existingSelection: ExprSelection | null
    ): {
      promotedId: string;
      clickCount: number;
      shouldUsePromotedId: boolean;
      reuseExistingSelection: boolean;
      dragIds: string[];
      newSelection: ExprSelection | null;
      useExistingSpan: boolean;
      multiplicativeSpan: ExprSelection | null;
    } => {
      if (!tree) {
        return {
          promotedId: clickedId,
          clickCount: 1,
          shouldUsePromotedId: false,
          reuseExistingSelection: false,
          dragIds: [clickedId],
          newSelection: null,
          useExistingSpan: false,
          multiplicativeSpan: null,
        };
      }

      const normalizedId = normalizeSelection(tree, clickedId);

      // Ctrl/Cmd multi-select toggle
      if (modKey) {
        const ids: string[] = [];
        if (existingSelection?.kind === "node") {
          ids.push(existingSelection.nodeId);
        } else if (existingSelection?.kind === "multi") {
          ids.push(...existingSelection.nodeIds);
        }

        const idx = ids.indexOf(normalizedId);
        if (idx >= 0) ids.splice(idx, 1);
        else ids.push(normalizedId);

        let newSelection: ExprSelection | null = null;
        if (ids.length === 1) newSelection = { kind: "node", nodeId: ids[0] };
        else if (ids.length >= 2) newSelection = { kind: "multi", nodeIds: ids };

        lastClickRef.current = {
          nodeId: normalizedId,
          ts: performance.now(),
          count: 1,
        };

        return {
          promotedId: normalizedId,
          clickCount: 1,
          shouldUsePromotedId: false,
          reuseExistingSelection: false,
          dragIds: ids.length ? [ids[0]] : [],
          newSelection,
          useExistingSpan: false,
          multiplicativeSpan: null,
        };
      }

      // Multi-click promotion
      const now = performance.now();
      const last = lastClickRef.current;
      const reuseExisting =
        existingSelection &&
        selectionContainsId(existingSelection, normalizedId, tree);

      const withinWindow = last.nodeId === normalizedId && now - last.ts < 600;
      const clickCount = withinWindow ? last.count + 1 : 1;
      lastClickRef.current = {
        nodeId: normalizedId,
        ts: now,
        count: clickCount,
      };

      let promotedId: string;
      if (clickCount > 1) {
        promotedId = promoteSelection(tree, normalizedId, clickCount - 1);
      } else {
        promotedId = normalizedId;
      }

      const hasPromoted = promotedId !== normalizedId;
      const existingSelectionNodeId =
        existingSelection?.kind === "node" ? existingSelection.nodeId : null;
      const shouldUsePromotedId =
        hasPromoted && existingSelectionNodeId !== promotedId;

      // Determine drag IDs
      let dragIds: string[];
      if (reuseExisting && !shouldUsePromotedId) {
        if (existingSelection?.kind === "span") {
          const selectionParentOp =
            tree.nodesById[existingSelection.parentId]?.op;
          if (
            selectionParentOp === "InvisibleOperator" ||
            selectionParentOp === "Multiply"
          ) {
            dragIds = (
              tree.childrenById[existingSelection.parentId] ?? []
            ).slice(existingSelection.start, existingSelection.end + 1);
          } else {
            dragIds = [promotedId];
          }
        } else if (existingSelection?.kind === "node") {
          dragIds = [existingSelection.nodeId];
        } else if (existingSelection?.kind === "multi") {
          dragIds = [...existingSelection.nodeIds];
        } else {
          dragIds = [promotedId];
        }
      } else {
        dragIds = [promotedId];
      }

      const existingSel = existingSelection;
      let useExistingSpan = false;
      if (existingSel?.kind === "span" && !shouldUsePromotedId) {
        const existingParentOp = tree.nodesById[existingSel.parentId]?.op;
        if (
          existingParentOp === "InvisibleOperator" ||
          existingParentOp === "Multiply"
        ) {
          const kids = tree.childrenById[existingSel.parentId] ?? [];
          const clickedIdx = tree.childIndexById[promotedId];
          if (
            clickedIdx != null &&
            clickedIdx >= existingSel.start &&
            clickedIdx <= existingSel.end &&
            tree.parentById[promotedId] === existingSel.parentId
          ) {
            dragIds = kids.slice(existingSel.start, existingSel.end + 1);
            useExistingSpan = true;
          }
        }
      }

      // Multiplicative span selection
      const promotedOp = tree.nodesById[promotedId]?.op;
      const isMulContainer =
        promotedOp === "InvisibleOperator" || promotedOp === "Multiply";
      let multiplicativeSpan: ExprSelection | null = null;
      if (
        !useExistingSpan &&
        isMulContainer &&
        tree.childrenById[promotedId]?.length &&
        shouldUsePromotedId
      ) {
        const kids = tree.childrenById[promotedId] ?? [];
        dragIds = [promotedId];
        multiplicativeSpan = {
          kind: "span",
          parentId: promotedId,
          op: promotedOp as "InvisibleOperator" | "Add",
          start: 0,
          end: kids.length - 1,
        };
      }

      // SHIFT+click → range selection
      let newSelection: ExprSelection | null = null;
      if (
        shiftKey &&
        existingSelection &&
        tree &&
        existingSelection.kind !== "multi"
      ) {
        const targetParentId = tree.parentById[promotedId];
        const targetIdx = tree.childIndexById[promotedId];

        const anchorParentId =
          existingSelection.kind === "node"
            ? tree.parentById[existingSelection.nodeId]
            : existingSelection.parentId;
        const anchorIdx =
          existingSelection.kind === "node"
            ? tree.childIndexById[existingSelection.nodeId]
            : existingSelection.start;

        const parentOp = targetParentId
          ? tree.nodesById[targetParentId]?.op
          : undefined;
        const additive = parentOp === "Add" || parentOp === "InvisibleOperator";
        const sameParent =
          targetParentId && anchorParentId && targetParentId === anchorParentId;
        const valid =
          sameParent && targetIdx != null && anchorIdx != null && additive;

        if (valid) {
          const start = Math.min(anchorIdx!, targetIdx!);
          const end = Math.max(anchorIdx!, targetIdx!);
          newSelection = {
            kind: "span",
            parentId: targetParentId!,
            start,
            end,
            op: parentOp!,
          };
        }
      }

      // Determine final selection
      if (!newSelection) {
        if (useExistingSpan && existingSel?.kind === "span") {
          newSelection = existingSel;
        } else if (multiplicativeSpan) {
          newSelection = multiplicativeSpan;
        } else {
          newSelection = { kind: "node", nodeId: promotedId };
        }
      }

      return {
        promotedId,
        clickCount,
        shouldUsePromotedId,
        reuseExistingSelection: !!reuseExisting && !shouldUsePromotedId,
        dragIds: normalizeSelectedIdsForMove({
          tree,
          selectedIds: dragIds,
          mode: moveMode,
          hoverId: null,
          disableEqualPromotion: moveMode === "multiplicative",
        }),
        newSelection,
        useExistingSpan,
        multiplicativeSpan,
      };
    },
    [tree, selectionContainsId, moveMode]
  );

  const expand = useCallback(
    (dir: "left" | "right"): ExprSelection | null => {
      if (!tree || !selection) return null;
      const r = expandSelection(tree, selection, dir);
      if (!r) return null;
      return r.next;
    },
    [tree, selection]
  );

  const clear = useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  return {
    selection,
    setSelection,
    handleClick,
    expand,
    clear,
    lastClickRef,
  };
}

// Export helper for getting node IDs from pointer events
export function getNodeIdsFromPointerEvent(e: React.PointerEvent): string[] {
  const ne = e.nativeEvent as PointerEvent;
  const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
  return getNodeIdsFromComposedPath(path);
}
