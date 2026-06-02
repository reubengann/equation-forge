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

export function resolveHorizontalInsertionSlot(pointerX: number, rect: NodeHorizontalBounds): InsertionSlot {
  const centerX = (rect.left + rect.right) / 2;
  return pointerX >= centerX ? "after" : "before";
}

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

export type PipelineRuleResult = {
  payload?: Expr;
  updatedNodeId?: string;
  updatedNode?: Expr;
  insertionPreview?: InsertionPreview;
};

export type RewriteRuleEdge = {
  childId: string;
  parentId: string;
  childNode: Expr;
  parentNode: Expr;
  isFinalUpwardEdge: boolean;
  pivotId: string;
};

export type PivotRewriteContext = {
  pivotId: string;
  pivotNode: Expr;
  sourceBranchId: string;
  destinationBranchId: string;
};

export type DownwardRewriteContext = {
  sideId: string;
  sideNode: Expr;
  destinationId: string;
  destinationNode: Expr;
};

export type UpwardRewriteRule = {
  id: string;
  selectionKind: SelectionKind | "*";
  moveType: MoveType;
  fromKind: string;
  toKind: string;
  canApply: (moveContext: MoveContext, edge: RewriteRuleEdge) => boolean;
  apply: (moveContext: MoveContext, edge: RewriteRuleEdge) => PipelineRuleResult | null;
};

export type PivotRewriteRule = {
  id: string;
  selectionKind: SelectionKind | "*";
  moveType: MoveType;
  pivotKind: string;
  canApply: (moveContext: MoveContext, pivotContext: PivotRewriteContext) => boolean;
  apply: (moveContext: MoveContext, pivotContext: PivotRewriteContext) => PipelineRuleResult | null;
};

export type DownwardRewriteRule = {
  id: string;
  selectionKind: SelectionKind | "*";
  moveType: MoveType;
  toKind: string;
  canApply: (moveContext: MoveContext, downContext: DownwardRewriteContext) => boolean;
  apply: (moveContext: MoveContext, downContext: DownwardRewriteContext) => PipelineRuleResult | null;
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
