import { unionRects, type RectLTRB } from "./rectMath";

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

export function computeOverlayRectForNodeIds(args: {
  mathDivEl: HTMLElement;
  containerEl: HTMLElement; // the element you're positioning overlay within
  nodeIds: string[];
  padX?: number;
  padY?: number;
}): { left: number; top: number; width: number; height: number } | null {
  const { mathDivEl, containerEl, nodeIds, padX = 8, padY = 3 } = args;

  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr || nodeIds.length === 0) return null;

  const containerRect = containerEl.getBoundingClientRect();

  const els = queryElementsByNodeIds(sr, nodeIds);
  const union = unionBoundingClientRects(els);
  if (!union) return null;

  let { left, top, right, bottom } = union;
  left -= padX;
  right += padX;
  top -= padY;
  bottom += padY;

  return {
    left: left - containerRect.left,
    top: top - containerRect.top,
    width: right - left,
    height: bottom - top,
  };
}
