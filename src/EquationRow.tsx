import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import { MathliveEditor } from "./MathliveEditor";
import type { EquationEntryCommands } from "./MathEntry";
import type { EquationEditorRecordingHooks } from "./EquationEditorRecordingHooks";
import {
  coerceLatexForExpressionParser,
  parseLatexToExpr,
} from "@equation-forge/core/latex";
import {
  applyFunctionSymbolSemantics,
  compileMathDocument,
  compileMathDocumentFromExpr,
  pruneFunctionSymbols,
  remapFunctionSymbols,
} from "@equation-forge/core/compile";
import {
  appendEquationHistoryStep,
  createEquationHistory,
  type EquationMode,
  type EquationRowState,
} from "./EquationRowState";
import type { PadDefinitionSource } from "./substituteSuggestions";

export type EquationRowCommands = EquationEntryCommands;

export type EquationRowProps = {
  state: EquationRowState;
  onStateChange: (updater: (current: EquationRowState) => EquationRowState) => void;
  onLatexAccepted?: (payload: {
    previousLatex: string | null;
    nextLatex: string;
  }) => void;
  onCanonicalLatexChanged?: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
  presets?: string[];
  isActive?: boolean;
  onActivate?: () => void;
  mathFieldId?: string;
  substituteSuggestionSources?: PadDefinitionSource[];
  wrapEquationCopiesInDisplayMath?: boolean;
  showAcceptButton?: boolean;
};

function acceptButtonLabel(mode: EquationMode) {
  return mode === "display" ? "Edit" : "✓";
}

const equationBodyMinHeight = "150px";

export const EquationRow = forwardRef<EquationRowCommands, EquationRowProps>(function EquationRow({
  state,
  onStateChange,
  onLatexAccepted,
  onCanonicalLatexChanged,
  recordingHooks,
  presets,
  isActive = true,
  onActivate,
  mathFieldId,
  substituteSuggestionSources = [],
  wrapEquationCopiesInDisplayMath = false,
  showAcceptButton = true,
}, ref) {
  const [entryError, setEntryError] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const lastAcceptedLatexRef = useRef<string | null>(null);
  const entryFocusSessionRef = useRef(0);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const entryCommandsRef = useRef<EquationEntryCommands | null>(null);
  const compiledDoc = useMemo(() => {
    try {
      return compileMathDocument(state.latex);
    } catch {
      return null;
    }
  }, [state.latex]);
  const prunedFunctionSymbols = useMemo(
    () => (compiledDoc ? pruneFunctionSymbols(compiledDoc, state.functionSymbols) : []),
    [compiledDoc, state.functionSymbols],
  );
  const semanticCompiledDoc = useMemo(() => {
    if (!compiledDoc) return null;
    const semanticExpr = applyFunctionSymbolSemantics(compiledDoc, prunedFunctionSymbols);
    return compileMathDocumentFromExpr(compiledDoc.sourceLatex, semanticExpr);
  }, [compiledDoc, prunedFunctionSymbols]);
  const displayCompiledDoc = semanticCompiledDoc ?? compiledDoc;
  const equationHistoryLatexes = useMemo(
    () => [
      ...state.history.past.map((step) => step.latex),
      state.history.present.latex,
      ...state.history.future.map((step) => step.latex),
    ],
    [state.history],
  );

  const updateMathFieldValue = (nextValue: string) => {
    const valueChanged = nextValue !== state.latex;
    if (valueChanged) setEntryError(null);
    onStateChange((current) => ({ ...current, latex: nextValue }));
    if (presets) {
      const matchedPresetIndex = presets.indexOf(nextValue);
      if (matchedPresetIndex >= 0) setPresetIndex(matchedPresetIndex);
    }
  };

  const applyPresetByOffset = (offset: number) => {
    if (!presets || presets.length === 0) return;
    const normalizedIndex = (presetIndex + offset + presets.length) % presets.length;
    const nextLatex = presets[normalizedIndex];
    const compiled = compileMathDocument(nextLatex);
    setPresetIndex(normalizedIndex);
    onStateChange(() => ({
      latex: compiled.plainLatex,
      functionSymbols: [],
      history: createEquationHistory(compiled.plainLatex),
      mode: state.mode,
    }));
  };

  const handleAcceptToggle = useCallback(
    (latestLatex?: unknown) => {
      if (state.mode === "entry") {
        const previousLatex = lastAcceptedLatexRef.current;
        const rawLatex = typeof latestLatex === "string" ? latestLatex : state.latex;
        const nextLatex = coerceLatexForExpressionParser(rawLatex).latex;
        let acceptedLatex = nextLatex;
        let acceptedDocument;
        try {
          parseLatexToExpr(nextLatex, { onError: "throw" });
          acceptedDocument = compileMathDocument(nextLatex);
          acceptedLatex = acceptedDocument.plainLatex;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to parse LaTeX input.";
          onStateChange((current) => ({ ...current, latex: nextLatex }));
          setEntryError(
            message.includes("still contains placeholders")
              ? "Fill or remove every placeholder before accepting."
              : message,
          );
          return;
        }
        const nextFunctionSymbols =
          compiledDoc && acceptedDocument
            ? remapFunctionSymbols(compiledDoc, acceptedDocument, state.functionSymbols)
            : [];
        setEntryError(null);
        onStateChange((current) => ({
          ...current,
          latex: acceptedLatex,
          functionSymbols: nextFunctionSymbols,
          history: appendEquationHistoryStep(current.history, acceptedLatex, nextFunctionSymbols),
          mode: "display",
        }));
        onLatexAccepted?.({
          previousLatex,
          nextLatex: acceptedLatex,
        });
        lastAcceptedLatexRef.current = acceptedLatex;
        return;
      }

      entryFocusSessionRef.current += 1;
      onStateChange((current) => ({ ...current, mode: "entry" }));
    },
    [compiledDoc, onLatexAccepted, onStateChange, state.functionSymbols, state.latex, state.mode],
  );

  const handleCanonicalLatexChanged = useCallback(
    (nextLatex: string) => {
      const canonicalNextLatex = compileMathDocument(nextLatex).plainLatex;
      const nextDocument = compileMathDocument(canonicalNextLatex);
      onStateChange((current) => {
        const previousLatex = current.history.present.latex;
        const previousDocument = compileMathDocument(previousLatex);
        const nextFunctionSymbols = remapFunctionSymbols(previousDocument, nextDocument, current.functionSymbols);
        return {
          ...current,
          latex: canonicalNextLatex,
          functionSymbols: nextFunctionSymbols,
          history: appendEquationHistoryStep(current.history, canonicalNextLatex, nextFunctionSymbols),
        };
      });
      onCanonicalLatexChanged?.(canonicalNextLatex);
    },
    [onCanonicalLatexChanged, onStateChange],
  );

  const handleUndoRequested = () => {
    const previousStep = state.history.past.at(-1);
    if (!previousStep) return;
    onStateChange((current) => ({
      ...current,
      latex: previousStep.latex,
      functionSymbols: previousStep.functionSymbols,
      history: {
        past: current.history.past.slice(0, -1),
        present: previousStep,
        future: [current.history.present, ...current.history.future],
      },
    }));
    onCanonicalLatexChanged?.(previousStep.latex);
  };

  const handleRedoRequested = () => {
    const nextStep = state.history.future[0];
    if (!nextStep) return;
    onStateChange((current) => ({
      ...current,
      latex: nextStep.latex,
      functionSymbols: nextStep.functionSymbols,
      history: {
        past: [...current.history.past, current.history.present],
        present: nextStep,
        future: current.history.future.slice(1),
      },
    }));
    onCanonicalLatexChanged?.(nextStep.latex);
  };

  const handleEditRequested = useCallback(() => {
    entryFocusSessionRef.current += 1;
    onStateChange((current) => ({ ...current, mode: "entry" }));
  }, [onStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      insertLatex: (latexToInsert: string) => {
        if (state.mode === "entry" && entryCommandsRef.current) {
          entryCommandsRef.current.insertLatex(latexToInsert);
          return;
        }

        entryFocusSessionRef.current += 1;
        setEntryError(null);
        onStateChange((current) => ({
          ...current,
          latex: `${current.latex}${latexToInsert}`,
          mode: "entry",
        }));
      },
      replaceEntryLatex: (nextLatex: string) => {
        if (state.mode === "entry" && entryCommandsRef.current) {
          entryCommandsRef.current.replaceEntryLatex(nextLatex);
          return;
        }

        entryFocusSessionRef.current += 1;
        setEntryError(null);
        onStateChange((current) => ({ ...current, latex: nextLatex, mode: "entry" }));
      },
      acceptEntry: () => {
        if (state.mode === "entry" && entryCommandsRef.current) {
          entryCommandsRef.current.acceptEntry();
          return;
        }
        if (state.mode === "entry") handleAcceptToggle();
      },
      focusEntry: () => {
        if (state.mode === "entry" && entryCommandsRef.current) {
          entryCommandsRef.current.focusEntry();
          return;
        }

        entryFocusSessionRef.current += 1;
        onStateChange((current) => ({ ...current, mode: "entry" }));
      },
    }),
    [handleAcceptToggle, onStateChange, state.mode],
  );

  return (
    <section
      className="equation-editor"
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      style={{
        flex: "1 1 0",
        width: "100%",
        minWidth: 0,
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
          minWidth: 0,
          display: "flex",
          gap: "8px",
          alignItems: "stretch",
        }}
      >
        {state.mode === "display" ? (
          displayCompiledDoc ? (
            <EquationEditor
              compiledDoc={displayCompiledDoc}
              functionSymbols={prunedFunctionSymbols}
              onFunctionSymbolsChanged={(nextFunctionSymbols) => {
                onStateChange((current) => ({
                  ...current,
                  functionSymbols: nextFunctionSymbols,
                  history: {
                    ...current.history,
                    present: {
                      ...current.history.present,
                      functionSymbols: nextFunctionSymbols,
                    },
                  },
                }));
              }}
              recordingHooks={recordingHooks}
              canUndo={state.history.past.length > 0}
              onUndoRequested={handleUndoRequested}
              canRedo={state.history.future.length > 0}
              onRedoRequested={handleRedoRequested}
              onEditRequested={handleEditRequested}
              onCanonicalLatexChanged={handleCanonicalLatexChanged}
              isActive={isActive}
              substituteSuggestionSources={substituteSuggestionSources}
              wrapEquationCopiesInDisplayMath={wrapEquationCopiesInDisplayMath}
              equationHistoryLatexes={equationHistoryLatexes}
            />
          ) : (
            <div role="alert" style={{ flex: 1, color: "#ffb4ab", alignSelf: "center" }}>
              Unable to render this equation. Edit it to fix the LaTeX.
            </div>
          )
        ) : (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              minHeight: equationBodyMinHeight,
            }}
          >
            <MathliveEditor
              slotRef={slotRef}
              latex={state.latex}
              updateMathFieldValue={updateMathFieldValue}
              onAccept={handleAcceptToggle}
              entryCommandRef={entryCommandsRef}
              autoFocus
              focusAtEnd
              focusSession={entryFocusSessionRef.current}
              mathFieldId={mathFieldId}
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
        {state.mode === "entry" && presets && (
          <>
            <button
              type="button"
              data-testid="preset-prev-equation"
              onMouseDown={(event) => event.preventDefault()}
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
              onMouseDown={(event) => event.preventDefault()}
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
        {showAcceptButton && (
          <button
            type="button"
            data-testid="accept-equation"
            title={state.mode === "display" ? "Edit (E)" : "Accept"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAcceptToggle()}
            style={{
              width: "40px",
              height: "40px",
              flexShrink: 0,
              alignSelf: "center",
              boxSizing: "border-box",
              border: "1px solid #757575",
              borderRadius: "3px",
              background: "#424242",
              color: "rgba(255, 255, 255, 0.87)",
              padding: "8px",
            }}
          >
            {acceptButtonLabel(state.mode)}
          </button>
        )}
      </div>
    </section>
  );
});
