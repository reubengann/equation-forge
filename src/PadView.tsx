import { useMemo, useState, type CSSProperties } from "react";
import { EquationRow } from "./EquationRow";
import {
  createDraftEquationRowState,
  createEquationHistory,
  type FunctionSymbolTag,
  type EquationHistory,
  type EquationMode,
  type EquationRowState,
} from "./EquationRowState";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import type { PadDefinitionSource } from "./substituteSuggestions";

const STORAGE_KEY = "physics-derivation-pad-equations";
const STORAGE_SCHEMA_VERSION = 1;
const materialSymbolStyle: CSSProperties = {
  fontVariationSettings: `"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24`,
  fontFamily: `"Material Symbols Rounded"`,
  fontWeight: "normal",
  fontStyle: "normal",
  fontSize: 21,
  lineHeight: 1,
  letterSpacing: "normal",
  textTransform: "none",
  display: "inline-block",
  whiteSpace: "nowrap",
  wordWrap: "normal",
  direction: "ltr",
  WebkitFontFeatureSettings: `"liga"`,
  WebkitFontSmoothing: "antialiased",
};
const sideControlStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "4px",
  border: "1px solid #575757",
  borderRadius: "6px",
  background: "rgba(255, 255, 255, 0.03)",
  alignItems: "center",
  alignSelf: "center",
};
const PAD_ICON_BUTTON_STYLE: CSSProperties = {
  width: "32px",
  height: "32px",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  border: "1px solid #757575",
  borderRadius: "6px",
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

type PadEquation = {
  id: string;
  state: EquationRowState;
};

type StoredPadEquation = {
  id: unknown;
  latex: unknown;
  functionSymbols?: unknown;
  history: unknown;
  mode: unknown;
};

type StoredPadState = {
  schemaVersion: unknown;
  equations: unknown;
};

type PadIconButtonProps = {
  label: string;
  icon: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
};

function PadIconButton({ label, icon, onClick, testId, disabled = false }: PadIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...PAD_ICON_BUTTON_STYLE,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={materialSymbolStyle} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

function createEquationId(): string {
  return `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyEquation(): PadEquation {
  return {
    id: createEquationId(),
    state: createDraftEquationRowState(String.raw`a+b=c`),
  };
}

function cloneEquationState(state: EquationRowState): EquationRowState {
  return {
    latex: state.latex,
    functionSymbols: state.functionSymbols.map((tag) => ({ ...tag })),
    mode: state.mode,
    history: {
      past: state.history.past.map((step) => ({
        ...step,
        functionSymbols: step.functionSymbols.map((tag) => ({ ...tag })),
      })),
      present: {
        ...state.history.present,
        functionSymbols: state.history.present.functionSymbols.map((tag) => ({ ...tag })),
      },
      future: state.history.future.map((step) => ({
        ...step,
        functionSymbols: step.functionSymbols.map((tag) => ({ ...tag })),
      })),
    },
  };
}

function duplicateEquation(equation: PadEquation): PadEquation {
  return {
    id: createEquationId(),
    state: cloneEquationState(equation.state),
  };
}

function parseFunctionSymbols(value: unknown): FunctionSymbolTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag) => {
    if (!tag || typeof tag !== "object") return [];
    const candidate = tag as Partial<FunctionSymbolTag>;
    if (typeof candidate.nodeId !== "string" || typeof candidate.name !== "string") return [];
    return [{ nodeId: candidate.nodeId, name: candidate.name }];
  });
}

function isHistory(value: unknown, fallbackLatex: string, fallbackFunctionSymbols: FunctionSymbolTag[]): EquationHistory {
  if (!value || typeof value !== "object") return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  const candidate = value as Partial<EquationHistory>;
  const present = candidate.present;
  if (!present || typeof present !== "object") return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  const presentLatex = present.latex;
  if (typeof presentLatex !== "string") return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  const past = Array.isArray(candidate.past)
    ? candidate.past.flatMap((step) =>
        typeof step?.latex === "string"
          ? [{ latex: step.latex, functionSymbols: parseFunctionSymbols(step.functionSymbols) }]
          : [],
      )
    : [];
  const future = Array.isArray(candidate.future)
    ? candidate.future.flatMap((step) =>
        typeof step?.latex === "string"
          ? [{ latex: step.latex, functionSymbols: parseFunctionSymbols(step.functionSymbols) }]
          : [],
      )
    : [];
  const presentFunctionSymbols = parseFunctionSymbols(present.functionSymbols);
  return {
    past,
    present: {
      latex: presentLatex,
      functionSymbols: presentFunctionSymbols.length ? presentFunctionSymbols : fallbackFunctionSymbols,
    },
    future,
  };
}

function parseStoredEquation(value: unknown, index: number): PadEquation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as StoredPadEquation;
  const latex = typeof candidate.latex === "string" ? candidate.latex : null;
  if (!latex) return null;
  const mode: EquationMode = candidate.mode === "display" ? "display" : "entry";
  const functionSymbols = parseFunctionSymbols(candidate.functionSymbols);
  const history = isHistory(candidate.history, latex, functionSymbols);
  return {
    id: typeof candidate.id === "string" ? candidate.id : `eq-restored-${index + 1}`,
    state: {
      latex,
      functionSymbols,
      history: {
        ...history,
        present: {
          ...history.present,
          functionSymbols,
        },
      },
      mode,
    },
  };
}

function loadPadEquations(): PadEquation[] {
  if (typeof window === "undefined") return [createEmptyEquation()];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createEmptyEquation()];
    const parsed = JSON.parse(raw) as StoredPadState;
    if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION || !Array.isArray(parsed.equations)) {
      return [createEmptyEquation()];
    }

    const equations = parsed.equations.flatMap((equation, index) => {
      const parsedEquation = parseStoredEquation(equation, index);
      return parsedEquation ? [parsedEquation] : [];
    });
    return equations.length > 0 ? equations : [createEmptyEquation()];
  } catch {
    return [createEmptyEquation()];
  }
}

function savePadEquations(equations: PadEquation[]) {
  if (typeof window === "undefined") return;
  const payload = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    equations: equations.map((equation) => ({
      id: equation.id,
      latex: equation.state.latex,
      functionSymbols: equation.state.functionSymbols,
      history: equation.state.history,
      mode: equation.state.mode,
    })),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function PadView() {
  const [equations, setEquations] = useState<PadEquation[]>(loadPadEquations);
  const [activeEquationId, setActiveEquationId] = useState<string | null>(() => equations[0]?.id ?? null);

  const compiledSourcesByEquationId = useMemo(() => {
    const sources = new Map<string, PadDefinitionSource>();
    equations.forEach((equation, index) => {
      if (equation.state.mode !== "display") return;
      try {
        sources.set(equation.id, {
          equationId: equation.id,
          label: `Equation ${index + 1}`,
          compiledDoc: compileMathDocument(equation.state.latex),
        });
      } catch {
        // Invalid stored/render state should not break the rest of the pad.
      }
    });
    return sources;
  }, [equations]);

  const updateEquations = (updater: (current: PadEquation[]) => PadEquation[]) => {
    setEquations((current) => {
      const next = updater(current);
      savePadEquations(next);
      return next;
    });
  };

  const addEquation = () => {
    const equation = createEmptyEquation();
    updateEquations((current) => [...current, equation]);
    setActiveEquationId(equation.id);
  };

  const removeEquation = (id: string) => {
    const next = equations.filter((equation) => equation.id !== id);
    const normalizedNext = next.length > 0 ? next : [createEmptyEquation()];
    const nextActiveId =
      activeEquationId === id || !normalizedNext.some((equation) => equation.id === activeEquationId)
        ? (normalizedNext[0]?.id ?? null)
        : activeEquationId;
    savePadEquations(normalizedNext);
    setEquations(normalizedNext);
    setActiveEquationId(nextActiveId);
  };

  const moveEquation = (id: string, offset: -1 | 1) => {
    updateEquations((current) => {
      const sourceIndex = current.findIndex((equation) => equation.id === id);
      const destinationIndex = sourceIndex + offset;
      if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= current.length) return current;

      const next = [...current];
      const [movedEquation] = next.splice(sourceIndex, 1);
      if (!movedEquation) return current;
      next.splice(destinationIndex, 0, movedEquation);
      return next;
    });
  };

  const duplicateEquationAfter = (id: string) => {
    const sourceEquation = equations.find((equation) => equation.id === id);
    if (!sourceEquation) return;
    const duplicatedEquation = duplicateEquation(sourceEquation);
    updateEquations((current) => {
      const sourceIndex = current.findIndex((equation) => equation.id === id);
      if (sourceIndex < 0) return current;

      const next = [...current];
      next.splice(sourceIndex + 1, 0, duplicatedEquation);
      return next;
    });
    setActiveEquationId(duplicatedEquation.id);
  };

  const duplicateEquationToEnd = (id: string) => {
    const sourceEquation = equations.find((equation) => equation.id === id);
    if (!sourceEquation) return;
    const duplicatedEquation = duplicateEquation(sourceEquation);
    updateEquations((current) =>
      current.some((equation) => equation.id === id) ? [...current, duplicatedEquation] : current,
    );
    setActiveEquationId(duplicatedEquation.id);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "stretch" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Pad</h1>
          <div style={{ fontSize: "0.9rem", opacity: 0.75 }}>
            Equations persist locally. Click an equation to make its shortcuts active.
          </div>
        </div>
        <button
          type="button"
          data-testid="add-pad-equation"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addEquation}
          style={{
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px 12px",
          }}
        >
          Add equation
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowX: "auto" }}>
        {equations.map((equation, index) => {
          const isActive = activeEquationId === equation.id;
          const isFirstEquation = index === 0;
          const isLastEquation = index === equations.length - 1;
          const definitionSources = [...compiledSourcesByEquationId.values()].filter(
            (source) => source.equationId !== equation.id,
          );
          return (
            <article
              key={equation.id}
              data-testid="pad-equation"
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                padding: "8px",
                border: `1px solid ${isActive ? "#7c4dff" : "#575757"}`,
                borderRadius: "6px",
                background: isActive ? "rgba(124, 77, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
                minWidth: "1200px",
              }}
            >
              <div
                style={sideControlStyle}
              >
                <PadIconButton
                  label="Move equation up"
                  icon="arrow_upward"
                  onClick={() => moveEquation(equation.id, -1)}
                  disabled={isFirstEquation}
                  testId="move-pad-equation-up"
                />
                <PadIconButton
                  label="Move equation down"
                  icon="arrow_downward"
                  onClick={() => moveEquation(equation.id, 1)}
                  disabled={isLastEquation}
                  testId="move-pad-equation-down"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <EquationRow
                  state={equation.state}
                  onStateChange={(rowUpdater) => {
                    updateEquations((current) =>
                      current.map((candidate) =>
                        candidate.id === equation.id
                          ? { ...candidate, state: rowUpdater(candidate.state) }
                          : candidate,
                      ),
                    );
                  }}
                  onActivate={() => setActiveEquationId(equation.id)}
                  isActive={isActive}
                  mathFieldId={`equation-mathfield-${equation.id}`}
                  substituteSuggestionSources={definitionSources}
                />
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "rgba(255, 255, 255, 0.62)",
                    padding: "2px 6px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.06)",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  ({index + 1})
                </span>
              </div>
              <div style={sideControlStyle}>
                <PadIconButton
                  label="Duplicate equation"
                  icon="content_copy"
                  onClick={() => duplicateEquationAfter(equation.id)}
                  testId="duplicate-pad-equation"
                />
                <PadIconButton
                  label="Duplicate equation to end"
                  icon="vertical_align_bottom"
                  onClick={() => duplicateEquationToEnd(equation.id)}
                  testId="duplicate-pad-equation-to-end"
                />
                <PadIconButton
                  label="Remove equation"
                  icon="delete"
                  onClick={() => removeEquation(equation.id)}
                  testId="remove-pad-equation"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
