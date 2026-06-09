import { compileMathDocument } from "./math/compile/compileMathDocument";

export type EquationMode = "entry" | "display";

export type EquationHistoryStep = {
  latex: string;
};

export type EquationHistory = {
  past: EquationHistoryStep[];
  present: EquationHistoryStep;
  future: EquationHistoryStep[];
};

export type EquationRowState = {
  latex: string;
  history: EquationHistory;
  mode: EquationMode;
};

export function createEquationHistory(latex: string): EquationHistory {
  return {
    past: [],
    present: { latex },
    future: [],
  };
}

export function createEquationRowState(latex: string, mode: EquationMode = "entry"): EquationRowState {
  const canonicalLatex = compileMathDocument(latex).plainLatex;
  return {
    latex: canonicalLatex,
    history: createEquationHistory(canonicalLatex),
    mode,
  };
}

export function createDraftEquationRowState(latex: string): EquationRowState {
  return {
    latex,
    history: createEquationHistory(latex),
    mode: "entry",
  };
}
