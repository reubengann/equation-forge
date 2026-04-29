type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

export type SelectionEventLike =
  | { type: "pointer_down"; nodeId: string | null }
  | { type: string; nodeId?: string | null };

export type DomRectSnapshot = {
  mathDivRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  nodeRects: Array<{
    nodeId: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }>;
};

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

export function resolveDomRectSnapshot(
  mathDiv: HTMLElement | null,
): DomRectSnapshot | null {
  if (!mathDiv) return null;
  const host = mathDiv as MathDivHost;
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return null;

  const rect = mathDiv.getBoundingClientRect();
  const nodeRects = Array.from(
    shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"),
  )
    .map((el) => {
      const nodeId = el.dataset.nodeId;
      if (!nodeId) return null;
      const nodeRect = el.getBoundingClientRect();
      return {
        nodeId,
        left: nodeRect.left,
        top: nodeRect.top,
        right: nodeRect.right,
        bottom: nodeRect.bottom,
        width: nodeRect.width,
        height: nodeRect.height,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    mathDivRect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
    nodeRects,
  };
}

export function resolveNodeIdFromDomSnapshotAtPoint(
  snapshot: DomRectSnapshot | null,
  clientX: number,
  clientY: number,
): string | null {
  if (!snapshot) return null;
  let best: { id: string; area: number } | null = null;
  for (const rect of snapshot.nodeRects) {
    const contains =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!contains) continue;
    const area = Math.max(1, rect.width * rect.height);
    if (!best || area < best.area) {
      best = { id: rect.nodeId, area };
    }
  }
  return best?.id ?? null;
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
