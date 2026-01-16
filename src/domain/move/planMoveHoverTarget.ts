import type { ExpressionTree } from "../../ExpressionTree";
import {
  containsPoint,
  midX,
  type RectProvider,
} from "./planMoveGeometry";

type HoverTarget =
  | { kind: "add"; addId: string }
  | {
      kind: "replace";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: number;
    };

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

export function isAncestorOrSelf(
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

/**
 * Resolve what the pointer is effectively over.
 *
 * Preference order:
 * 1) If hoverId is inside one or more Add subtrees: choose the closest Add whose rect contains the pointer.
 * 2) Else if hoverId is (or is inside) an Equal: pick LHS/RHS by rect containment; if that side is Add => {add},
 *    otherwise => {replace} (replace that side root with a new Add).
 */
export function resolveHoverTarget(args: {
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

export type { HoverTarget };
