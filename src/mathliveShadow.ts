import type { ExpressionTree } from "./ExpressionTree";
import type { Slot } from "./moveExpression/types";
import { pickInsertSlot, unionRects, type RectLTRB } from "./rectMath";

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

  const nodeRects = getChildRectsInShadow(measureEl, childIds); // your existing helper
  if (!nodeRects.length) return null;
  const rects: RectLTRB[] = nodeRects.map((nr) => nr.rect);

  const slotIndex = pickInsertSlot(rects, clientX, 0); // your existing helper: returns 0..n
  if (slotIndex == null) return null;
  return slotIndex;
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
  // let logStmt = "";
  // const print = (s: any) => (logStmt += s.toString() + "\n");
  for (const el of els) {
    const id = el.dataset.nodeId;
    if (!id) {
      // print("No id for this dataset");
      continue;
    }

    const r = el.getBoundingClientRect();
    const rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };

    const host = mathDivEl.getBoundingClientRect();
    // print(
    //   `HOST rect: ${host.left}, ${host.right}, ${host.top}, ${host.bottom}`
    // );
    if (!rectContains(rect, clientX, clientY)) {
      // console.log(el.attributes[0].nodeValue);
      // if (el.attributes[0].nodeValue == "n2")
      //   print(
      //     `rect ${el.attributes[0].nodeValue} ${rect.left}, ${rect.right}, ${rect.top}, ${rect.bottom} does not contain ${clientX}, ${clientY}`
      //   );
      continue;
    }

    const area = (rect.right - rect.left) * (rect.bottom - rect.top);
    if (area < bestArea) {
      bestArea = area;
      bestId = id;
      // if (el.attributes[0].nodeValue == "n2")
      //   print(
      //     `Best so far: rect ${el.attributes[0].nodeValue} ${rect.left}, ${rect.right}, ${rect.top}, ${rect.bottom} DOES contain ${clientX}, ${clientY}`
      //   );
    }
  }

  // print(`returning ${bestId}`);
  // console.log(logStmt);
  return bestId;
}
