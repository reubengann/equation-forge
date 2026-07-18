import {
  createDraftEquationRowState,
  createEquationHistory,
  type EquationHistory,
  type EquationMode,
  type EquationRowState,
  type FunctionSymbolTag,
} from "../EquationRowState";

export const PAD_STORAGE_SCHEMA_VERSION = 1;
export const DEFAULT_PAD_EQUATION_LATEX = String.raw`a+b=c`;

export type PadEquation = {
  id: string;
  state: EquationRowState;
};

export type PadDocument = {
  equations: PadEquation[];
};

export type SerializedPadEquation = {
  id: string;
  latex: string;
  functionSymbols: FunctionSymbolTag[];
  history: EquationHistory;
  mode: EquationMode;
};

export type SerializedPadState = {
  schemaVersion: typeof PAD_STORAGE_SCHEMA_VERSION;
  equations: SerializedPadEquation[];
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

export function createEquationId(): string {
  return `eq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyPadEquation(): PadEquation {
  return {
    id: createEquationId(),
    state: createDraftEquationRowState(DEFAULT_PAD_EQUATION_LATEX),
  };
}

export function createDefaultPadDocument(): PadDocument {
  return { equations: [createEmptyPadEquation()] };
}

export function duplicatePadEquation(equation: PadEquation): PadEquation {
  const functionSymbols = equation.state.functionSymbols.map((tag) => ({ ...tag }));
  return {
    id: createEquationId(),
    state: {
      latex: equation.state.latex,
      functionSymbols,
      mode: equation.state.mode,
      history: createEquationHistory(equation.state.latex, functionSymbols),
    },
  };
}

export function normalizePadEquations(equations: PadEquation[]): PadEquation[] {
  return equations.length > 0 ? equations : [createEmptyPadEquation()];
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

function parseHistory(
  value: unknown,
  fallbackLatex: string,
  fallbackFunctionSymbols: FunctionSymbolTag[],
): EquationHistory {
  if (!value || typeof value !== "object") {
    return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  }
  const candidate = value as Partial<EquationHistory>;
  const present = candidate.present;
  if (!present || typeof present !== "object") {
    return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  }

  const presentLatex = present.latex;
  if (typeof presentLatex !== "string") {
    return createEquationHistory(fallbackLatex, fallbackFunctionSymbols);
  }

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
  const history = parseHistory(candidate.history, latex, functionSymbols);

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

export function parseStoredPadState(value: unknown): PadDocument {
  if (!value || typeof value !== "object") return createDefaultPadDocument();
  const candidate = value as StoredPadState;
  if (candidate.schemaVersion !== PAD_STORAGE_SCHEMA_VERSION || !Array.isArray(candidate.equations)) {
    return createDefaultPadDocument();
  }

  const equations = candidate.equations.flatMap((equation, index) => {
    const parsedEquation = parseStoredEquation(equation, index);
    return parsedEquation ? [parsedEquation] : [];
  });

  return { equations: normalizePadEquations(equations) };
}

export function serializePadDocument(document: PadDocument): SerializedPadState {
  return {
    schemaVersion: PAD_STORAGE_SCHEMA_VERSION,
    equations: normalizePadEquations(document.equations).map((equation) => ({
      id: equation.id,
      latex: equation.state.latex,
      functionSymbols: equation.state.functionSymbols,
      history: equation.state.history,
      mode: equation.state.mode,
    })),
  };
}
