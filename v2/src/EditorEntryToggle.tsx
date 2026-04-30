import { MathfieldElement } from "mathlive";
import {
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EquationEditor } from "./EquationEditor";
import {
  collectNodeRectsFromMathDiv,
  resolveSelectionGeometry,
  resolveSelectedNodeIdFromEvent,
  type SelectionGeometry,
} from "./interaction/selectionController";
import { exprToLatex } from "./math/adapters/latex/exprToLatex";
import { parseLatexToExpr } from "./math/adapters/latex/parseLatexToExpr";
import { MathliveEditor } from "./MathliveEditor";

MathfieldElement.fontsDirectory = "/fonts";

type PointerEventPayload = {
  x: number;
  y: number;
  domSnapshot: SelectionGeometry | null;
  pointerType: string;
  button: number;
  buttons: number;
};

type RawPointerEventPayload = {
  x: number;
  y: number;
  pointerType: string;
  button: number;
  buttons: number;
};

type EditorEntryToggleProps = {
  selectedNodeId: string | null;
  onSelectionChanged: (nodeId: string | null) => void;
  onLatexAccepted: (payload: {
    previousLatex: string | null;
    nextLatex: string;
  }) => void;
  onNodeClick: (nodeId: string | null, clickCount: number) => void;
  onPointerDownEvent: (payload: PointerEventPayload) => void;
  onPointerUpEvent: (payload: PointerEventPayload) => void;
  onDomSnapshotObserved: (payload: PointerEventPayload["domSnapshot"]) => void;
};

export function EditorEntryToggle({
  selectedNodeId,
  onSelectionChanged,
  onLatexAccepted,
  onNodeClick,
  onPointerDownEvent,
  onPointerUpEvent,
  onDomSnapshotObserved,
}: EditorEntryToggleProps) {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const mathDivRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const parsedExpr = useMemo(() => parseLatexToExpr(latex), [latex]);
  const plainLatex = useMemo(
    () => exprToLatex(parsedExpr, false),
    [parsedExpr],
  );
  const taggedLatex = useMemo(
    () => exprToLatex(parsedExpr, true),
    [parsedExpr],
  );

  useEffect(() => {
    if (!showMathDisplay) return;
    const mathDiv = mathDivRef.current as
      | (HTMLElement & { value?: string; render?: () => void })
      | null;
    if (!mathDiv) return;
    // Render AST-generated tagged latex so every serializable node has a stable id.
    mathDiv.setAttribute("virtual-keyboard-mode", "off");
    mathDiv.value = taggedLatex;
    mathDiv.textContent = taggedLatex;
    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 4;
    const captureSnapshotWhenReady = () => {
      attempts += 1;
      const snapshot = resolveSelectionGeometry(mathDivRef.current);
      const hasRenderableDom =
        !!snapshot &&
        snapshot.hostRect.height > 0 &&
        snapshot.nodeRects.length > 0;
      if (hasRenderableDom || attempts >= maxAttempts) {
        onDomSnapshotObserved(snapshot);
        return;
      }
      rafId = requestAnimationFrame(captureSnapshotWhenReady);
    };
    rafId = requestAnimationFrame(captureSnapshotWhenReady);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [showMathDisplay, taggedLatex, onDomSnapshotObserved]);

  const updateMathFieldValue = (event: SyntheticEvent<HTMLElement>) => {
    const nextValue =
      (event.currentTarget as HTMLElement & { value?: string }).value ?? "";
    setLatex(nextValue);
  };

  const handlePointerDown = (payload: RawPointerEventPayload) => {
    const nodeRects = collectNodeRectsFromMathDiv(mathDivRef.current);
    const nodeId = resolveSelectedNodeIdFromEvent(
      null,
      { type: "pointer_down", pointer: { x: payload.x, y: payload.y } },
      nodeRects,
    );
    const domSnapshot = resolveSelectionGeometry(mathDivRef.current);
    onPointerDownEvent({
      ...payload,
      domSnapshot,
    });
    onSelectionChanged(nodeId);
  };

  const handlePointerUp = (payload: RawPointerEventPayload) => {
    const domSnapshot = resolveSelectionGeometry(mathDivRef.current);
    onPointerUpEvent({
      ...payload,
      domSnapshot,
    });
  };

  const handleNodeClick = (payload: {
    x: number;
    y: number;
    clickCount: number;
  }) => {
    const nodeRects = collectNodeRectsFromMathDiv(mathDivRef.current);
    const nodeId = resolveSelectedNodeIdFromEvent(
      null,
      { type: "pointer_down", pointer: { x: payload.x, y: payload.y } },
      nodeRects,
    );
    onNodeClick(nodeId, payload.clickCount);
    onSelectionChanged(nodeId);
  };

  const handleAcceptToggle = () => {
    if (!showMathDisplay) {
      const previousLatex = lastAcceptedLatexRef.current;
      setLatex(plainLatex);
      onLatexAccepted({
        previousLatex,
        nextLatex: plainLatex,
      });
      lastAcceptedLatexRef.current = plainLatex;
    }
    setShowMathDisplay((prev) => !prev);
  };

  return (
    <section
      className="equation-editor"
      style={{
        maxWidth: "760px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-start",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        {showMathDisplay ? (
          <EquationEditor
            mathDivRef={mathDivRef}
            latex={taggedLatex}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            onPointerDownEvent={handlePointerDown}
            onPointerUpEvent={handlePointerUp}
          />
        ) : (
          <MathliveEditor
            slotRef={slotRef}
            latex={latex}
            updateMathFieldValue={updateMathFieldValue}
          />
        )}
        <button
          type="button"
          data-testid="accept-equation"
          onClick={handleAcceptToggle}
          style={{
            width: "40px",
            height: "40px",
            alignSelf: "center",
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px",
          }}
        >
          {showMathDisplay ? "Edit" : "✓"}
        </button>
      </div>
    </section>
  );
}

export default EditorEntryToggle;
