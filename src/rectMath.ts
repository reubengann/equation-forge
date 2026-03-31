import type { ExpressionTree } from "./ExpressionTree";

export type RectLTRB = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number }
): RectLTRB {
  return {
    left: Math.min(a.x, b.x),
    right: Math.max(a.x, b.x),
    top: Math.min(a.y, b.y),
    bottom: Math.max(a.y, b.y),
  };
}

export function rectsOverlap(a: RectLTRB, b: RectLTRB): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

export function getReorderContainerForSelection(
  tree: ExpressionTree,
  selectedId: string
): string | null {
  // debugger;
  if (tree.nodesById[selectedId].op == "Add") return selectedId;
  const pId = tree.parentById[selectedId];
  if (!pId) {
    // console.log("selected", tree.nodesById[selectedId], "No parent");
    return null;
  }
  // console.log(
  //   "selected",
  //   tree.nodesById[selectedId],
  //   "parent",
  //   tree.nodesById[pId]
  // );
  if (!pId) return null;
  return tree.nodesById[pId]?.op === "Add" ? pId : null;
}

// Given a type of n-ary expression, and its elements' bounding boxes,
// where would we want to insert an element?
export function pickInsertSlot(
  rects: RectLTRB[],
  x: number,
  marginPx: number
): number | null {
  const n = rects.length;
  if (n === 0) return null;

  rects = [...rects].sort((a, b) => a.left - b.left);

  if (x < rects[0].left - marginPx) return null;

  for (let i = 0; i < n; i++) {
    const mid = (rects[i].left + rects[i].right) / 2;
    if (x < mid) return i; // before item i
  }
  return n; // after last
}

export function unionRects(rects: RectLTRB[]): RectLTRB | null {
  if (rects.length === 0) return null;

  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;

  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }

  return { left, top, right, bottom };
}
