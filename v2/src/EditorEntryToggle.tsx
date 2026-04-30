import { MathfieldElement } from "mathlive";
import { type SyntheticEvent, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import type {
  DomSnapshotObservedPayload,
  PointerEventPayload,
} from "./interaction/selectionController";
import { MathliveEditor } from "./MathliveEditor";

MathfieldElement.fontsDirectory = "/fonts";

type EditorEntryToggleProps = {
  selectedNodeId: string | null;
  onSelectionChanged: (nodeId: string | null) => void;
  onLatexAccepted: (payload: {
    previousLatex: string | null;
    nextLatex: string;
  }) => void;
  onPointerDownEvent: (payload: PointerEventPayload) => void;
  onPointerUpEvent: (payload: PointerEventPayload) => void;
  onDomSnapshotObserved: (payload: DomSnapshotObservedPayload) => void;
};

export function EditorEntryToggle({
  selectedNodeId,
  onSelectionChanged,
  onLatexAccepted,
  onPointerDownEvent,
  onPointerUpEvent,
  onDomSnapshotObserved,
}: EditorEntryToggleProps) {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const canonicalLatexRef = useRef(latex);
  const slotRef = useRef<HTMLDivElement | null>(null);

  const updateMathFieldValue = (event: SyntheticEvent<HTMLElement>) => {
    const nextValue =
      (event.currentTarget as HTMLElement & { value?: string }).value ?? "";
    setLatex(nextValue);
  };

  const handleAcceptToggle = () => {
    if (!showMathDisplay) {
      const previousLatex = lastAcceptedLatexRef.current;
      const nextLatex = canonicalLatexRef.current;
      setLatex(nextLatex);
      onLatexAccepted({
        previousLatex,
        nextLatex,
      });
      lastAcceptedLatexRef.current = nextLatex;
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
            latex={latex}
            selectedNodeId={selectedNodeId}
            onSelectionChanged={onSelectionChanged}
            onPointerDownEvent={onPointerDownEvent}
            onPointerUpEvent={onPointerUpEvent}
            onDomSnapshotObserved={onDomSnapshotObserved}
            onCanonicalLatexChanged={(nextLatex) => {
              canonicalLatexRef.current = nextLatex;
            }}
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
