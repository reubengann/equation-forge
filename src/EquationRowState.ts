import { compileMathDocument } from "./math/compile/compileMathDocument";

export type EquationMode = "entry" | "display";

export type EquationHistoryStep = {
  latex: string;
  functionSymbols: FunctionSymbolTag[];
};

export type EquationHistory = {
  past: EquationHistoryStep[];
  present: EquationHistoryStep;
  future: EquationHistoryStep[];
};

export type EquationRowState = {
  latex: string;
  functionSymbols: FunctionSymbolTag[];
  history: EquationHistory;
  mode: EquationMode;
};

export type FunctionSymbolTag = {
  nodeId: string;
  name: string;
};

export function createEquationHistory(latex: string, functionSymbols: FunctionSymbolTag[] = []): EquationHistory {
  return {
    past: [],
    present: { latex, functionSymbols },
    future: [],
  };
}

export function createEquationRowState(latex: string, mode: EquationMode = "entry"): EquationRowState {
  const canonicalLatex = compileMathDocument(latex).plainLatex;
  return {
    latex: canonicalLatex,
    functionSymbols: [],
    history: createEquationHistory(canonicalLatex),
    mode,
  };
}

export function createDraftEquationRowState(latex: string): EquationRowState {
  return {
    latex,
    functionSymbols: [],
    history: createEquationHistory(latex),
    mode: "entry",
  };
}
