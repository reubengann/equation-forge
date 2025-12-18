import type { Equation, Step, Action } from "../semantics/types";

export type DocState = {
  current: Equation;
  steps: Step[];
};
