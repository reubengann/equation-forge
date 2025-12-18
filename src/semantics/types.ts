import type { MathNode } from "mathjs";

/** For v0, Expr is a math.js MathNode. Later you can swap it for your own AST. */
export type Expr = MathNode;

export type Equation = {
  left: Expr;
  right: Expr;
};

/** Identifies where an expression came from (useful for UI) */
export type Side = "lhs" | "rhs";

/** Actions a user can take (these become history entries). */
export type Action =
  | { kind: "setEquation"; latexLeft: string; latexRight: string }
  | { kind: "addBothSides"; termLatex: string; from: Side }
  | { kind: "cancelAdditivePairs"; side: Side }
  | { kind: "moveAdditiveToLhs"; termLatex: string; from: Side; autoCancel?: boolean };

/** A recorded derivation step */
export type Step = {
  id: string;
  action: Action;
  before: Equation;
  after: Equation;
  timestamp: number;
};
