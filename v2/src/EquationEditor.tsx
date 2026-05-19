import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  type NodeRect,
  captureGeometryFromMathdiv,
  DRAG_PREVIEW_HIT_TEST_PADDING_PX,
  resolveSelectableNodeAtPoint,
  resolveSelectionFromEvent,
  type SelectionControllerEvent,
  selectionSet,
} from "./interaction/selectionController";
import { type TermSelection } from "./selection/types";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import { canExecuteMove, executeMove } from "./math/rewrite/rewriteEngine";
import type { InsertionPreview, MoveType, NodeHorizontalBounds } from "./math/rewrite/types";
import type { EquationEditorRecordingHooks } from "./TestRecorder";

type InsertionLineStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const INSERTION_SLOT_RIGHT_OF_CENTER_MARGIN_PX = 8;

const modeIconButtonBaseStyle: CSSProperties = {
  width: 36,
  height: 36,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "#757575",
  borderRightColor: "#757575",
  borderBottomColor: "#757575",
  borderLeftColor: "#757575",
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

const modeIconButtonActiveStyle: CSSProperties = {
  borderTopColor: "#7c4dff",
  borderRightColor: "#7c4dff",
  borderBottomColor: "#7c4dff",
  borderLeftColor: "#7c4dff",
  color: "#7c4dff",
  background: "rgba(124, 77, 255, 0.14)",
  boxShadow: "0 0 0 1px rgba(124, 77, 255, 0.3)",
};

function resolveHorizontalInsertionSlot(pointerX: number, rect: NodeHorizontalBounds) {
  const centerX = (rect.left + rect.right) / 2;
  return pointerX >= centerX + INSERTION_SLOT_RIGHT_OF_CENTER_MARGIN_PX ? "after" : "before";
}

type EquationEditorProps = {
  latex: string;
  onCanonicalLatexChanged: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EquationEditor({ latex, onCanonicalLatexChanged, recordingHooks }: EquationEditorProps) {
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const mathDivRef = useRef<HTMLElement | null>(null);
  const nodeRectsRef = useRef<NodeRect[]>([]);
  const nodeResolutionRef = useRef<NodeResolutionSource>(buildNodeResolutionSource([], null));
  const [selection, setSelection] = useState<TermSelection | null>(null);
  const [moveType, setMoveType] = useState<MoveType>("additive");
  const [insertionPreview, setInsertionPreview] = useState<InsertionPreview | null>(null);
  const insertionPreviewRef = useRef<InsertionPreview | null>(null);
  const [insertionLineStyle, setInsertionLineStyle] = useState<InsertionLineStyle | null>(null);
  const lastSelectionKeyRef = useRef<string>("null");
  const selectionStateRef = useRef(createSelectionControllerState());
  const lastDragEngineQueryKeyRef = useRef<string | null>(null);
  const snapshotCounterRef = useRef(0);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const currentDomSnapshotIdRef = useRef<string | null>(null);
  const compiledDoc = useMemo(() => compileMathDocument(latex), [latex]);

  useEffect(() => {
    onCanonicalLatexChanged(compiledDoc.plainLatex);
  }, [compiledDoc, onCanonicalLatexChanged]);

  useEffect(() => {
    recordingHooks?.onMoveTypeChanged(moveType);
  }, [moveType, recordingHooks]);

  useEffect(() => {
    const mathDiv = mathDivRef.current as (HTMLElement & { value?: string; render?: () => void }) | null;
    if (!mathDiv) return;
    mathDiv.value = compiledDoc.taggedLatex;
    mathDiv.setAttribute("value", compiledDoc.taggedLatex);
    mathDiv.textContent = compiledDoc.taggedLatex;
    mathDiv.render?.();

    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 4;
    const captureSnapshotWhenReady = () => {
      attempts += 1;
      const snapshot = captureGeometryFromMathdiv(mathDivRef.current);
      nodeRectsRef.current = snapshot?.nodeRects ?? [];
      nodeResolutionRef.current = buildNodeResolutionSource(nodeRectsRef.current, compiledDoc.index);
      const hasRenderableDom = !!snapshot && snapshot.hostRect.height > 0 && snapshot.nodeRects.length > 0;
      if (hasRenderableDom || attempts >= maxAttempts) {
        if (!snapshot) {
          lastSnapshotKeyRef.current = null;
          currentDomSnapshotIdRef.current = null;
          recordingHooks?.onDomSnapshotObserved?.({
            domSnapshotId: null,
            domSnapshot: null,
          });
          return;
        }

        const snapshotKey = JSON.stringify(snapshot);
        if (snapshotKey !== lastSnapshotKeyRef.current) {
          snapshotCounterRef.current += 1;
          currentDomSnapshotIdRef.current = `s${snapshotCounterRef.current}`;
          lastSnapshotKeyRef.current = snapshotKey;
        }

        recordingHooks?.onDomSnapshotObserved?.({
          domSnapshotId: currentDomSnapshotIdRef.current,
          domSnapshot: snapshot,
        });
        return;
      }
      rafId = requestAnimationFrame(captureSnapshotWhenReady);
    };
    rafId = requestAnimationFrame(captureSnapshotWhenReady);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [compiledDoc, recordingHooks]);

  useEffect(() => {
    const host = mathDivRef.current as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) return;

    const els = Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"));
    const selectedNodeIds = selectionSet(selection);
    for (const el of els) {
      const nodeId = el.dataset.nodeId;
      const isSelected = !!nodeId && selectedNodeIds.has(nodeId);
      el.style.color = isSelected ? "#ff9800" : "";
      el.style.outline = "";
    }
  }, [latex, selection]);

  useEffect(() => {
    if (!insertionPreview) {
      setInsertionLineStyle(null);
      return;
    }

    const destinationRect = nodeResolutionRef.current.rectById[insertionPreview.destinationId];
    const containerRect = nodeResolutionRef.current.rectById[insertionPreview.containerId];
    const editorRootRect = editorRootRef.current?.getBoundingClientRect();
    if (!destinationRect || !containerRect || !editorRootRect) {
      setInsertionLineStyle(null);
      return;
    }

    if (insertionPreview.lineOrientation === "vertical") {
      const x = insertionPreview.destinationSlot === "after" ? destinationRect.right : destinationRect.left;
      setInsertionLineStyle({
        left: x - editorRootRect.left - 1,
        top: containerRect.top - editorRootRect.top,
        width: 2,
        height: containerRect.height,
      });
      return;
    }

    const y = insertionPreview.destinationSlot === "after" ? destinationRect.bottom : destinationRect.top;
    setInsertionLineStyle({
      left: containerRect.left - editorRootRect.left,
      top: y - editorRootRect.top - 1,
      width: containerRect.width,
      height: 2,
    });
  }, [insertionPreview]);

  useEffect(() => {
    // Any AST refresh invalidates cached drag evaluation.
    lastDragEngineQueryKeyRef.current = null;
    insertionPreviewRef.current = null;
    setInsertionPreview(null);
    setInsertionLineStyle(null);
    recordingHooks?.onPreviewChanged?.(null);
  }, [compiledDoc, moveType]);

  const applySelectionEvent = (event: SelectionControllerEvent) => {
    const result = resolveSelectionFromEvent({
      event,
      currentSelection: selection,
      nodeResolutionSource: nodeResolutionRef.current,
      index: compiledDoc.index,
      state: selectionStateRef.current,
    });
    selectionStateRef.current = result;
    const nextSelection = result.selection;
    const nextSelectionKey = JSON.stringify(nextSelection);
    if (lastSelectionKeyRef.current !== nextSelectionKey) {
      lastSelectionKeyRef.current = nextSelectionKey;
      setSelection(nextSelection);
      recordingHooks?.onSelectionChanged?.(nextSelection);
    }
  };

  const updateInsertionPreview = (preview: InsertionPreview | null) => {
    insertionPreviewRef.current = preview;
    setInsertionPreview(preview);
    recordingHooks?.onPreviewChanged?.(preview);
  };

  const updateMoveType = (nextMoveType: MoveType) => {
    if (moveType === nextMoveType) return;
    setMoveType(nextMoveType);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      setMoveType((currentMoveType) =>
        currentMoveType === "additive" ? "multiplicative" : "additive",
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    applySelectionEvent({
      type: "pointer_down",
      pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      ts: event.timeStamp,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
    recordingHooks?.onPointerDownEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const previewToApply = insertionPreviewRef.current;
    if (selection?.kind === "single" && previewToApply) {
      const moveResult = executeMove({
        document: compiledDoc,
        selection,
        destinationId: previewToApply.destinationId,
        moveType,
        destinationSlot: previewToApply.destinationSlot,
      });
      if (moveResult) {
        onCanonicalLatexChanged(moveResult.latex);
      }
    }

    applySelectionEvent({
      type: "pointer_up",
      pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      ts: event.timeStamp,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
    recordingHooks?.onPointerUpEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selection || selection.kind !== "single") return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;

    const destinationId = resolveSelectableNodeAtPoint(
      { x: event.clientX, y: event.clientY },
      nodeResolutionRef.current,
      compiledDoc.index,
      DRAG_PREVIEW_HIT_TEST_PADDING_PX,
    );
    if (!destinationId || destinationId === selection.nodeId) {
      lastDragEngineQueryKeyRef.current = null;
      updateInsertionPreview(null);
      return;
    }

    const sourceParentId = compiledDoc.index.parentById[selection.nodeId];
    const destinationParentId = compiledDoc.index.parentById[destinationId];
    if (!sourceParentId || sourceParentId !== destinationParentId) {
      lastDragEngineQueryKeyRef.current = null;
      updateInsertionPreview(null);
      return;
    }

    const rectById: Record<string, NodeHorizontalBounds> = {};
    for (const [nodeId, rect] of Object.entries(nodeResolutionRef.current.rectById)) {
      rectById[nodeId] = { left: rect.left, right: rect.right };
    }

    const destinationRect = rectById[destinationId];
    if (!destinationRect) {
      lastDragEngineQueryKeyRef.current = null;
      updateInsertionPreview(null);
      return;
    }

    const destinationSlot = resolveHorizontalInsertionSlot(event.clientX, destinationRect);
    const queryKey = `${selection.nodeId}|${destinationId}|${moveType}|${destinationSlot}`;
    if (queryKey === lastDragEngineQueryKeyRef.current) return;
    lastDragEngineQueryKeyRef.current = queryKey;
    recordingHooks?.onPointerMoveEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });

    const preview = canExecuteMove({
      document: compiledDoc,
      selection,
      destinationId,
      moveType,
      destinationSlot,
    });
    updateInsertionPreview(preview);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    applySelectionEvent({
      type: "pointer_cancel",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
  };

  const onLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    applySelectionEvent({
      type: "lost_pointer_capture",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        role="group"
        aria-label="Move mode"
        style={{
          alignSelf: "flex-start",
          display: "flex",
          border: "1px solid #757575",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          data-testid="move-mode-additive"
          aria-label="Additive move mode"
          title="Additive move mode"
          aria-pressed={moveType === "additive"}
          onClick={() => updateMoveType("additive")}
          style={{
            ...modeIconButtonBaseStyle,
            ...(moveType === "additive" ? modeIconButtonActiveStyle : {}),
            borderRightWidth: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M11 4a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"
            />
          </svg>
        </button>
        <button
          type="button"
          data-testid="move-mode-multiplicative"
          aria-label="Multiplicative move mode"
          title="Multiplicative move mode"
          aria-pressed={moveType === "multiplicative"}
          onClick={() => updateMoveType("multiplicative")}
          style={{
            ...modeIconButtonBaseStyle,
            ...(moveType === "multiplicative" ? modeIconButtonActiveStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6z"
            />
          </svg>
        </button>
      </div>
      <div
        ref={editorRootRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        style={{
          flex: 1,
          position: "relative",
          boxSizing: "border-box",
          borderRadius: "3px",
          color: "rgba(255, 255, 255, 1.0)",
          padding: "16px",
          textAlign: "left",
          display: "flex",
        }}
      >
        <math-div
          ref={mathDivRef}
          data-testid="math-div-output"
          mode="displaystyle"
          value={compiledDoc.taggedLatex}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
          }}
        />
        {insertionPreview && insertionLineStyle && (
          <div
            data-testid="insertion-preview-line"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none",
              background: "#4caf50",
              borderRadius: "1px",
              zIndex: 1,
              transform: `translate(${insertionLineStyle.left}px, ${insertionLineStyle.top}px)`,
              width: `${insertionLineStyle.width}px`,
              height: `${insertionLineStyle.height}px`,
            }}
          />
        )}
      </div>
    </div>
  );
}
