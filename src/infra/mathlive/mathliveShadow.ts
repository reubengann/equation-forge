import type { ExpressionTree } from "../../ExpressionTree";
import type { Slot } from "../../moveExpression/types";
import { pickInsertSlot, unionRects, type RectLTRB } from "../../rectMath";

export function getMathliveShadowRoot(mathDivEl: HTMLElement) {
  return (mathDivEl as any).shadowRoot as ShadowRoot | null;
}

export function queryElementsByNodeIds(
  sr: ShadowRoot,
  nodeIds: string[]
): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const id of nodeIds) {
    out.push(
      ...sr.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
    );
  }
  return out;
}

export function remapEqualHoverToSide(
  tree: ExpressionTree,
  measureEl: HTMLElement,
  hoverId: string,
  clientX: number
): string {
  const n = tree.nodesById[hoverId];
  if (!n || n.op !== "Equal") return hoverId;

  const kids = tree.childrenById[hoverId] ?? [];
  if (kids.length !== 2) return hoverId;

  const [lhsId, rhsId] = kids;

  // Find rects for LHS and RHS expressions; pick whichever side the cursor is closer to.
  const rects = getChildRectsInShadow(measureEl, [lhsId, rhsId]);
  const lhsRect = rects.find((r) => r.id === lhsId)?.rect;
  const rhsRect = rects.find((r) => r.id === rhsId)?.rect;

  if (!lhsRect || !rhsRect) return hoverId;

  const lhsCenter = (lhsRect.left + lhsRect.right) / 2;
  const rhsCenter = (rhsRect.left + rhsRect.right) / 2;

  return Math.abs(clientX - lhsCenter) <= Math.abs(clientX - rhsCenter)
    ? lhsId
    : rhsId;
}

function isAdditiveBoundaryParentOp(op: string | undefined): boolean {
  return op === "Add" || op === "Equal";
}

export function getMoveContainerForHover(
  tree: ExpressionTree,
  hoverId: string
): string | null {
  // 1) If we're under an Add, always use that Add
  let cur: string | null = hoverId;
  while (cur) {
    if (tree.nodesById[cur]?.op === "Add") return cur;
    cur = tree.parentById[cur];
  }

  // 2) Otherwise choose the "term root": climb until parent is Add/Equal/null
  let term: string = hoverId;
  while (true) {
    const p = tree.parentById[term];
    if (!p) return term;

    const pOp = tree.nodesById[p]?.op;
    if (isAdditiveBoundaryParentOp(pOp)) return term;

    term = p;
  }
}

export function getSlotForMoveContainer(
  tree: ExpressionTree,
  measureEl: HTMLElement,
  containerId: string,
  clientX: number
): Slot {
  if (tree.nodesById[containerId]?.op === "Add") {
    // existing behavior
    return getSlotForAddReorder(tree, measureEl, containerId, clientX);
  }

  // singleton term: treat as 1-child list
  const nodeRects = getChildRectsInShadow(measureEl, [containerId]);
  if (!nodeRects.length) return null;

  const rects: RectLTRB[] = nodeRects
    .map((nr) => nr.rect)
    .sort((a, b) => a.left - b.left);

  // insertion index in [0..1]
  return pickInsertSlot(rects, clientX, 0);
}

export function rectFromElement(el: HTMLElement): RectLTRB {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function unionBoundingClientRects(
  els: Iterable<HTMLElement>
): RectLTRB | null {
  const rects: RectLTRB[] = [];
  for (const el of els) rects.push(rectFromElement(el));
  return unionRects(rects);
}

export function getChildRectsInShadow(
  mathDivEl: HTMLElement,
  childIds: string[]
) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return [];

  return childIds
    .map((id) => {
      const els = queryElementsByNodeIds(sr, [id]);
      const rect = unionBoundingClientRects(els);
      if (!rect) return null;
      return { id, rect };
    })
    .filter(Boolean) as { id: string; rect: any }[];
}

export function getSlotForAddReorder(
  tree: ExpressionTree,
  measureEl: HTMLElement,
  addId: string,
  clientX: number
): Slot {
  const childIds = tree.childrenById[addId] ?? [];
  if (childIds.length < 2) return null;

  // debugger;
  // Only exclude ids that are *direct children* of this Add (reorder case)

  const nodeRects = getChildRectsInShadow(measureEl, childIds);
  if (!nodeRects.length) return null;

  const rects: RectLTRB[] = nodeRects
    .map((nr) => nr.rect)
    .sort((a, b) => a.left - b.left);

  const insertSlot = pickInsertSlot(rects, clientX, 0);
  // console.log("picked insert slot", insertSlot, "from", rects, "at", clientX);
  return insertSlot;
}

function rectContains(r: RectLTRB, x: number, y: number) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function hitTestNodeIdInMathliveShadow(
  mathDivEl: HTMLElement,
  clientX: number,
  clientY: number
): string | null {
  const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
  if (!sr) return null;

  let bestId: string | null = null;
  let bestArea = Infinity;

  const els = sr.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const el of els) {
    const id = el.dataset.nodeId;
    if (!id) {
      continue;
    }

    const r = el.getBoundingClientRect();
    const rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };

    if (!rectContains(rect, clientX, clientY)) {
      continue;
    }

    const area = (rect.right - rect.left) * (rect.bottom - rect.top);
    if (area < bestArea) {
      bestArea = area;
      bestId = id;
    }
  }

  return bestId;
}
