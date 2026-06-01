import { useMemo, useState } from "react";
import {
  EquationRow,
  createDraftEquationRowState,
  createEquationHistory,
  type EquationHistory,
  type EquationMode,
  type EquationRowState,
} from "./EquationRow";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import type { PadDefinitionSource } from "./substituteSuggestions";

const STORAGE_KEY = "v2-pad-equations";
const STORAGE_SCHEMA_VERSION = 1;

type PadEquation = {
  id: string;
  state: EquationRowState;
};

type StoredPadEquation = {
  id: unknown;
  latex: unknown;
  history: unknown;
  mode: unknown;
};

type StoredPadState = {
  schemaVersion: unknown;
  equations: unknown;
};

function createEquationId(): string {
  return `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyEquation(): PadEquation {
  return {
    id: createEquationId(),
    state: createDraftEquationRowState(String.raw`a+b=c`),
  };
}

function isHistory(value: unknown, fallbackLatex: string): EquationHistory {
  if (!value || typeof value !== "object") return createEquationHistory(fallbackLatex);
  const candidate = value as Partial<EquationHistory>;
  const presentLatex = candidate.present?.latex;
  if (typeof presentLatex !== "string") return createEquationHistory(fallbackLatex);
  const past = Array.isArray(candidate.past)
    ? candidate.past.flatMap((step) => (typeof step?.latex === "string" ? [{ latex: step.latex }] : []))
    : [];
  const future = Array.isArray(candidate.future)
    ? candidate.future.flatMap((step) => (typeof step?.latex === "string" ? [{ latex: step.latex }] : []))
    : [];
  return {
    past,
    present: { latex: presentLatex },
    future,
  };
}

function parseStoredEquation(value: unknown, index: number): PadEquation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as StoredPadEquation;
  const latex = typeof candidate.latex === "string" ? candidate.latex : null;
  if (!latex) return null;
  const mode: EquationMode = candidate.mode === "display" ? "display" : "entry";
  return {
    id: typeof candidate.id === "string" ? candidate.id : `eq-restored-${index + 1}`,
    state: {
      latex,
      history: isHistory(candidate.history, latex),
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

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {equations.map((equation, index) => {
          const isActive = activeEquationId === equation.id;
          const definitionSources = [...compiledSourcesByEquationId.values()].filter(
            (source) => source.equationId !== equation.id,
          );
          return (
            <article
              key={equation.id}
              data-testid="pad-equation"
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "stretch",
                padding: "12px",
                border: `1px solid ${isActive ? "#7c4dff" : "#575757"}`,
                borderRadius: "6px",
                background: isActive ? "rgba(124, 77, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
              }}
            >
              <div
                style={{
                  minWidth: "72px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "stretch",
                }}
              >
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>#{index + 1}</div>
                <button
                  type="button"
                  data-testid="remove-pad-equation"
                  onClick={() => removeEquation(equation.id)}
                  style={{
                    boxSizing: "border-box",
                    border: "1px solid #757575",
                    borderRadius: "3px",
                    background: "#424242",
                    color: "rgba(255, 255, 255, 0.87)",
                    padding: "6px 8px",
                  }}
                >
                  Remove
                </button>
              </div>
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
                substituteSuggestionSources={definitionSources}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
