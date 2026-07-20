import type { CompiledExprIndex as ExprIndex, Expr } from "../math/ast";
import type { TermSelection } from "../selection/types";
import { applyCtrlClickIntent, applyMarqueeSelectIntent } from "./multiSelectionController";

type MathDivHost = HTMLElement & { shadowRoot?: ShadowRoot | null };

type PointerLike = {
  x: number;
  y: number;
};

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
  suppressClickSelectionWhenDragging?: boolean;
};

type MarqueeSelectControllerEvent = {
  type: "marquee_select";
  marqueeRect: RectBounds;
};

type PointerControllerEvent = PointerDownControllerEvent | PointerUpControllerEvent;

export type SelectionControllerEvent =
  | PointerDownControllerEvent
  | PointerUpControllerEvent
  | MarqueeSelectControllerEvent
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

export const DRAG_PREVIEW_HIT_TEST_PADDING_PX = 10;
export const DRAG_COMMIT_THRESHOLD_PX = 6;
const NEARBY_RENDERED_GAP_HIT_TEST_MAX_HORIZONTAL_DISTANCE_PX = 40;

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
  selection: TermSelection | null;
  suppressSelectionOnNextPointerUp: boolean;
};

export function createSelectionControllerState(): SelectionControllerState {
  return {
    pendingPointerDown: null,
    lastCommittedClick: null,
    selection: null,
    suppressSelectionOnNextPointerUp: false,
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
export function selectionSet(selection: TermSelection | null): Set<string> {
  if (!selection) return new Set();
  if (selection.kind === "single") return new Set([selection.nodeId]);
  return new Set(selection.nodeIds);
}

export function selectionNodeIds(selection: TermSelection | null): string[] {
  if (!selection) return [];
  if (selection.kind === "single") return [selection.nodeId];
  return [...selection.nodeIds];
}

function containsPoint(rect: NodeRect, point: PointerLike): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function containsPointWithPadding(rect: NodeRect, point: PointerLike, paddingPx: number): boolean {
  return (
    point.x >= rect.left - paddingPx &&
    point.x <= rect.right + paddingPx &&
    point.y >= rect.top - paddingPx &&
    point.y <= rect.bottom + paddingPx
  );
}

export function rectFromPoints(a: PointerLike, b: PointerLike): RectBounds {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function rectsOverlap(a: RectBounds, b: RectBounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function rectContainsRect(container: RectBounds, item: RectBounds): boolean {
  return (
    container.left <= item.left &&
    container.right >= item.right &&
    container.top <= item.top &&
    container.bottom >= item.bottom
  );
}

function distanceToRect(rect: NodeRect, point: PointerLike): number {
  const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
  const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

function horizontalDistanceToRect(rect: NodeRect, point: PointerLike): number {
  return point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
}

function containsPointVertically(rect: NodeRect, point: PointerLike): boolean {
  return point.y >= rect.top && point.y <= rect.bottom;
}

function distanceBetweenPoints(a: PointerLike, b: PointerLike): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shouldEscalateFromChildToParent(parentExpr: Expr | undefined): boolean {
  if (!parentExpr) return false;
  switch (parentExpr.kind) {
    case "primed":
    case "dotted_expr":
    case "negate":
    case "hat":
    case "vector":
    case "special_font":
    case "partial_derivative":
    case "differential":
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

// Nodes that cannot be directly selected by a click may still be valid
// expansion targets for double-click tree promotion.
function isDoubleClickSelectableNode(expr: Expr | undefined): boolean {
  if (!expr) return false;
  if (isDirectlySelectableNode(expr)) return true;
  switch (expr.kind) {
    case "add":
      return true;
    default:
      return false;
  }
}

function walkUpToDirectlySelectableNode(nodeId: string | null, index: ExprIndex): string | null {
  if (!nodeId) return null;
  let cursor: string | null = nodeId;
  while (cursor) {
    const parentId: string | null = index.parentById[cursor] ?? null;
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

function walkUpToDoubleClickSelectableNode(nodeId: string | null, index: ExprIndex): string | null {
  if (!nodeId) return null;
  let cursor: string | null = nodeId;
  while (cursor) {
    if (isDoubleClickSelectableNode(index.nodeById[cursor])) {
      return cursor;
    }
    cursor = index.parentById[cursor] ?? null;
  }
  return null;
}

// Starting at the root, do a depth-first search of the tree to find the lowest node containing the point.
function pickNodeIdAtPointFromTree(
  nodeResolution: NodeResolutionSource,
  point: PointerLike,
  index: ExprIndex,
  paddingPx = 0,
): string | null {
  const descend = (nodeId: string): string | null => {
    const nodeRect = nodeResolution.rectById[nodeId];
    const containsSelf =
      !!nodeRect &&
      (paddingPx > 0 ? containsPointWithPadding(nodeRect, point, paddingPx) : containsPoint(nodeRect, point));
    const children = index.childrenById[nodeId] ?? [];
    for (const childId of children) {
      const hit = descend(childId);
      if (hit) return hit;
    }
    return containsSelf ? nodeId : null;
  };

  const treeHit = descend(index.rootId);
  if (treeHit || paddingPx > 0) return treeHit;

  return pickNearestNodeIdNearRenderedGap(nodeResolution, point, index);
}

function pickNearestNodeIdNearRenderedGap(
  nodeResolution: NodeResolutionSource,
  point: PointerLike,
  index: ExprIndex,
): string | null {
  let best: { nodeId: string; distance: number; horizontalDistance: number; area: number } | null = null;
  for (const rect of nodeResolution.nodeRects) {
    if (!containsPointVertically(rect, point)) continue;
    const horizontalDistance = horizontalDistanceToRect(rect, point);
    if (horizontalDistance > NEARBY_RENDERED_GAP_HIT_TEST_MAX_HORIZONTAL_DISTANCE_PX) continue;

    const distance = horizontalDistance;
    const area = rect.width * rect.height;
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && horizontalDistance < best.horizontalDistance) ||
      (distance === best.distance && horizontalDistance === best.horizontalDistance && area < best.area)
    ) {
      best = { nodeId: rect.nodeId, distance, horizontalDistance, area };
    }
  }

  return best ? deepestHitNodeIdAtPoint(best.nodeId, point, nodeResolution, index) : null;
}

function deepestHitNodeIdAtPoint(
  nodeId: string,
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
): string {
  const children = index.childrenById[nodeId] ?? [];
  for (const childId of children) {
    const childRect = nodeResolution.rectById[childId];
    if (childRect && containsPoint(childRect, point)) {
      return deepestHitNodeIdAtPoint(childId, point, nodeResolution, index);
    }
  }
  return nodeId;
}

export function resolveSelectableNodeAtPoint(
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
  paddingPx = 0,
): string | null {
  const exactHit = pickNodeIdAtPointFromTree(nodeResolution, point, index);
  const exactSelectableNodeId = walkUpToDirectlySelectableNode(exactHit, index);
  if (exactSelectableNodeId || paddingPx <= 0) return exactSelectableNodeId;

  let best: { nodeId: string; distance: number; area: number } | null = null;
  for (const rect of nodeResolution.nodeRects) {
    if (!containsPointWithPadding(rect, point, paddingPx)) continue;
    const selectableNodeId = walkUpToDirectlySelectableNode(rect.nodeId, index);
    if (!selectableNodeId) continue;
    const selectableRect = nodeResolution.rectById[selectableNodeId] ?? rect;
    const distance = distanceToRect(selectableRect, point);
    const area = selectableRect.width * selectableRect.height;
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && area < best.area)
    ) {
      best = { nodeId: selectableNodeId, distance, area };
    }
  }
  return best?.nodeId ?? null;
}

export function resolveNodeAtPoint(
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
): { treeHitNodeId: string | null; selectableNodeId: string | null } {
  const treeHitNodeId = pickNodeIdAtPointFromTree(nodeResolution, point, index);
  return {
    treeHitNodeId,
    selectableNodeId: walkUpToDirectlySelectableNode(treeHitNodeId, index),
  };
}

function normalizeDestinationNodeForMove(
  nodeId: string,
  index: ExprIndex,
  moveType: "additive" | "multiplicative",
): string {
  if (moveType !== "additive") return nodeId;

  let cursor: string | null = nodeId;
  while (cursor) {
    const parentId: string | null = index.parentById[cursor] ?? null;
    const parent = parentId ? index.nodeById[parentId] : null;
    if (parent?.kind === "add") return cursor;
    cursor = parentId;
  }
  return nodeId;
}

export function resolveMoveDestinationNodeAtPoint(
  point: PointerLike,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
  moveType: "additive" | "multiplicative",
  paddingPx = 0,
): string | null {
  const resolvedNodeId = resolveSelectableNodeAtPoint(point, nodeResolution, index, paddingPx);
  return resolvedNodeId ? normalizeDestinationNodeForMove(resolvedNodeId, index, moveType) : null;
}

export function resolveMarqueeNodeIds(
  marqueeRect: RectBounds,
  nodeResolution: NodeResolutionSource,
  index: ExprIndex,
): string[] {
  const candidateIds = new Set(
    nodeResolution.nodeRects
      .filter((rect) => rectsOverlap(rect, marqueeRect))
      .map((rect) => rect.nodeId),
  );

  const selectedIds: string[] = [];
  const visit = (nodeId: string): boolean => {
    const parentId = index.parentById[nodeId] ?? null;
    const parent = parentId ? index.nodeById[parentId] : null;
    const expr = index.nodeById[nodeId];
    const nodeRect = nodeResolution.rectById[nodeId];
    const isFullyMarqueed = !!nodeRect && rectContainsRect(marqueeRect, nodeRect);
    const shouldKeepWholeAdditiveTerm =
      parent?.kind === "add" && isFullyMarqueed && hasDisplayGroupContainerChild(nodeId, index);
    const shouldPreferParent =
      (parent?.kind === "add" || parent?.kind === "multiply" || parent?.kind === "negate") &&
      !isDisplayGroupAroundContainer(expr) &&
      (!hasDisplayGroupContainerChild(nodeId, index) || shouldKeepWholeAdditiveTerm);
    if (shouldPreferParent && candidateIds.has(nodeId) && isDirectlySelectableNode(expr)) {
      selectedIds.push(nodeId);
      return true;
    }

    const children = index.childrenById[nodeId] ?? [];
    let selectedChild = false;
    for (const childId of children) {
      selectedChild = visit(childId) || selectedChild;
    }
    if (selectedChild) return true;
    if (candidateIds.has(nodeId) && isDirectlySelectableNode(index.nodeById[nodeId])) {
      selectedIds.push(nodeId);
      return true;
    }
    return false;
  };

  visit(index.rootId);
  return selectedIds;
}

function isDisplayGroupAroundContainer(expr: Expr | undefined): boolean {
  return expr?.kind === "display_group" && (expr.expression.kind === "add" || expr.expression.kind === "multiply");
}

function hasDisplayGroupContainerChild(nodeId: string, index: ExprIndex): boolean {
  return (index.childrenById[nodeId] ?? []).some((childId) => isDisplayGroupAroundContainer(index.nodeById[childId]));
}

type SelectionControllerInputs = {
  event: SelectionControllerEvent;
  currentSelection: TermSelection | null;
  nodeResolutionSource: NodeResolutionSource;
  index: ExprIndex | null;
  state: SelectionControllerState;
};

function handleMultiSelectionWithExistingSelection(
  event: PointerDownControllerEvent,
  nodeResolutionSource: NodeResolutionSource,
  index: ExprIndex,
  currentSelection: TermSelection | null,
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

function handleDoubleClick(
  event: PointerDownControllerEvent,
  nodeResolutionSource: NodeResolutionSource,
  index: ExprIndex,
  currentSelection: TermSelection | null,
  state: SelectionControllerState,
): SelectionControllerState {
  const hit = resolveNodeAtPoint(event.pointer, nodeResolutionSource, index);

  // Second click is over a non-selectable node, possibly double-clicking in blank space?
  if (!hit.selectableNodeId) {
    return { ...state, pendingPointerDown: null };
  }

  // A double-click promotes to the node above it. Note that selectability is not constrained in the
  // same way as a click. We _can_ select a sum, for example.
  const nextSelectableParent = (nodeId: string): string | null => {
    const parentId = index.parentById[nodeId] ?? null;
    return walkUpToDoubleClickSelectableNode(parentId, index);
  };

  // Now we need to resolve how the current selection is updated. If a single item is selected,
  // we promote to the parent. But if multiple items are selected, and we're double-clicking on
  // one of those items, we need to remove that item from the multiselection and add its parent instead.
  const isDescendantOf = (nodeId: string, ancestorId: string): boolean => {
    let cursor: string | null = nodeId;
    while (cursor) {
      if (cursor === ancestorId) return true;
      cursor = index.parentById[cursor] ?? null;
    }
    return false;
  };

  if (!currentSelection) {
    return singlySelect(event, nodeResolutionSource, index, currentSelection, state);
  }

  if (currentSelection.kind === "single") {
    const promoted = nextSelectableParent(currentSelection.nodeId);
    if (!promoted) return { ...state, pendingPointerDown: null };
    return {
      ...state,
      selection: { kind: "single", nodeId: promoted },
      pendingPointerDown: null,
      suppressSelectionOnNextPointerUp: true,
    };
  }

  const hitNodeId = hit.selectableNodeId;
  if (!currentSelection.nodeIds.includes(hitNodeId)) {
    return { ...state, pendingPointerDown: null };
  }

  const promoted = nextSelectableParent(hitNodeId);
  if (!promoted) return { ...state, pendingPointerDown: null };

  if (currentSelection.containerNodeId && !isDescendantOf(promoted, currentSelection.containerNodeId)) {
    return { ...state, pendingPointerDown: null };
  }

  const nextNodeIds = Array.from(
    new Set(currentSelection.nodeIds.map((id) => (id === hitNodeId ? promoted : id))),
  );
  if (nextNodeIds.length === 1) {
    return {
      ...state,
      selection: { kind: "single", nodeId: nextNodeIds[0] },
      pendingPointerDown: null,
      suppressSelectionOnNextPointerUp: true,
    };
  }

  return {
    ...state,
    selection: { ...currentSelection, nodeIds: nextNodeIds },
    pendingPointerDown: null,
    suppressSelectionOnNextPointerUp: true,
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
  if (!index) {
    return { ...state, pendingPointerDown: null };
  }

  if (event.type === "marquee_select") {
    const nodeIds = resolveMarqueeNodeIds(event.marqueeRect, nodeResolutionSource, index);
    const decision = applyMarqueeSelectIntent({
      nodeIds,
      currentSelection,
      index,
    });
    return {
      ...state,
      selection: decision.accepted ? decision.nextSelection : currentSelection,
      pendingPointerDown: null,
      suppressSelectionOnNextPointerUp: false,
      lastCommittedClick: null,
    };
  }

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

    // Check for double-click
    if (
      event.ts - (state.lastCommittedClick?.ts ?? 0) <
      DEFAULT_SELECTION_CONTROLLER_CONFIG.doubleClickWindowMs
    ) {
      return handleDoubleClick(event, nodeResolutionSource, index, currentSelection, state);
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
    // We handled the double-click already, so just bail
    if (state.suppressSelectionOnNextPointerUp) {
      return {
        ...state,
        pendingPointerDown: null,
        suppressSelectionOnNextPointerUp: false,
        lastCommittedClick: { pointer: event.pointer, ts: event.ts },
      };
    }

    if (event.ctrlKey) {
      // If ctrl was pressed, we handled ctrl+click in pointer_down, so just finalize the event.
      return { ...state, pendingPointerDown: null };
    }

    const pointerMovedFarEnoughToDrag =
      !!state.pendingPointerDown &&
      distanceBetweenPoints(state.pendingPointerDown.pointer, event.pointer) >=
        DEFAULT_SELECTION_CONTROLLER_CONFIG.dragThresholdPx;
    if (event.suppressClickSelectionWhenDragging && pointerMovedFarEnoughToDrag) {
      return {
        ...state,
        pendingPointerDown: null,
        suppressSelectionOnNextPointerUp: false,
      };
    }

    const hit = resolveNodeAtPoint(event.pointer, nodeResolutionSource, index);

    // Clicking truly empty space clears selection.
    if (!hit.treeHitNodeId) {
      return {
        pendingPointerDown: null,
        lastCommittedClick: event,
        selection: null,
        suppressSelectionOnNextPointerUp: false,
      };
    }

    // Clicking non-selectable operator (e.g. +, =) does nothing.
    if (!hit.selectableNodeId) {
      return { ...state, pendingPointerDown: null, lastCommittedClick: event };
    }

    // Otherwise, we have might have something selected, but we want to select something new.
    // So we just select singly.
    return {
      ...singlySelect(event, nodeResolutionSource, index, currentSelection, state),
      lastCommittedClick: { pointer: event.pointer, ts: event.ts },
      suppressSelectionOnNextPointerUp: false,
    };
  }

  throw new Error("Unhandled event type");
}

function singlySelect(
  event: PointerControllerEvent,
  nodeResolutionSource: NodeResolutionSource,
  index: ExprIndex,
  currentSelection: TermSelection | null,
  state: SelectionControllerState,
) {
  const resolvedAtPoint = resolveSelectableNodeAtPoint(event.pointer, nodeResolutionSource, index);
  const nextSelection =
    resolvedAtPoint !== null
      ? ({ kind: "single", nodeId: resolvedAtPoint } as TermSelection)
      : currentSelection;
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
      throw new Error(formatUnknownRectNodeIdError(rect.nodeId, nodeRects, index));
    }
    if (rectById[rect.nodeId]) {
      throw new Error(`selectionController received duplicate rect nodeId ${rect.nodeId}`);
    }
    rectById[rect.nodeId] = rect;
  }
  return { nodeRects, rectById };
}

function formatUnknownRectNodeIdError(
  nodeId: string,
  nodeRects: NodeRect[],
  index: ExprIndex,
): string {
  const rectNodeIds = nodeRects.map((rect) => rect.nodeId);
  const indexNodeIds = Object.keys(index.nodeById);
  const unknownRectNodeIds = rectNodeIds.filter((rectNodeId) => !index.nodeById[rectNodeId]);
  return [
    `Selection geometry includes node id ${nodeId}, but the compiled expression does not contain it.`,
    "This usually means the DOM snapshot/rect cache is stale for the current LaTeX or compiled AST.",
    `Unknown rect ids: ${formatIdList(unknownRectNodeIds)}.`,
    `Compiled ids: ${formatIdList(indexNodeIds)}.`,
    `Rect ids: ${formatIdList(rectNodeIds)}.`,
  ].join(" ");
}

function formatIdList(ids: string[]): string {
  const maxIdsToShow = 12;
  if (ids.length <= maxIdsToShow) return ids.join(", ") || "(none)";
  return `${ids.slice(0, maxIdsToShow).join(", ")} ... (${ids.length} total)`;
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
