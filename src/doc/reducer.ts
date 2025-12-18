import type { DocState } from "./model";
import type { Action, Equation } from "../semantics/types";
import { applyAction } from "../semantics/actions";
import { parseEquationFromAsciiMath, parseExprFromAsciiMath } from "../semantics/codec";

function id(): string {
  return Math.random().toString(16).slice(2);
}

export function docReducer(state: DocState, action: Action): DocState {
  const before = state.current;
  let after: Equation = before;

  if (action.kind === "setEquation") {
    // UI should pass ascii-math; naming is “latex” in type for now—rename later
    after = parseEquationFromAsciiMath(action.latexLeft, action.latexRight);
  } else if (action.kind === "addBothSides") {
    const term = parseExprFromAsciiMath(action.termLatex); // again: UI passes ascii-math
    after = applyAction(before, action, term);
  } else if (action.kind === "cancelAdditivePairs") {
    after = applyAction(before, action);
  }
  else if (action.kind === "moveAdditiveToLhs") {
    const term = parseExprFromAsciiMath(action.termLatex);
    after = applyAction(before, action, term);
}

  const step = {
    id: id(),
    action,
    before,
    after,
    timestamp: Date.now(),
  };

  return {
    current: after,
    steps: [step, ...state.steps],
  };
}
