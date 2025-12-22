export type RectLTRB = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// Given a type of n-ary expression, and its elements' bounding boxes,
// where would we want to insert an element?
export function pickInsertSlot(
  rects: RectLTRB[],
  x: number,
  marginPx: number
): number | null {
  const n = rects.length;
  if (n === 0) return null;

  const first = rects[0];
  if (x < first.left - marginPx) return null;

  if (n === 1) {
    const mid = (first.left + first.right) / 2;
    return x <= mid ? 0 : 1;
  }

  for (let i = 1; i < n; i++) {
    const l = rects[i - 1];
    const r = rects[i];
    const gapMid = (l.right + r.left) / 2;

    // slot i-1 is "before r" (between l and r)
    if (x <= gapMid) {
      return i - 1;
    }
  }

  const last = rects[n - 1]; // rect[1]
  const lastMid = (last.left + last.right) / 2; // (40 + 60)/2 = 50
  return x <= lastMid ? n - 1 : n; // x=36 => return 1
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
