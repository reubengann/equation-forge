import type { SelectionKind, TermSelection } from "../../selection/types";
import type { Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

export type MoveType = "additive" | "multiplicative";

export type MoveContext = {
  document: CompiledMathDocument;
  selection: TermSelection;
  payload: Expr;
  destinationId: string;
};

export type MoveResult = {
  payload: Expr;
};

export type RewriteRule = {
  id: string;
  selectionKind: SelectionKind;
  moveType: MoveType;
  direction: "up" | "down";
  canMove: (moveContext: MoveContext, node: Expr) => boolean;
  executeMove: (moveContext: MoveContext, node: Expr) => MoveResult | null;
};
