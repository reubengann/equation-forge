type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

export type SelectionEventLike =
  | { type: "pointer_down"; nodeId: string | null }
  | { type: string; nodeId?: string | null };

function pickNodeIdAtPoint(
  shadowRoot: ShadowRoot,
  clientX: number,
  clientY: number,
): string | null {
  const els = Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"));
  let best: { id: string; area: number } | null = null;
  for (const el of els) {
    const nodeId = el.dataset.nodeId;
    if (!nodeId) continue;
    const rect = el.getBoundingClientRect();
    const contains =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!contains) continue;
    const area = Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top));
    if (!best || area < best.area) {
      best = { id: nodeId, area };
    }
  }
  return best?.id ?? null;
}

export function resolveNodeIdFromMathDivAtPoint(
  mathDiv: HTMLElement | null,
  clientX: number,
  clientY: number,
): string | null {
  const host = mathDiv as MathDivHost | null;
  const shadowRoot = host?.shadowRoot;
  if (!shadowRoot) return null;
  return pickNodeIdAtPoint(shadowRoot, clientX, clientY);
}

export function nextSelectedNodeIdFromEvent(
  currentSelectedNodeId: string | null,
  event: SelectionEventLike,
): string | null {
  if (event.type === "pointer_down") {
    return event.nodeId ?? null;
  }
  return currentSelectedNodeId;
}
