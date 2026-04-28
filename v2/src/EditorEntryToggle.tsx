import { MathfieldElement } from "mathlive";
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import { MathliveEditor } from "./MathliveEditor";
import { buildTaggedLatex } from "./taggedLatex";

MathfieldElement.fontsDirectory = "/fonts";

type PointerEventPayload = {
  nodeId: string | null;
  x: number;
  y: number;
  pointerType: string;
  button: number;
  buttons: number;
};

type EditorEntryToggleProps = {
  recordedEventCount: number;
  onSelectionChanged: (payload: {
    previousNodeId: string | null;
    nextNodeId: string | null;
  }) => void;
  onNodeClick: (nodeId: string | null, clickCount: number) => void;
  onPointerDownEvent: (payload: PointerEventPayload) => void;
  onPointerUpEvent: (payload: PointerEventPayload) => void;
};

export function EditorEntryToggle({
  recordedEventCount,
  onSelectionChanged,
  onNodeClick,
  onPointerDownEvent,
  onPointerUpEvent,
}: EditorEntryToggleProps) {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const mathDivRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const tagged = useMemo(() => buildTaggedLatex(latex), [latex]);

  useEffect(() => {
    if (!showMathDisplay) return;
    const mathDiv = mathDivRef.current as
      | (HTMLElement & { value?: string; render?: () => void })
      | null;
    if (!mathDiv) return;
    // Render tagged latex so each shallow piece gets data-node-id markup.
    mathDiv.setAttribute("virtual-keyboard-mode", "off");
    mathDiv.value = tagged.taggedLatex;
    mathDiv.textContent = tagged.taggedLatex;
  }, [showMathDisplay, tagged.taggedLatex]);

  const updateMathFieldValue = (event: SyntheticEvent<HTMLElement>) => {
    const nextValue =
      (event.currentTarget as HTMLElement & { value?: string }).value ?? "";
    setLatex(nextValue);
  };

  const handleSelectionChange = (nextNodeId: string | null) => {
    setSelectedNodeId((prevNodeId) => {
      onSelectionChanged({
        previousNodeId: prevNodeId,
        nextNodeId,
      });
      return nextNodeId;
    });
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
            slotRef={slotRef}
            mathDivRef={mathDivRef}
            latex={tagged.taggedLatex}
            selectedNodeId={selectedNodeId}
            onSelectionChange={handleSelectionChange}
            onNodeClick={onNodeClick}
            onPointerDownEvent={onPointerDownEvent}
            onPointerUpEvent={onPointerUpEvent}
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
          onClick={() => setShowMathDisplay((prev) => !prev)}
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
      <div
        style={{
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.72)",
        }}
        data-testid="recorded-event-count"
      >
        Recorded events: {recordedEventCount}
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.72)",
        }}
        data-testid="selected-node-id"
      >
        Selected node: {selectedNodeId ?? "none"}
      </div>
    </section>
  );
}

export default EditorEntryToggle;
