import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  type NodeRect,
  captureGeometryFromMathdiv,
  resolveSelectionFromEvent,
  type SelectionControllerEvent,
} from "./interaction/selectionController";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import type { EquationEditorRecordingHooks } from "./TestRecorder";

type EquationEditorProps = {
  latex: string;
  onCanonicalLatexChanged: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EquationEditor({
  latex,
  onCanonicalLatexChanged,
  recordingHooks,
}: EquationEditorProps) {
  const mathDivRef = useRef<HTMLElement | null>(null);
  const nodeRectsRef = useRef<NodeRect[]>([]);
  const nodeResolutionRef = useRef<NodeResolutionSource>(
    buildNodeResolutionSource([], null),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const lastSelectedNodeIdRef = useRef<string | null>(null);
  const selectionStateRef = useRef(createSelectionControllerState());
  const snapshotCounterRef = useRef(0);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const currentDomSnapshotIdRef = useRef<string | null>(null);
  const compiledDoc = useMemo(() => compileMathDocument(latex), [latex]);

  useEffect(() => {
    onCanonicalLatexChanged(compiledDoc.plainLatex);
  }, [compiledDoc, onCanonicalLatexChanged]);

  useEffect(() => {
    const mathDiv = mathDivRef.current as
      | (HTMLElement & { value?: string; render?: () => void })
      | null;
    if (!mathDiv) return;
    mathDiv.value = compiledDoc.taggedLatex;
    mathDiv.textContent = compiledDoc.taggedLatex;

    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 4;
    const captureSnapshotWhenReady = () => {
      attempts += 1;
      const snapshot = captureGeometryFromMathdiv(mathDivRef.current);
      nodeRectsRef.current = snapshot?.nodeRects ?? [];
      nodeResolutionRef.current = buildNodeResolutionSource(
        nodeRectsRef.current,
        compiledDoc.index,
      );
      const hasRenderableDom =
        !!snapshot &&
        snapshot.hostRect.height > 0 &&
        snapshot.nodeRects.length > 0;
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
    const host = mathDivRef.current as
      | (HTMLElement & { shadowRoot?: ShadowRoot | null })
      | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) return;

    const els = Array.from(
      shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"),
    );
    for (const el of els) {
      const nodeId = el.dataset.nodeId;
      const isSelected = !!selectedNodeId && nodeId === selectedNodeId;
      el.style.color = isSelected ? "#ff9800" : "";
    }
  }, [latex, selectedNodeId]);

  const applySelectionEvent = (event: SelectionControllerEvent) => {
    const result = resolveSelectionFromEvent({
      event,
      nodeResolution: nodeResolutionRef.current,
      index: compiledDoc.index,
      state: selectionStateRef.current,
    });
    selectionStateRef.current = result;
    const nextSelectedNodeId = result.selectedNodeId;
    if (lastSelectedNodeIdRef.current !== nextSelectedNodeId) {
      lastSelectedNodeIdRef.current = nextSelectedNodeId;
      setSelectedNodeId(nextSelectedNodeId);
      recordingHooks?.onSelectionChanged?.(nextSelectedNodeId);
    }
  };

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

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    applySelectionEvent({
      type: "pointer_cancel",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
  };

  const onLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    applySelectionEvent({
      type: "lost_pointer_capture",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      style={{
        flex: 1,
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
    </div>
  );
}
