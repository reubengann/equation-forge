import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NodeRect,
  resolveSelectionGeometry,
  resolveSelectedNodeIdFromEvent,
} from "./interaction/selectionController";
import {
  compileMathDocument,
  resolveCompiledNodeId,
} from "./math/compile/compileMathDocument";
import type { EquationEditorRecordingHooks } from "./TestRecorder";

type EquationEditorProps = {
  latex: string;
  onSelectionChanged: (nodeId: string | null) => void;
  onCanonicalLatexChanged: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EquationEditor({
  latex,
  onSelectionChanged,
  onCanonicalLatexChanged,
  recordingHooks,
}: EquationEditorProps) {
  const mathDivRef = useRef<HTMLElement | null>(null);
  const nodeRectsRef = useRef<NodeRect[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const lastSelectedNodeIdRef = useRef<string | null>(null);
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
    mathDiv.setAttribute("virtual-keyboard-mode", "off");
    mathDiv.value = compiledDoc.taggedLatex;
    mathDiv.textContent = compiledDoc.taggedLatex;

    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 4;
    const captureSnapshotWhenReady = () => {
      attempts += 1;
      const snapshot = resolveSelectionGeometry(mathDivRef.current);
      nodeRectsRef.current = snapshot?.nodeRects ?? [];
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

  const resolveSelectedNodeAtPoint = (x: number, y: number): string | null => {
    const rawNodeId = resolveSelectedNodeIdFromEvent(
      null,
      { type: "pointer_down", pointer: { x, y } },
      nodeRectsRef.current,
    );
    return resolveCompiledNodeId(compiledDoc, rawNodeId);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const nextSelectedNodeId = resolveSelectedNodeAtPoint(
      event.clientX,
      event.clientY,
    );
    if (lastSelectedNodeIdRef.current !== nextSelectedNodeId) {
      lastSelectedNodeIdRef.current = nextSelectedNodeId;
      setSelectedNodeId(nextSelectedNodeId);
      onSelectionChanged(nextSelectedNodeId);
    }
    recordingHooks?.onPointerDownEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    recordingHooks?.onPointerUpEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
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
