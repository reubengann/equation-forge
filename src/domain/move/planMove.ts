import type { ExpressionTree } from "../../ExpressionTree";
import type { MoveMode } from "../../moveExpression/applyMove";
import { isStructurallyValidMove } from "../../movePath";
import { normalizeSelection } from "../../selectionSemantics";
import {
  computeSlotByMidpoints,
  containsPoint,
  determineMultiplicativeDropKind,
  midX,
  yGate,
  type RectProvider,
} from "./planMoveGeometry";
import { isAncestorOrSelf, resolveHoverTarget } from "./planMoveHoverTarget";
import {
  hasVectorAncestor,
  normalizeSelectedIdsForMove,
} from "./moveSelectionPolicy";

export type MovePlan =
  | {
      kind: "ReorderAdd";
      addId: string;
      movedId: string;
      fromIndex: number;
      toIndex: number; // destination index in FINAL children array (length unchanged)
    }
  | {
      kind: "InsertIntoAdd";
      fromAddId: string;
      toAddId: string;
      movedId: string;
      fromIndex: number;
      toIndex: number; // insertion index in FINAL target children array (0..m)
    }
  | {
      kind: "WrapIntoAddThenInsert";
      movedId: string;
      fromAddId: string;
      fromIndex: number;

      // We will replace replaceId with Add(replaceId, movedId) or Add(movedId, replaceId)
      replaceId: string;

      // Where replaceId lives (e.g. Equal’s RHS)
      replaceParentId: string;
      replaceSlot: number; // typically 0 or 1 for Equal

      // 0 => moved before existing, 1 => moved after existing
      insertIndex: 0 | 1;
    }
  | {
      kind: "MergeIntoFractionNumerator";
      fromMulId: string;
      divideId: string;
      movedId: string;
    }
  | {
      kind: "MoveAcrossEqual";
      movedId: string;

      equalId: string;
      fromSide: 0 | 1; // 0=LHS, 1=RHS
      toSide: 0 | 1;

      // Where on the destination side the user dropped:
      // Either into an Add container (slot/index), or onto a non-Add side root.
      drop:
        | { kind: "intoAdd"; addId: string; toIndex: number }
        | {
            kind: "ontoSideRoot";
            replaceId: string;
            replaceParentId: string; // should be equalId
            replaceSlot: 0 | 1; // should match toSide
            insertIndex: 0 | 1; // before/after the root expression
          }
        | {
            kind: "ontoSideRootWhole";
            replaceId: string;
            replaceParentId: string; // should be equalId
            replaceSlot: 0 | 1; // should match toSide
          };
    };

export interface PlanMoveArgs {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string | null;
  pointer: { x: number; y: number };
  rectFor: RectProvider;
  mode?: MoveMode;
}

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; sideRootId: string; sideSlot: 0 | 1 } | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return null;
    if (tree.nodesById[parentId]?.op === "Equal") {
      const kids = tree.childrenById[parentId] ?? [];
      if (kids.length >= 2) {
        const lhsId = kids[0];
        const rhsId = kids[1];
        if (cur === lhsId)
          return { equalId: parentId, sideRootId: lhsId, sideSlot: 0 };
        if (cur === rhsId)
          return { equalId: parentId, sideRootId: rhsId, sideSlot: 1 };
      }
      return null;
    }
    cur = parentId;
  }
  return null;
}

export function planMove(args: PlanMoveArgs): MovePlan | null {
  const {
    tree,
    selectedIds,
    hoverId,
    pointer,
    rectFor,
    mode = "additive",
  } = args;

  const isMulOp = (op?: string) =>
    op === "InvisibleOperator" || op === "Multiply";
  const isContainerOp = (op?: string) =>
    mode === "multiplicative" ? isMulOp(op) : op === "Add";

  if (!hoverId) return null;

  const normalizedSelectedIds = normalizeSelectedIdsForMove({
    tree,
    selectedIds,
    mode,
    hoverId,
  });

  if (normalizedSelectedIds.length < 1) return null;

  const movedRawId = normalizedSelectedIds[0];
  let movedId = normalizeSelection(tree, movedRawId);
  const movedIsVector =
    hasVectorAncestor(tree, movedId) || hasVectorAncestor(tree, movedRawId);

  let movedParentId = tree.parentById[movedId];
  if (!movedParentId) return null;

  // Multiplicative: merge a sibling factor into the numerator of a fraction within the same product.
  if (mode === "multiplicative" && movedParentId) {
    const parentOp = tree.nodesById[movedParentId]?.op;
    if (isMulOp(parentOp)) {
      const divideId = (() => {
        let current: string | null = hoverId;
        while (current) {
          const parentId: string | null | undefined = tree.parentById[current];
          if (!parentId) return null;
          if (tree.nodesById[parentId]?.op === "Divide") return parentId;
          current = parentId;
        }
        return null;
      })();
      const divideParentId = divideId ? tree.parentById[divideId] : null;
      if (
        divideId &&
        divideParentId === movedParentId &&
        divideId !== movedId
      ) {
        const numeratorId = tree.childrenById[divideId]?.[0];
        const numeratorRect = numeratorId ? rectFor(numeratorId) : null;
        const NUMERATOR_PAD = 6;
        const inNumerator =
          numeratorRect != null &&
          containsPoint(
            numeratorRect,
            pointer.x,
            pointer.y,
            NUMERATOR_PAD
          );
        if (inNumerator) {
          return {
            kind: "MergeIntoFractionNumerator",
            fromMulId: movedParentId,
            divideId,
            movedId,
          };
        }
      }
    }
  }

  // Multiplicative cross-equal: if source and hover are on opposite sides of the same Equal, synthesize a plan immediately.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide = hoverId ? findEqualSideRoot(tree, hoverId) : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop,
      };
    }
  }

  const movedParent = tree.nodesById[movedParentId];
  const isDirectEqualChild = movedParent?.op === "Equal";

  if (isDirectEqualChild) {
    const equalId = movedParentId;
    const eqKids = tree.childrenById[equalId] ?? [];
    const lhsId = eqKids[0];
    const rhsId = eqKids[1];
    if (!lhsId || !rhsId) return null;

    // moved must be exactly lhs or rhs child
    let fromSide: 0 | 1 | null = null;
    if (movedId === lhsId) fromSide = 0;
    else if (movedId === rhsId) fromSide = 1;
    else return null;

    const target = resolveHoverTarget({
      tree,
      hoverId,
      pointer,
      rectFor,
      isContainerOp,
    });
    if (!target) return null;

    // Determine which side the drop is on
    let toSide: 0 | 1 | null = null;
    if (target.kind === "add") {
      if (target.addId === lhsId) toSide = 0;
      else if (target.addId === rhsId) toSide = 1;
      else {
        // If it's some other Add (e.g. nested), find which side it belongs to by ancestry
        const side = isAncestorOrSelf(tree, lhsId, target.addId)
          ? 0
          : isAncestorOrSelf(tree, rhsId, target.addId)
          ? 1
          : null;
        toSide = side;
      }
    } else {
      // replace target already carries which Equal slot it refers to
      toSide = target.replaceSlot as 0 | 1;
    }

    if (toSide == null) return null;
    if (toSide === fromSide) return null; // not a cross-equal intent

    // Now compute "drop" details on the destination side
    if (target.kind === "add") {
      const addId = target.addId;

      const addRect = rectFor(addId);
      if (!addRect) return null;
      if (!yGate(addRect, pointer.y)) return null;

      const kids = tree.childrenById[addId] ?? [];
      if (kids.length < 2) return null;

      const slot = computeSlotByMidpoints({
        childIds: kids,
        pointerX: pointer.x,
        rectFor,
      });

      // NOTE: for cross-equal, no "remove shift" needed because removal happens on the other side
      const toIndex = Math.max(0, Math.min(kids.length, slot));

      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId,
        fromSide,
        toSide,
        drop: { kind: "intoAdd", addId, toIndex },
      };
    } else {
      const { replaceId, replaceParentId, replaceSlot } = target;

      // Make sure we're really targeting the destination side root
      if (replaceParentId !== equalId) return null;
      if ((replaceSlot as 0 | 1) !== toSide) return null;

      // Confidence gate (same pattern as WrapIntoAddThenInsert)
      const replaceRect = rectFor(replaceId);
      const parentRect = rectFor(replaceParentId);
      const PAD_LOCAL = 6;

      const replaceContains =
        replaceRect != null &&
        containsPoint(replaceRect, pointer.x, pointer.y, PAD_LOCAL);
      const parentContains =
        parentRect != null &&
        containsPoint(parentRect, pointer.x, pointer.y, PAD_LOCAL);

      if (!replaceContains && !parentContains) return null;

      // For multiplicative mode, use hit-zone logic
      if (mode === "multiplicative") {
        const drop = determineMultiplicativeDropKind({
          sideRootId: replaceId,
          pointer,
          rectFor,
          equalId,
          toSide,
        });
        if (!drop) {
          // Fallback when rects are missing
          let insertIndex: 0 | 1 = 1;
          if (replaceRect) insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;
          return {
            kind: "MoveAcrossEqual",
            movedId,
            equalId,
            fromSide,
            toSide,
            drop: {
              kind: "ontoSideRoot",
              replaceId,
              replaceParentId,
              replaceSlot: replaceSlot as 0 | 1,
              insertIndex,
            },
          };
        }
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId,
          fromSide,
          toSide,
          drop,
        };
      }

      // Additive mode: use existing logic
      let insertIndex: 0 | 1 = 1;
      if (replaceRect) insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;

      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId,
        fromSide,
        toSide,
        drop: {
          kind: "ontoSideRoot",
          replaceId,
          replaceParentId,
          replaceSlot: replaceSlot as 0 | 1,
          insertIndex,
        },
      };
    }
  }

  const fromAddId = tree.parentById[movedId];
  if (!fromAddId) return null;

  const fromAddNode = tree.nodesById[fromAddId];
  if (!fromAddNode || !isContainerOp(fromAddNode.op)) return null;

  const fromChildren = tree.childrenById[fromAddId] ?? [];
  if (fromChildren.length < 2) return null;

  const fromIndex = fromChildren.indexOf(movedId);
  if (fromIndex < 0) return null;

  const target = resolveHoverTarget({
    tree,
    hoverId,
    pointer,
    rectFor,
    isContainerOp,
  });

  // Multiplicative cross-equal: if source and hover are on opposite Equal sides, synthesize a MoveAcrossEqual.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide = hoverId ? findEqualSideRoot(tree, hoverId) : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop,
      };
    }
  }

  // Multiplicative cross-equal: if source/target are on opposite sides of the same Equal, synthesize a MoveAcrossEqual.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide =
      target && target.kind === "replace"
        ? findEqualSideRoot(tree, target.replaceId)
        : target && target.kind === "add"
        ? findEqualSideRoot(tree, target.addId)
        : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop,
      };
    }
  }
  if (!target) return null;

  // --- If we’re over an Add, we can either reorder or insert into another Add ---
  if (target.kind === "add") {
    const toAddId = target.addId;

    const toAddRect = rectFor(toAddId);
    if (!toAddRect) return null;
    if (!yGate(toAddRect, pointer.y)) return null;

    const toChildren = tree.childrenById[toAddId] ?? [];
    if (toChildren.length < 2) return null;

    const slot = computeSlotByMidpoints({
      childIds: toChildren,
      pointerX: pointer.x,
      rectFor,
    });

    // Reorder within same Add
    if (toAddId === fromAddId) {
      let toIndex = slot <= fromIndex ? slot : slot - 1;
      toIndex = Math.max(0, Math.min(toChildren.length - 1, toIndex));
      if (toIndex === fromIndex) return null;

      return {
        kind: "ReorderAdd",
        addId: fromAddId,
        movedId,
        fromIndex,
        toIndex,
      };
    }

    // Insert into different Add: structural bans
    if (isAncestorOrSelf(tree, movedId, toAddId)) return null;
    const ban = isStructurallyValidMove(tree, movedId, toAddId);
    if (ban) return null;

    const toIndex = Math.max(0, Math.min(toChildren.length, slot));

    return {
      kind: "InsertIntoAdd",
      fromAddId,
      toAddId,
      movedId,
      fromIndex,
      toIndex,
    };
  }

  // --- Otherwise: we’re over a non-Add side of an Equal; plan an explicit wrap ---
  const { replaceId, replaceParentId, replaceSlot } = target;

  // Don’t allow replacing something inside the moved subtree
  if (isAncestorOrSelf(tree, movedId, replaceId)) return null;

  const PAD = 6;
  const replaceRect = rectFor(replaceId);
  const parentRect = rectFor(replaceParentId);

  // Confidence gate:
  // - Prefer replaceRect containment (best).
  // - Otherwise, allow parentRect containment only if replaceRect is missing BUT parentRect is measurable.
  // - If neither measurable+containing, bail.
  const replaceContains =
    replaceRect != null &&
    containsPoint(replaceRect, pointer.x, pointer.y, PAD);
  const parentContains =
    parentRect != null && containsPoint(parentRect, pointer.x, pointer.y, PAD);

  if (!replaceContains && !parentContains) return null;

  // If we have replaceRect, use it for before/after.
  // Otherwise default to "after" (we know we're on the correct side, but not the fine position).
  let insertIndex: 0 | 1 = 1;
  if (replaceRect) {
    insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;
  }

  return {
    kind: "WrapIntoAddThenInsert",
    movedId,
    fromAddId,
    fromIndex,
    replaceId,
    replaceParentId,
    replaceSlot,
    insertIndex,
  };
}

export type { RectProvider };
