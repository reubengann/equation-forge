type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

export type SelectionEventLike =
  | {
      type: "pointer_down";
      pointer?: { x: number; y: number };
    }
  | {
      type: string;
      pointer?: { x: number; y: number };
    };

export type RectBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type NodeRect = RectBounds & {
  nodeId: string;
};

export type SelectionGeometry = {
  hostRect: RectBounds;
  nodeRects: NodeRect[];
};

export type NodeResolutionSource = {
  nodeRects: NodeRect[] | null;
};

function pickNodeIdAtPointFromRects(
  rects: NodeRect[],
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
    const area = Math.max(1, rect.width * rect.height);
    if (!best || area < best.area) {
      best = { id: rect.nodeId, area };
    }
  }
  return best?.id ?? null;
}

/**
 * Collects per-node layout rectangles from a rendered math div.
 * Use this for point-based node resolution (selection hit-testing).
 */
export function collectNodeRectsFromMathDiv(
  mathDiv: HTMLElement | null,
): NodeRect[] {
  const host = mathDiv as MathDivHost | null;
  const shadowRoot = host?.shadowRoot;
  if (!shadowRoot) return [];
  return Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"))
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

/**
 * Captures full geometry for a rendered math div:
 * the host bounds plus all node rectangles.
 * Useful for recording/replay fixtures and diagnostics.
 */
export function resolveSelectionGeometry(
  mathDiv: HTMLElement | null,
): SelectionGeometry | null {
  if (!mathDiv) return null;
  const host = mathDiv as MathDivHost;
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return null;

  const rect = mathDiv.getBoundingClientRect();
  const nodeRects = collectNodeRectsFromMathDiv(mathDiv);

  return {
    hostRect: {
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

/**
 * Computes the next selected node id for a UI event.
 * For pointer_down, resolves from pointer coordinates against provided node
 * rectangles.
 */
export function resolveSelectedNodeIdFromEvent(
  currentSelectedNodeId: string | null,
  event: SelectionEventLike,
  nodeRects: NodeRect[],
): string | null {
  if (event.type === "pointer_down") {
    if (event.pointer) {
      return pickNodeIdAtPointFromRects(
        nodeRects,
        event.pointer.x,
        event.pointer.y,
      );
    }
    return null;
  }
  return currentSelectedNodeId;
}
