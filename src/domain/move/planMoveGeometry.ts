import type { RectLTRB } from "../../rectMath";

export type RectProvider = (nodeId: string) => RectLTRB | null;

export function midX(r: RectLTRB): number {
  return (r.left + r.right) / 2;
}

export function containsPoint(
  rect: RectLTRB,
  x: number,
  y: number,
  pad = 0
): boolean {
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  );
}

export function yGate(rect: RectLTRB, y: number): boolean {
  const Y_PAD = 6;
  return y >= rect.top - Y_PAD && y <= rect.bottom + Y_PAD;
}

/**
 * Slot is in [0..n], meaning "before 0", "between 0&1", ..., "after last".
 * We approximate slot boundaries by each child's midpoint.
 */
export function computeSlotByMidpoints(args: {
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

const EDGE_ZONE_PX = 12;
const PAD = 6;

/**
 * Determines the drop kind for multiplicative cross-equal moves based on hit-zones.
 * Returns either "ontoSideRootWhole" (main body), "ontoSideRoot" with insertIndex (edge zones),
 * or null if rects are missing (fallback to safer heuristic).
 */
export function determineMultiplicativeDropKind(args: {
  sideRootId: string;
  pointer: { x: number; y: number };
  rectFor: RectProvider;
  equalId: string;
  toSide: 0 | 1;
}):
  | {
      kind: "ontoSideRootWhole";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
    }
  | {
      kind: "ontoSideRoot";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
      insertIndex: 0 | 1;
    }
  | null {
  const { sideRootId, pointer, rectFor, equalId, toSide } = args;
  const sideRootRect = rectFor(sideRootId);
  if (!sideRootRect) return null; // Fallback: missing rects

  const isInsideRect = containsPoint(sideRootRect, pointer.x, pointer.y, PAD);
  if (!isInsideRect) {
    // Outside the rect but still on that side -> plan edge insertion
    // Determine which side based on pointer position relative to rect
    const insertIndex: 0 | 1 = pointer.x < sideRootRect.left ? 0 : 1;
    return {
      kind: "ontoSideRoot",
      replaceId: sideRootId,
      replaceParentId: equalId,
      replaceSlot: toSide,
      insertIndex,
    };
  }

  // Inside the rect: check if in edge zone
  // Only apply edge zones if the rect is wide enough (at least 3 * EDGE_ZONE_PX)
  // Otherwise, very small targets like single characters would have no main body
  const rectWidth = sideRootRect.right - sideRootRect.left;
  const hasMainBody = rectWidth > EDGE_ZONE_PX * 3;

  if (hasMainBody) {
    const leftEdgeEnd = sideRootRect.left + EDGE_ZONE_PX;
    const rightEdgeStart = sideRootRect.right - EDGE_ZONE_PX;

    if (pointer.x < leftEdgeEnd) {
      // Left edge zone
      return {
        kind: "ontoSideRoot",
        replaceId: sideRootId,
        replaceParentId: equalId,
        replaceSlot: toSide,
        insertIndex: 0,
      };
    } else if (pointer.x > rightEdgeStart) {
      // Right edge zone
      return {
        kind: "ontoSideRoot",
        replaceId: sideRootId,
        replaceParentId: equalId,
        replaceSlot: toSide,
        insertIndex: 1,
      };
    }
  }

  // Main body (or entire rect if too small for edge zones)
  return {
    kind: "ontoSideRootWhole",
    replaceId: sideRootId,
    replaceParentId: equalId,
    replaceSlot: toSide,
  };
}
