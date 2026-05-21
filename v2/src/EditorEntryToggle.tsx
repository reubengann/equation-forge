import { type SyntheticEvent, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import { MathliveEditor } from "./MathliveEditor";
import type { EquationEditorRecordingHooks } from "./TestRecorder";

const DEBUG_EQUATION_PRESETS = [
  String.raw`a+b=c`,
  String.raw`\frac{a}{b}+c`,
  String.raw`\int_0^1 x^2\,dx`,
  String.raw`\frac{\partial s}{\partial T}`,
  String.raw`F=ma`,
];

type EditorEntryToggleProps = {
  onLatexAccepted: (payload: {
    previousLatex: string | null;
    nextLatex: string;
  }) => void;
  onCanonicalLatexChanged?: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

type EquationHistoryStep = {
  latex: string;
};

type EquationHistory = {
  past: EquationHistoryStep[];
  present: EquationHistoryStep;
  future: EquationHistoryStep[];
};

function createEquationHistory(latex: string): EquationHistory {
  return {
    past: [],
    present: { latex },
    future: [],
  };
}

export function EditorEntryToggle({
  onLatexAccepted,
  onCanonicalLatexChanged,
  recordingHooks,
}: EditorEntryToggleProps) {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [equationHistory, setEquationHistory] = useState<EquationHistory>(() => createEquationHistory(latex));
  const [presetIndex, setPresetIndex] = useState(0);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const canonicalLatexRef = useRef(latex);
  const skipNextCanonicalHistoryRef = useRef(false);
  const slotRef = useRef<HTMLDivElement | null>(null);

  const updateMathFieldValue = (event: SyntheticEvent<HTMLElement>) => {
    const nextValue =
      (event.currentTarget as HTMLElement & { value?: string }).value ?? "";
    setLatex(nextValue);
    const matchedPresetIndex = DEBUG_EQUATION_PRESETS.indexOf(nextValue);
    if (matchedPresetIndex >= 0) {
      setPresetIndex(matchedPresetIndex);
    }
  };

  const applyPresetByOffset = (offset: number) => {
    const presetCount = DEBUG_EQUATION_PRESETS.length;
    const normalizedIndex =
      (presetIndex + offset + presetCount) % presetCount;
    const nextLatex = DEBUG_EQUATION_PRESETS[normalizedIndex];
    setPresetIndex(normalizedIndex);
    setLatex(nextLatex);
    canonicalLatexRef.current = nextLatex;
    setEquationHistory(createEquationHistory(nextLatex));
  };

  const handleAcceptToggle = () => {
    if (!showMathDisplay) {
      const previousLatex = lastAcceptedLatexRef.current;
      // Accept should use the current MathLive edit buffer, not the last rendered canonical value.
      const nextLatex = latex;
      canonicalLatexRef.current = nextLatex;
      setEquationHistory(createEquationHistory(nextLatex));
      skipNextCanonicalHistoryRef.current = true;
      setLatex(nextLatex);
      onLatexAccepted({
        previousLatex,
        nextLatex,
      });
      lastAcceptedLatexRef.current = nextLatex;
    }
    setShowMathDisplay((prev) => !prev);
  };

  const handleCanonicalLatexChanged = (nextLatex: string) => {
    const previousLatex = canonicalLatexRef.current;
    const shouldSkipHistory = skipNextCanonicalHistoryRef.current;
    skipNextCanonicalHistoryRef.current = false;
    if (previousLatex !== nextLatex && !shouldSkipHistory) {
      setEquationHistory((currentHistory) => ({
        past: [...currentHistory.past, currentHistory.present],
        present: { latex: nextLatex },
        future: [],
      }));
    } else if (previousLatex !== nextLatex) {
      setEquationHistory(createEquationHistory(nextLatex));
    }
    canonicalLatexRef.current = nextLatex;
    setLatex(nextLatex);
    onCanonicalLatexChanged?.(nextLatex);
  };

  const handleUndoRequested = () => {
    const previousStep = equationHistory.past.at(-1);
    if (!previousStep) return;
    setEquationHistory({
      past: equationHistory.past.slice(0, -1),
      present: previousStep,
      future: [equationHistory.present, ...equationHistory.future],
    });
    canonicalLatexRef.current = previousStep.latex;
    setLatex(previousStep.latex);
    onCanonicalLatexChanged?.(previousStep.latex);
  };

  const handleRedoRequested = () => {
    const nextStep = equationHistory.future[0];
    if (!nextStep) return;
    setEquationHistory({
      past: [...equationHistory.past, equationHistory.present],
      present: nextStep,
      future: equationHistory.future.slice(1),
    });
    canonicalLatexRef.current = nextStep.latex;
    setLatex(nextStep.latex);
    onCanonicalLatexChanged?.(nextStep.latex);
  };

  return (
    <section
      className="equation-editor"
      style={{
        width: "100%",
        maxWidth: "1000px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        alignItems: "stretch",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          gap: "8px",
          alignItems: "stretch",
        }}
      >
        {showMathDisplay ? (
          <EquationEditor
            latex={latex}
            recordingHooks={recordingHooks}
            canUndo={equationHistory.past.length > 0}
            onUndoRequested={handleUndoRequested}
            canRedo={equationHistory.future.length > 0}
            onRedoRequested={handleRedoRequested}
            // Needed so that we can show the mathlive again with the existing latex.
            onCanonicalLatexChanged={handleCanonicalLatexChanged}
          />
        ) : (
          <MathliveEditor
            slotRef={slotRef}
            latex={latex}
            updateMathFieldValue={updateMathFieldValue}
            onAccept={handleAcceptToggle}
          />
        )}
        {!showMathDisplay && (
          <>
            <button
              type="button"
              data-testid="preset-prev-equation"
              onClick={() => applyPresetByOffset(-1)}
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
              {"<"}
            </button>
            <button
              type="button"
              data-testid="preset-next-equation"
              onClick={() => applyPresetByOffset(1)}
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
              {">"}
            </button>
          </>
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
