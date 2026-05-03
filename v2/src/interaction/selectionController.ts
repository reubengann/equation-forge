import type { CompiledExprIndex as ExprIndex, Expr } from "../math/ast";
import { applyCtrlClickIntent } from "./multiSelectionController";

type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

type PointerLike = {
  x: number;
  y: number;
};

type SingleSelection = {
  kind: "single";
  nodeId: string;
};

type MultiSelection = {
  kind: "multi";
  nodeIds: string[];
  containerNodeId: string | null;
};

export type Selection = SingleSelection | MultiSelection;

type PointerDownControllerEvent = {
  type: "pointer_down";
  pointer: PointerLike;
  pointerId?: number;
  ts: number;
  buttons: number;
  ctrlKey: boolean;
};

type PointerUpControllerEvent = {
  type: "pointer_up";
  pointer: PointerLike;
  pointerId?: number;
  ts: number;
  buttons: number;
  ctrlKey: boolean;
};

type PointerControllerEvent = PointerDownControllerEvent | PointerUpControllerEvent;

export type SelectionControllerEvent =
  | PointerDownControllerEvent
  | PointerUpControllerEvent
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

type SelectionControllerConfig = {
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
  selection: Selection | null;
};

export function createSelectionControllerState(): SelectionControllerState {
  return {
    pendingPointerDown: null,
    lastCommittedClick: null,
    selection: null,
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

// Convenience function for getting all selected nodes regardless of selection type.
export function selectionSet(selection: Selection | null): Set<string> {
  if (!selection) return new Set();
  if (selection.kind === "single") return new Set([selection.nodeId]);
  return new Set(selection.nodeIds);
}

export function selectionNodeIds(selection: Selection | null): string[] {
  if (!selection) return [];
  if (selection.kind === "single") return [selection.nodeId];
  return [...selection.nodeIds];
}

function containsPoint(rect: NodeRect, point: PointerLike): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function shouldEscalateFromChildToParent(parentExpr: Expr | undefined): boolean {
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

function walkUpToSelectableNode(nodeId: string | null, index: ExprIndex): string | null {
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

function resolveNodeAtPoint(
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
): { treeHitNodeId: string | null; selectableNodeId: string | null } {
  const treeHitNodeId = pickNodeIdAtPointFromTree(nodeResolution, point, index);
  return {
    treeHitNodeId,
    selectableNodeId: walkUpToSelectableNode(treeHitNodeId, index),
  };
}

type SelectionControllerInputs = {
  event: SelectionControllerEvent;
  currentSelection: Selection | null;
  nodeResolutionSource: NodeResolutionSource;
  index: ExprIndex | null;
  state: SelectionControllerState;
};

function handleMultiSelectionWithExistingSelection(
  event: PointerDownControllerEvent,
  nodeResolutionSource: NodeResolutionSource,
  index: ExprIndex | null,
  currentSelection: Selection | null,
  state: SelectionControllerState,
): SelectionControllerState {
  const resolvedAtPoint = resolveSelectableNodeAtPoint(event.pointer, nodeResolutionSource, index);

  if (!resolvedAtPoint) {
    return {
      ...state,
      pendingPointerDown: null,
    };
  }

  const decision = applyCtrlClickIntent({
    nodeId: resolvedAtPoint,
    currentSelection,
    index,
  });
  const nextSelection = decision.accepted ? decision.nextSelection : currentSelection;
  return {
    ...state,
    selection: nextSelection,
    pendingPointerDown: {
      pointerId: event.pointerId ?? null,
      pointer: event.pointer,
      ts: event.ts,
    },
  };
}

/* 
  Main entry point for selecting
*/
export function resolveSelectionFromEvent({
  event,
  currentSelection,
  nodeResolutionSource,
  index,
  state,
}: SelectionControllerInputs): SelectionControllerState {
  const currentSelectedNodes = selectionSet(currentSelection);

  if (event.type === "pointer_down") {
    // TODO: possibly we should check for resolvability here rather than in each handler, since
    // technically we could just abort here.

    // We only handle this if nothing is selected or if something is selected and multiselecting.
    if (event.ctrlKey && currentSelectedNodes) {
      // something is already selected and multiselecting
      // The pointer is not released yet, but it's safe to resolve now since ctrl+drag is not understood.
      return handleMultiSelectionWithExistingSelection(
        event,
        nodeResolutionSource,
        index,
        currentSelection,
        state,
      );
    }

    // If something is already selected, we don't want to clobber that, because user could be dragging.
    if (currentSelection) {
      return {
        ...state,
        pendingPointerDown: {
          pointerId: event.pointerId ?? null,
          pointer: event.pointer,
          ts: event.ts,
        },
      };
    }

    // If nothing is selected, we can safely go ahead and singly select something.
    return singlySelect(event, nodeResolutionSource, index, currentSelection, state);
  }

  if (event.type === "pointer_cancel" || event.type === "lost_pointer_capture") {
    return {
      ...state,
      pendingPointerDown: null,
    };
  }

  if (event.type === "pointer_up") {
    if (event.ctrlKey) {
      // If ctrl was pressed, we handled ctrl+click in pointer_down, so just finalize the event.
      return { ...state, pendingPointerDown: null };
    }

    const hit = resolveNodeAtPoint(event.pointer, nodeResolutionSource, index);

    // Clicking truly empty space clears selection.
    if (!hit.treeHitNodeId) {
      return { pendingPointerDown: null, lastCommittedClick: event, selection: null };
    }

    // Clicking non-selectable operator (e.g. +, =) does nothing.
    if (!hit.selectableNodeId) {
      return { ...state, pendingPointerDown: null, lastCommittedClick: event };
    }

    // Otherwise, we have might have something selected, but we want to select something new.
    // So we just select singly.
    return singlySelect(event, nodeResolutionSource, index, currentSelection, state);
  }

  throw new Error("Unhandled event type");
}

function singlySelect(
  event: PointerControllerEvent,
  nodeResolutionSource: NodeResolutionSource,
  index: ExprIndex,
  currentSelection: Selection,
  state: SelectionControllerState,
) {
  const resolvedAtPoint = resolveSelectableNodeAtPoint(event.pointer, nodeResolutionSource, index);
  const nextSelection =
    resolvedAtPoint !== null ? ({ kind: "single", nodeId: resolvedAtPoint } as Selection) : currentSelection;
  return {
    ...state,
    selection: nextSelection,
    pendingPointerDown: {
      pointerId: event.pointerId ?? null,
      pointer: event.pointer,
      ts: event.ts,
    },
  };
}

export function buildNodeResolutionSource(
  nodeRects: NodeRect[],
  index: ExprIndex | null,
): NodeResolutionSource {
  const rectById: Record<string, NodeRect> = {};
  for (const rect of nodeRects) {
    if (index && !index.nodeById[rect.nodeId]) {
      throw new Error(`selectionController received unknown rect nodeId ${rect.nodeId}`);
    }
    if (rectById[rect.nodeId]) {
      throw new Error(`selectionController received duplicate rect nodeId ${rect.nodeId}`);
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
export function captureGeometryFromMathdiv(mathDiv: HTMLElement | null): SelectionGeometry | null {
  if (!mathDiv) return null;
  const host = mathDiv as MathDivHost;
  const shadowRoot = host.shadowRoot;
  if (!shadowRoot) return null;

  const rect = mathDiv.getBoundingClientRect();
  const nodeRects = Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"))
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
