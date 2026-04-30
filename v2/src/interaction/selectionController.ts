type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

export type SelectionEventLike =
  | {
      type: "pointer_down";
      nodeId?: string | null;
      pointer?: { x: number; y: number };
    }
  | { type: string; nodeId?: string | null; pointer?: { x: number; y: number } };

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

type RectLike = {
  nodeId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type NodeResolutionSource =
  | { kind: "mathDiv"; mathDiv: HTMLElement | null }
  | { kind: "snapshot"; snapshot: DomRectSnapshot | null };

function pickNodeIdAtPointFromRects(
  rects: RectLike[],
  clientX: number,
  clientY: number,
): string | null {
  let best: { id: string; area: number } | null = null;
  for (const rect of rects) {
    const contains =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!contains) continue;
    const area = Math.max(
      1,
      rect.width * rect.height,
    );
    if (!best || area < best.area) {
      best = { id: rect.nodeId, area };
    }
  }
  return best?.id ?? null;
}

function collectNodeRectsFromMathDiv(mathDiv: HTMLElement | null): RectLike[] {
  const host = mathDiv as MathDivHost | null;
  const shadowRoot = host?.shadowRoot;
  if (!shadowRoot) return [];
  return Array.from(
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
}

export function resolveDomRectSnapshot(
  mathDiv: HTMLElement | null,
): DomRectSnapshot | null {
  if (!mathDiv) return null;
  const host = mathDiv as MathDivHost;
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return null;

  const rect = mathDiv.getBoundingClientRect();
  const nodeRects = collectNodeRectsFromMathDiv(mathDiv);

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

function resolveNodeIdAtPoint(
  source: NodeResolutionSource,
  clientX: number,
  clientY: number,
): string | null {
  if (source.kind === "snapshot") {
    return pickNodeIdAtPointFromRects(source.snapshot?.nodeRects ?? [], clientX, clientY);
  }
  return pickNodeIdAtPointFromRects(
    collectNodeRectsFromMathDiv(source.mathDiv),
    clientX,
    clientY,
  );
}

export function resolveSelectedNodeIdFromEvent(
  currentSelectedNodeId: string | null,
  event: SelectionEventLike,
  source?: NodeResolutionSource,
): string | null {
  if (event.type === "pointer_down") {
    if (event.nodeId !== undefined) return event.nodeId ?? null;
    if (event.pointer && source) {
      return resolveNodeIdAtPoint(source, event.pointer.x, event.pointer.y);
    }
    return null;
  }
  return currentSelectedNodeId;
}
