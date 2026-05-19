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
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EditorEntryToggle({
  onLatexAccepted,
  recordingHooks,
}: EditorEntryToggleProps) {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [presetIndex, setPresetIndex] = useState(0);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const canonicalLatexRef = useRef(latex);
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
  };

  const handleAcceptToggle = () => {
    if (!showMathDisplay) {
      const previousLatex = lastAcceptedLatexRef.current;
      // Accept should use the current MathLive edit buffer, not the last rendered canonical value.
      const nextLatex = latex;
      canonicalLatexRef.current = nextLatex;
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
            recordingHooks={recordingHooks}
            // Needed so that we can show the mathlive again with the existing latex.
            onCanonicalLatexChanged={(nextLatex) => {
              const previousLatex = canonicalLatexRef.current;
              canonicalLatexRef.current = nextLatex;
              setLatex(nextLatex);
              if (previousLatex !== nextLatex) {
                onLatexAccepted({
                  previousLatex,
                  nextLatex,
                });
              }
            }}
          />
        ) : (
          <MathliveEditor
            slotRef={slotRef}
            latex={latex}
            updateMathFieldValue={updateMathFieldValue}
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
