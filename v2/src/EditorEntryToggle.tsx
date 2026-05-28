import { useCallback, useMemo, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import { MathliveEditor } from "./MathliveEditor";
import type { EquationEditorRecordingHooks } from "./TestRecorder";
import { parseLatexToExpr } from "./math/adapters/latex";
import { compileMathDocument } from "./math/compile/compileMathDocument";

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
  const [entryError, setEntryError] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const canonicalLatexRef = useRef(latex);
  const entryLatexRef = useRef(latex);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const compiledDoc = useMemo(() => compileMathDocument(latex), [latex]);

  const updateMathFieldValue = (nextValue: string) => {
    const valueChanged = nextValue !== entryLatexRef.current;
    entryLatexRef.current = nextValue;
    if (valueChanged) setEntryError(null);
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
    const compiled = compileMathDocument(nextLatex);
    setLatex(compiled.plainLatex);
    entryLatexRef.current = compiled.plainLatex;
    canonicalLatexRef.current = compiled.plainLatex;
    setEquationHistory(createEquationHistory(compiled.plainLatex));
  };

  const handleAcceptToggle = (latestLatex?: unknown) => {
    if (!showMathDisplay) {
      const previousLatex = lastAcceptedLatexRef.current;
      // Accept should use the current MathLive edit buffer, not the last rendered canonical value.
      const nextLatex = typeof latestLatex === "string" ? latestLatex : latex;
      let acceptedLatex = nextLatex;
      try {
        parseLatexToExpr(nextLatex, { onError: "throw" });
        acceptedLatex = compileMathDocument(nextLatex).plainLatex;
      } catch (error) {
        entryLatexRef.current = nextLatex;
        setLatex(nextLatex);
        const message = error instanceof Error ? error.message : "Unable to parse LaTeX input.";
        setEntryError(
          message.includes("still contains placeholders")
            ? "Fill or remove every placeholder before accepting."
            : message,
        );
        return;
      }
      setEntryError(null);
      entryLatexRef.current = acceptedLatex;
      canonicalLatexRef.current = acceptedLatex;
      setEquationHistory(createEquationHistory(acceptedLatex));
      setLatex(acceptedLatex);
      onLatexAccepted({
        previousLatex,
        nextLatex: acceptedLatex,
      });
      lastAcceptedLatexRef.current = acceptedLatex;
    }
    setShowMathDisplay((prev) => !prev);
  };

  const handleCanonicalLatexChanged = useCallback((nextLatex: string) => {
    const previousLatex = canonicalLatexRef.current;
    const canonicalNextLatex = compileMathDocument(nextLatex).plainLatex;

    if (previousLatex !== canonicalNextLatex) {
      setEquationHistory((currentHistory) => {
        if (currentHistory.present.latex === canonicalNextLatex) return currentHistory;
        return {
          past: [...currentHistory.past, currentHistory.present],
          present: { latex: canonicalNextLatex },
          future: [],
        };
      });
    }
    canonicalLatexRef.current = canonicalNextLatex;
    entryLatexRef.current = canonicalNextLatex;
    setLatex(canonicalNextLatex);
    onCanonicalLatexChanged?.(canonicalNextLatex);
  }, [onCanonicalLatexChanged]);

  const handleUndoRequested = () => {
    const previousStep = equationHistory.past.at(-1);
    if (!previousStep) return;
    setEquationHistory({
      past: equationHistory.past.slice(0, -1),
      present: previousStep,
      future: [equationHistory.present, ...equationHistory.future],
    });
    canonicalLatexRef.current = previousStep.latex;
    entryLatexRef.current = previousStep.latex;
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
    entryLatexRef.current = nextStep.latex;
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
            compiledDoc={compiledDoc}
            recordingHooks={recordingHooks}
            canUndo={equationHistory.past.length > 0}
            onUndoRequested={handleUndoRequested}
            canRedo={equationHistory.future.length > 0}
            onRedoRequested={handleRedoRequested}
            // Needed so that we can show the mathlive again with the existing latex.
            onCanonicalLatexChanged={handleCanonicalLatexChanged}
          />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <MathliveEditor
              slotRef={slotRef}
              latex={latex}
              updateMathFieldValue={updateMathFieldValue}
              onAccept={handleAcceptToggle}
            />
            {entryError && (
              <div
                role="alert"
                style={{
                  color: "#ffb4ab",
                  fontSize: "0.9rem",
                  lineHeight: 1.35,
                }}
              >
                {entryError}
              </div>
            )}
          </div>
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
