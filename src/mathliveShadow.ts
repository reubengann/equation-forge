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
