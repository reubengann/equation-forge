import type { CompiledExprIndex as ExprIndex, Expr } from "../math/ast";

type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

export type PointerLike = {
  x: number;
  y: number;
};

export type SingleSelection = {
  kind: "single_node";
  nodeId: string;
};

export type MultiFromTreeExpansionSelection = {
  kind: "multi_node_from_tree_expansion";
  /**
   * The node selected by the first click.
   */
  anchorNodeId: string;
  /**
   * The currently selected expanded ancestor node.
   */
  expandedNodeId: string;
  /**
   * Number of clicks that participated in this expansion sequence.
   */
  clickCount: number;
};

export type MultiFromCtrlClickSelection = {
  kind: "multi_node_from_ctrl_click";
  /**
   * Nodes toggled into the ctrl-click selection set.
   */
  nodeIds: string[];
  /**
   * Optional structure/container node that constrains valid ctrl-click picks.
   * Example: selecting terms within one sum.
   */
  containerNodeId: string | null;
};

export type MultiFromRubberBandSelection = {
  kind: "multi_node_from_rubber_band";
  /**
   * Nodes captured by a marquee selection gesture.
   */
  nodeIds: string[];
  marqueeRect: RectBounds;
  /**
   * Optional structure/container node inferred from the marquee region.
   */
  containerNodeId: string | null;
};

export type Selection =
  | SingleSelection
  | MultiFromTreeExpansionSelection
  | MultiFromCtrlClickSelection
  | MultiFromRubberBandSelection;

export type SelectionControllerEvent =
  | {
      type: "pointer_down";
      pointer: PointerLike;
      pointerId?: number;
      ts: number;
      buttons: number;
      ctrlKey: boolean;
    }
  | {
      type: "pointer_up";
      pointer: PointerLike;
      pointerId?: number;
      ts: number;
      buttons: number;
      ctrlKey: boolean;
    }
  | {
      type: "pointer_cancel";
      pointerId?: number;
      ts: number;
    }
  | {
      type: "lost_pointer_capture";
      pointerId?: number;
      ts: number;
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
  nodeRects: NodeRect[];
  rectById: Record<string, NodeRect>;
};

export type SelectionControllerConfig = {
  dragThresholdPx: number;
  doubleClickWindowMs: number;
};

export const DEFAULT_SELECTION_CONTROLLER_CONFIG: SelectionControllerConfig = {
  dragThresholdPx: 6,
  doubleClickWindowMs: 350,
};

type PendingPointerDown = {
  pointerId: number | null;
  pointer: PointerLike;
  ts: number;
};

type LastClick = {
  pointer: PointerLike;
  ts: number;
};

export type SelectionControllerState = {
  pendingPointerDown: PendingPointerDown | null;
  lastCommittedClick: LastClick | null;
  selectedNodeId: string | null;
};

export function createSelectionControllerState(): SelectionControllerState {
  return {
    pendingPointerDown: null,
    lastCommittedClick: null,
    selectedNodeId: null,
  };
}

export type PointerEventPayload = {
  x: number;
  y: number;
  domSnapshotId: string | null;
  pointerType: string;
  button: number;
  buttons: number;
  ctrlKey: boolean;
};

export type DomSnapshotObservedPayload = {
  domSnapshotId: string | null;
  domSnapshot: SelectionGeometry | null;
};

function distanceSquared(a: PointerLike, b: PointerLike): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function containsPoint(rect: NodeRect, point: PointerLike): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function shouldEscalateFromChildToParent(
  parentExpr: Expr | undefined,
): boolean {
  if (!parentExpr) return false;
  switch (parentExpr.kind) {
    case "primed":
    case "dotted_expr":
    case "hat":
    case "vector":
    case "special_font":
    case "partial_derivative":
    case "partial_derivative_operator":
    case "full_derivative_operator":
    case "second_order_partial_derivative":
    case "partial_at_const_quantity":
      return true;
    default:
      return false;
  }
}

// Nodes that represent structural operators/chrome are not directly selectable.
// Their children can still be selected. The plus sign in a sum, the equals sign in an equation, etc.
function isDirectlySelectableNode(expr: Expr | undefined): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case "add":
    case "equation":
    case "inequality":
      return false;
    default:
      return true;
  }
}

function walkUpToSelectableNode(
  nodeId: string | null,
  index: ExprIndex,
): string | null {
  if (!nodeId) return null;
  let cursor: string | null = nodeId;
  while (cursor) {
    const parentId = index.parentById[cursor];
    const parentExpr = parentId ? index.nodeById[parentId] : undefined;
    if (parentId && shouldEscalateFromChildToParent(parentExpr)) {
      cursor = parentId;
      continue;
    }
    if (isDirectlySelectableNode(index.nodeById[cursor])) {
      return cursor;
    }
    cursor = parentId;
  }
  return null;
}

// Starting at the root, do a depth-first search of the tree to find the lowest node containing the point.
function pickNodeIdAtPointFromTree(
  nodeResolution: NodeResolutionSource,
  point: PointerLike,
  index: ExprIndex,
): string | null {
  const descend = (nodeId: string): string | null => {
    const nodeRect = nodeResolution.rectById[nodeId];
    const containsSelf = !!nodeRect && containsPoint(nodeRect, point);
    const children = index.childrenById[nodeId] ?? [];
    for (const childId of children) {
      const hit = descend(childId);
      if (hit) return hit;
    }
    return containsSelf ? nodeId : null;
  };

  return descend(index.rootId);
}

function resolveSelectableNodeAtPoint(
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
): string | null {
  const treeHit = pickNodeIdAtPointFromTree(nodeResolution, point, index);
  return walkUpToSelectableNode(treeHit, index);
}

function nextSelectableParent(
  selectedNodeId: string | null,
  index: ExprIndex | null,
): string | null {
  if (!selectedNodeId || !index) return selectedNodeId;
  const parentId = index.parentById[selectedNodeId];
  if (!parentId) return selectedNodeId;
  return walkUpToSelectableNode(parentId, index);
}

type SelectionControllerInputs = {
  event: SelectionControllerEvent;
  nodeResolution: NodeResolutionSource;
  index: ExprIndex | null;
  state: SelectionControllerState;
  config?: Partial<SelectionControllerConfig>;
};

/* 
  Main entry point for selecting
*/
export function resolveSelectionFromEvent({
  event,
  nodeResolution,
  index,
  state,
  config,
}: SelectionControllerInputs): SelectionControllerState {
  const currentSelectedNodeId = state.selectedNodeId;
  const mergedConfig: SelectionControllerConfig = {
    ...DEFAULT_SELECTION_CONTROLLER_CONFIG,
    ...config,
  };

  // If nothing is selected, we can just select here. Makes it seem snappier.
  if (event.type === "pointer_down") {
    const resolvedAtPoint =
      currentSelectedNodeId === null
        ? resolveSelectableNodeAtPoint(event.pointer, nodeResolution, index)
        : null;
    return {
      ...state,
      selectedNodeId: resolvedAtPoint ?? currentSelectedNodeId,
      pendingPointerDown: {
        pointerId: event.pointerId ?? null,
        pointer: event.pointer,
        ts: event.ts,
      },
    };
  }

  if (
    event.type === "pointer_cancel" ||
    event.type === "lost_pointer_capture"
  ) {
    return {
      ...state,
      pendingPointerDown: null,
    };
  }

  if (event.type === "pointer_up") {
    const pending = state.pendingPointerDown;
    const pointerIdMismatch =
      !!pending &&
      pending.pointerId !== null &&
      event.pointerId !== undefined &&
      event.pointerId !== pending.pointerId;

    if (pointerIdMismatch) {
      return {
        ...state,
        pendingPointerDown: null,
      };
    }

    if (pending) {
      const movedTooFar =
        distanceSquared(pending.pointer, event.pointer) >
        mergedConfig.dragThresholdPx ** 2;
      if (movedTooFar) {
        return {
          ...state,
          pendingPointerDown: null,
        };
      }
    }

    const resolvedAtPoint = resolveSelectableNodeAtPoint(
      event.pointer,
      nodeResolution,
      index,
    );
    const isDoubleClick =
      !!state.lastCommittedClick &&
      event.ts - state.lastCommittedClick.ts <=
        mergedConfig.doubleClickWindowMs &&
      distanceSquared(state.lastCommittedClick.pointer, event.pointer) <=
        mergedConfig.dragThresholdPx ** 2;

    const nextSelectedNodeId =
      isDoubleClick && currentSelectedNodeId
        ? nextSelectableParent(currentSelectedNodeId, index)
        : resolvedAtPoint;

    return {
      selectedNodeId: nextSelectedNodeId,
      pendingPointerDown: null,
      lastCommittedClick: {
        pointer: event.pointer,
        ts: event.ts,
      },
    };
  }

  return {
    ...state,
  };
}

/**
 * Collects per-node layout rectangles from a rendered math div.
 * Use this for point-based node resolution (selection hit-testing).
 */
export function captureLabeledNodes(mathDiv: HTMLElement | null): NodeRect[] {
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

export function buildNodeResolutionSource(
  nodeRects: NodeRect[],
  index: ExprIndex | null,
): NodeResolutionSource {
  const rectById: Record<string, NodeRect> = {};
  for (const rect of nodeRects) {
    if (index && !index.nodeById[rect.nodeId]) {
      throw new Error(
        `selectionController received unknown rect nodeId ${rect.nodeId}`,
      );
    }
    if (rectById[rect.nodeId]) {
      throw new Error(
        `selectionController received duplicate rect nodeId ${rect.nodeId}`,
      );
    }
    rectById[rect.nodeId] = rect;
  }
  return { nodeRects, rectById };
}

/**
 * Captures full geometry for a rendered math div:
 * the host bounds plus all node rectangles.
 * Useful for recording/replay fixtures and diagnostics.
 */
export function captureGeometryFromMathdiv(
  mathDiv: HTMLElement | null,
): SelectionGeometry | null {
  if (!mathDiv) return null;
  const host = mathDiv as MathDivHost;
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return null;

  const rect = mathDiv.getBoundingClientRect();
  const nodeRects = captureLabeledNodes(mathDiv);

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
