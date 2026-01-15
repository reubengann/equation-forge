import type { ExpressionTree } from "./ExpressionTree";
import type { MoveMode } from "./moveExpression/applyMove";
import type { RectLTRB } from "./rectMath";
import { isStructurallyValidMove } from "./movePath";
import { normalizeSelection } from "./selectionSemantics";

export type RectProvider = (nodeId: string) => RectLTRB | null;

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

function midX(r: RectLTRB): number {
  return (r.left + r.right) / 2;
}

function containsPoint(rect: RectLTRB, x: number, y: number, pad = 0): boolean {
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  );
}

function yGate(rect: RectLTRB, y: number): boolean {
  const Y_PAD = 6;
  return y >= rect.top - Y_PAD && y <= rect.bottom + Y_PAD;
}

function findNearestAncestorWithOp(
  tree: ExpressionTree,
  startId: string,
  op: string
): string | null {
  let cur: string | null = startId;
  while (cur) {
    const node = tree.nodesById[cur];
    if (node?.op === op) return cur;
    cur = tree.parentById[cur] ?? null;
  }
  return null;
}

function isAncestorOrSelf(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function findContainerAncestors(
  tree: ExpressionTree,
  startId: string,
  isContainerOp: (op?: string) => boolean
): string[] {
  const ids: string[] = [];
  let cur: string | null = startId;
  while (cur) {
    const n = tree.nodesById[cur];
    if (isContainerOp(n?.op)) ids.push(cur);
    cur = tree.parentById[cur] ?? null;
  }
  return ids; // closest-first
}

const isVectorNode = (info?: { op?: string; latex?: string }) =>
  info?.op === "OverVector" ||
  (info?.op === "Symbol" && (info?.latex ?? "").includes("\\vec"));
function hasVectorAncestor(tree: ExpressionTree, nodeId: string): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (isVectorNode(tree.nodesById[cur])) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; sideRootId: string; sideSlot: 0 | 1 } | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parent = tree.parentById[cur];
    if (!parent) return null;
    if (tree.nodesById[parent]?.op === "Equal") {
      const kids = tree.childrenById[parent] ?? [];
      if (kids.length >= 2) {
        const lhsId = kids[0];
        const rhsId = kids[1];
        if (cur === lhsId)
          return { equalId: parent, sideRootId: lhsId, sideSlot: 0 };
        if (cur === rhsId)
          return { equalId: parent, sideRootId: rhsId, sideSlot: 1 };
      }
      return null;
    }
    cur = parent;
  }
  return null;
}

/**
 * Slot is in [0..n], meaning "before 0", "between 0&1", ..., "after last".
 * We approximate slot boundaries by each child's midpoint.
 */
function computeSlotByMidpoints(args: {
  childIds: string[];
  pointerX: number;
  rectFor: RectProvider;
}): number {
  const { childIds, pointerX, rectFor } = args;
  const n = childIds.length;

  for (let i = 0; i < n; i++) {
    const r = rectFor(childIds[i]);
    if (!r) continue;
    if (pointerX < midX(r)) return i;
  }
  return n;
}

type HoverTarget =
  | { kind: "add"; addId: string }
  | {
      kind: "replace";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: number;
    };

/**
 * Resolve what the pointer is effectively over.
 *
 * Preference order:
 * 1) If hoverId is inside one or more Add subtrees: choose the closest Add whose rect contains the pointer.
 * 2) Else if hoverId is (or is inside) an Equal: pick LHS/RHS by rect containment; if that side is Add => {add},
 *    otherwise => {replace} (replace that side root with a new Add).
 */
function resolveHoverTarget(args: {
  tree: ExpressionTree;
  hoverId: string;
  pointer: { x: number; y: number };
  rectFor: RectProvider;
  isContainerOp: (op?: string) => boolean;
}): HoverTarget | null {
  const { tree, hoverId, pointer, rectFor, isContainerOp } = args;

  // 1) Add ancestors, choose closest by rect containment
  const addAncestors = findContainerAncestors(tree, hoverId, isContainerOp);
  if (addAncestors.length > 0) {
    const PAD = 6;
    for (const addId of addAncestors) {
      const r = rectFor(addId);
      if (!r) continue;
      if (containsPoint(r, pointer.x, pointer.y, PAD))
        return { kind: "add", addId };
    }
    // Fallback to nearest structural Add if measurement is missing
    return { kind: "add", addId: addAncestors[0] };
  }

  // 2) Equal ancestor (common when hovering the '=' glyph)
  const equalId = findNearestAncestorWithOp(tree, hoverId, "Equal");
  if (!equalId) return null;

  const [lhsId, rhsId] = tree.childrenById[equalId] ?? [];
  if (!lhsId || !rhsId) return null;

  const PAD = 6;
  const lhsRect = rectFor(lhsId);
  const rhsRect = rectFor(rhsId);

  let sideId: string;
  let sideSlot: number;

  // Only trust containment if we can measure BOTH sides.
  // If one side is missing, we might accidentally "choose" the other side.
  if (lhsRect && rhsRect) {
    const lhsContains = containsPoint(lhsRect, pointer.x, pointer.y, PAD);
    const rhsContains = containsPoint(rhsRect, pointer.x, pointer.y, PAD);

    if (lhsContains && !rhsContains) {
      sideId = lhsId;
      sideSlot = 0;
    } else if (rhsContains && !lhsContains) {
      sideId = rhsId;
      sideSlot = 1;
    } else {
      // overlap / gap / ambiguous -> fall back to Equal midpoint
      const eqRect = rectFor(equalId);
      if (!eqRect) return null;
      if (pointer.x < midX(eqRect)) {
        sideId = lhsId;
        sideSlot = 0;
      } else {
        sideId = rhsId;
        sideSlot = 1;
      }
    }
  } else {
    // Missing side rect(s) -> only safe signal is Equal midpoint.
    const eqRect = rectFor(equalId);
    if (!eqRect) return null;
    if (pointer.x < midX(eqRect)) {
      sideId = lhsId;
      sideSlot = 0;
    } else {
      sideId = rhsId;
      sideSlot = 1;
    }
  }

  const sideNode = tree.nodesById[sideId];
  if (isContainerOp(sideNode?.op)) return { kind: "add", addId: sideId };

  return {
    kind: "replace",
    replaceId: sideId,
    replaceParentId: equalId,
    replaceSlot: sideSlot,
  };
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

  if (selectedIds.length < 1) return null;
  if (!hoverId) return null;

  const movedRawId = selectedIds[0];
  const movedId = normalizeSelection(tree, movedRawId);
  const movedOp = tree.nodesById[movedId]?.op;
  const movedIsVector =
    hasVectorAncestor(tree, movedId) || hasVectorAncestor(tree, movedRawId);

  const movedParentId = tree.parentById[movedId];
  if (!movedParentId) return null;

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

      // Confidence gate (same pattern as your WrapIntoAddThenInsert)
      const PAD = 6;
      const replaceRect = rectFor(replaceId);
      const parentRect = rectFor(replaceParentId);

      const replaceContains =
        replaceRect != null &&
        containsPoint(replaceRect, pointer.x, pointer.y, PAD);
      const parentContains =
        parentRect != null &&
        containsPoint(parentRect, pointer.x, pointer.y, PAD);

      if (!replaceContains && !parentContains) return null;

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
      // console.log("cross-equal branch A", { movedId, movedOp, movedIsVector });
      if (movedIsVector) return null;
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
      // console.log("cross-equal branch B", { movedId, movedOp, movedIsVector });
      if (movedIsVector) return null;
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
