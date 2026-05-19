import type { SelectionKind, TermSelection } from "../../selection/types";
import type { Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

export type MoveType = "additive" | "multiplicative";
export type InsertionSlot = "before" | "after";
export type InsertionLineOrientation = "vertical" | "horizontal";

export type NodeHorizontalBounds = {
  left: number;
  right: number;
};

export type InsertionPreview = {
  containerId: string;
  containerKind: Expr["kind"];
  destinationId: string;
  destinationSlot: InsertionSlot;
  lineOrientation: InsertionLineOrientation;
};

export type MoveContext = {
  document: CompiledMathDocument;
  selection: TermSelection;
  payload: Expr | null;
  destinationId: string;
  destinationSlot?: InsertionSlot;
  sourceContainerIndex?: number;
  destinationInsertionIndex?: number;
};

export type MoveResult = {
  latex: string;
};

export type RuleMoveResult = {
  payload: Expr;
  updatedNodeId: string;
  updatedNode: Expr;
};

export type RewriteRule = {
  id: string;
  selectionKind: SelectionKind;
  moveType: MoveType;
  direction: "up" | "down";
  fromKind: string;
  toKind: string;
  canMove: (moveContext: MoveContext, node: Expr) => boolean;
  executeMove: (moveContext: MoveContext, node: Expr) => RuleMoveResult | null;
};

export type SingleContainerRule = {
  id: string;
  selectionKind: SelectionKind;
  moveType: MoveType;
  containerKind: string;
  canMove: (
    moveContext: MoveContext,
    containerNode: Expr,
    selectedNode: Expr,
    destinationNode: Expr,
  ) => boolean;
  executeMove: (
    moveContext: MoveContext,
    containerNode: Expr,
    selectedNode: Expr,
    destinationNode: Expr,
  ) => RuleMoveResult | null;
};
