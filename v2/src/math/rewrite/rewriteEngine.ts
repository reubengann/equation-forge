import type { TermSelection } from "../../selection/types";
import type { Expr } from "../ast";
import { exprToLatex } from "../adapters/latex/exprToLatex";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { replaceCompiledNode } from "../ast/utils";
import {
  DOWNWARD_REWRITE_RULES,
  PIVOT_REWRITE_RULES,
  SINGLE_CONTAINER_RULES,
  UPWARD_REWRITE_RULES,
} from "./ruleRegistry";
import type {
  InsertionPreview,
  InsertionSlot,
  MoveContext,
  MoveResult,
  MoveType,
  NodeHorizontalBounds,
  PipelineRuleResult,
  SingleContainerRule,
} from "./types";

type MovePath = {
  pivotId: string;
  upNodes: string[];
  downNodes: string[];
};

type ContainerIndexes = {
  sourceIndex: number;
  destinationIndex: number;
  insertionIndex: number;
};

type MoveEvaluation = {
  insertionPreview: InsertionPreview;
  moveResult?: MoveResult;
};

export function findPath(document: CompiledMathDocument, nodeId1: string, nodeId2: string): MovePath | null {
  const { parentById, nodeById } = document.index;
  if (!nodeById[nodeId1] || !nodeById[nodeId2]) return null;

  // The easiest way to find the lowest common ancestor is to travel all the way to the root, recording all the ancestors of the first node.
  // Then, we can travel up the second node until we find any ancestor of the first node. That's the lowest common ancestor.

  // TODO: Possible improvement if needed: cache node1ancestors during a drag/on selection.
  const node1Ancestors = new Set<string>();
  let cursor: string | null = nodeId1;
  while (cursor) {
    node1Ancestors.add(cursor);
    cursor = parentById[cursor] ?? null;
  }

  let pivotId: string | null = nodeId2;
  while (pivotId && !node1Ancestors.has(pivotId)) {
    pivotId = parentById[pivotId] ?? null;
  }
  if (!pivotId) return null;

  const upNodes: string[] = [];
  cursor = nodeId1;
  while (cursor && cursor !== pivotId) {
    upNodes.push(cursor);
    cursor = parentById[cursor] ?? null;
  }

  const downNodesReversed: string[] = [];
  cursor = nodeId2;
  while (cursor && cursor !== pivotId) {
    downNodesReversed.push(cursor);
    cursor = parentById[cursor] ?? null;
  }

  return {
    pivotId,
    upNodes,
    downNodes: downNodesReversed.reverse(),
  };
}

export class RulesPipeline {
  document: CompiledMathDocument;
  execute = false;
  rules: SingleContainerRule[];
  selection: TermSelection;
  destinationId: string;
  destinationSlot?: InsertionSlot;
  moveType: string;

  constructor(
    document: CompiledMathDocument,
    rules: SingleContainerRule[] | null,
    selection: TermSelection,
    destinationId: string,
    moveType: MoveType,
    destinationSlot?: InsertionSlot,
  ) {
    this.document = document;
    this.rules = rules ?? SINGLE_CONTAINER_RULES;
    this.selection = selection;
    this.destinationId = destinationId;
    this.destinationSlot = destinationSlot;
    this.moveType = moveType;
  }

  // If returns true, shouldn't we also return the insertion point?
  canMove(): boolean {
    return this.runEngine(false) !== null;
  }

  executeMove(): MoveResult | null {
    return this.runEngine(true)?.moveResult ?? null;
  }

  getInsertionPreview(): InsertionPreview | null {
    return this.runEngine(false)?.insertionPreview ?? null;
  }

  private runEngine(shouldExecute: boolean): MoveEvaluation | null {
    if (this.selection.kind === "single" && this.selection.nodeId === this.destinationId) {
      // no op
      return null;
    }
    if (this.selection.kind === "multi" && this.selection.nodeIds.includes(this.destinationId)) {
      return null;
    }
    const applicableRules = this.rules.filter((rule) => rule.moveType === this.moveType);
    if (this.selection.kind === "single") {
      const context: MoveContext = {
        document: this.document,
        selection: this.selection,
        payload: null,
        destinationId: this.destinationId,
        destinationSlot: this.destinationSlot,
      };
      const sourceParentId = this.document.index.parentById[this.selection.nodeId];
      const destinationParentId = this.document.index.parentById[this.destinationId];
      if (!sourceParentId || sourceParentId !== destinationParentId) {
        return this.runGeneralPipeline(context, shouldExecute);
      }

      const containerNode = this.document.index.nodeById[sourceParentId];
      const selectedNode = this.document.index.nodeById[this.selection.nodeId];
      const destinationNode = this.document.index.nodeById[this.destinationId];
      if (!containerNode || !selectedNode || !destinationNode) return null;

      const containerIndexes = resolveContainerIndexes({
        document: this.document,
        containerId: sourceParentId,
        selectionNodeId: this.selection.nodeId,
        destinationId: this.destinationId,
        destinationSlot: context.destinationSlot ?? "before",
      });
      if (!containerIndexes) return null;
      if (
        isReorderContainer(containerNode) &&
        containerIndexes.insertionIndex === containerIndexes.sourceIndex
      ) {
        return null;
      }
      context.sourceContainerIndex = containerIndexes.sourceIndex;
      context.destinationInsertionIndex = containerIndexes.insertionIndex;

      // If the replacement is just commutation within a given container (sum or product), we
      // don't need to do a full tree rewrite. Some single rule will cover it.
      const rule = this.findSingleContainerRule(
        applicableRules,
        context,
        containerNode,
        selectedNode,
        destinationNode,
      );
      if (!rule) return this.runGeneralPipeline(context, shouldExecute);
      const ruleMoveResult = shouldExecute
        ? rule.executeMove(context, containerNode, selectedNode, destinationNode)
        : null;
      if (shouldExecute && ruleMoveResult == null) return null;

      // If we get a replacement, apply it
      const moveResult =
        ruleMoveResult == null ? null : serializeRuleMoveResult(this.document, ruleMoveResult);

      return {
        insertionPreview: {
          containerId: sourceParentId,
          containerKind: containerNode.kind,
          destinationId: this.destinationId,
          destinationSlot: context.destinationSlot ?? "before",
          lineOrientation: lineOrientationForContainer(containerNode.kind),
        },
        ...(moveResult ? { moveResult } : {}),
      };
    }
    const context: MoveContext = {
      document: this.document,
      selection: this.selection,
      payload: null,
      destinationId: this.destinationId,
      destinationSlot: this.destinationSlot,
    };
    return this.runGeneralPipeline(context, shouldExecute);
  }

  private runGeneralPipeline(context: MoveContext, shouldExecute: boolean): MoveEvaluation | null {
    const startNodeId = startNodeIdForSelection(context.selection);
    if (!startNodeId) return null;

    const path = findPath(this.document, startNodeId, this.destinationId);
    if (!path) return null;

    const sourceBranchId = path.upNodes[path.upNodes.length - 1] ?? startNodeId;
    const destinationBranchId = path.downNodes[0] ?? this.destinationId;
    const pivotNode = this.document.index.nodeById[path.pivotId];
    if (!pivotNode) return null;

    const state: GeneralPipelineState = {
      payload: null,
      updatedNodes: {},
      insertionPreview: null,
    };

    // Walk from the selected node toward the pivot, extracting a payload or applying local upward rewrites.
    for (let index = 0; index < path.upNodes.length; index += 1) {
      const childId = path.upNodes[index];
      const parentId = index === path.upNodes.length - 1 ? path.pivotId : path.upNodes[index + 1];
      const childNode = this.nodeForPipeline(state, childId);
      const parentNode = this.nodeForPipeline(state, parentId);
      if (!childNode || !parentNode) return null;
      const edge = {
        childId,
        parentId,
        childNode,
        parentNode,
        isFinalUpwardEdge: parentId === path.pivotId,
        pivotId: path.pivotId,
      };

      const rule = UPWARD_REWRITE_RULES.find(
        (candidate) =>
          candidate.moveType === this.moveType &&
          (candidate.selectionKind === "*" || candidate.selectionKind === context.selection.kind) &&
          candidate.canApply({ ...context, payload: state.payload }, edge),
      );
      if (!rule) {
        if (state.payload && parentId !== path.pivotId) return null;
        continue;
      }

      const result = rule.apply({ ...context, payload: state.payload }, edge);
      if (!result) return null;
      applyPipelineRuleResult(state, result);
    }

    // Some moves complete entirely while walking upward, such as pulling a numerator out of a fraction.
    if (state.insertionPreview && path.downNodes.length === 0 && Object.keys(state.updatedNodes).length > 0) {
      if (!shouldExecute) {
        return { insertionPreview: state.insertionPreview };
      }

      const nextExpr = this.applyPipelineUpdates(path.pivotId, state.updatedNodes);
      if (!nextExpr) return null;

      return {
        insertionPreview: state.insertionPreview,
        moveResult: { latex: exprToLatex(nextExpr, false) },
      };
    }

    // At the lowest common ancestor, transform the payload for crossing that pivot (for example, across equals).
    const pivotRule = PIVOT_REWRITE_RULES.find(
      (candidate) =>
        candidate.moveType === this.moveType &&
        (candidate.selectionKind === "*" || candidate.selectionKind === context.selection.kind) &&
        candidate.pivotKind === pivotNode.kind &&
        candidate.canApply(
          { ...context, payload: state.payload },
          { pivotId: path.pivotId, pivotNode, sourceBranchId, destinationBranchId },
        ),
    );
    if (!pivotRule) return null;

    const pivotResult = pivotRule.apply(
      { ...context, payload: state.payload },
      { pivotId: path.pivotId, pivotNode, sourceBranchId, destinationBranchId },
    );
    if (!pivotResult) return null;
    applyPipelineRuleResult(state, pivotResult);

    // Walk down into the destination side and insert the transformed payload at the target.
    const destinationSideId = path.downNodes[0] ?? this.destinationId;
    const destinationSideNode = this.nodeForPipeline(state, destinationSideId);
    const effectiveDestinationId =
      this.moveType === "additive" && destinationSideNode?.kind !== "add"
        ? destinationSideId
        : this.destinationId;
    const destinationNode = this.nodeForPipeline(state, effectiveDestinationId);
    if (!destinationSideNode || !destinationNode) return null;

    const downRule = DOWNWARD_REWRITE_RULES.find(
      (candidate) =>
        candidate.moveType === this.moveType &&
        (candidate.selectionKind === "*" || candidate.selectionKind === context.selection.kind) &&
        candidate.canApply(
          { ...context, payload: state.payload },
          {
            sideId: destinationSideId,
            sideNode: destinationSideNode,
            destinationId: effectiveDestinationId,
            destinationNode,
          },
        ),
    );
    if (!downRule) return null;

    const downResult = downRule.apply(
      { ...context, payload: state.payload },
      {
        sideId: destinationSideId,
        sideNode: destinationSideNode,
        destinationId: effectiveDestinationId,
        destinationNode,
      },
    );
    if (!downResult) return null;
    applyPipelineRuleResult(state, downResult);
    if (!state.insertionPreview) return null;

    // Preview mode stops once rules agree on a legal insertion point.
    if (!shouldExecute) {
      return { insertionPreview: state.insertionPreview };
    }

    // Execute mode rebuilds the changed subtree and serializes the updated document back to LaTeX.
    const nextExpr = this.applyPipelineUpdates(path.pivotId, state.updatedNodes);
    if (!nextExpr) return null;

    return {
      insertionPreview: state.insertionPreview,
      moveResult: { latex: exprToLatex(nextExpr, false) },
    };
  }

  private nodeForPipeline(state: GeneralPipelineState, nodeId: string): Expr | null {
    return state.updatedNodes[nodeId] ?? this.document.index.nodeById[nodeId] ?? null;
  }

  private applyPipelineUpdates(pivotId: string, updatedNodes: Record<string, Expr>): Expr | null {
    const pivot = this.document.index.nodeById[pivotId];
    if (!pivot) return null;
    const nextPivot = rebuildUpdatedSubtree(this.document, pivotId, updatedNodes);
    if (!nextPivot) return null;
    return replaceCompiledNode(this.document, pivotId, nextPivot);
  }

  private findSingleContainerRule(
    applicableRules: SingleContainerRule[],
    context: MoveContext,
    containerNode: Expr,
    selectedNode: Expr,
    destinationNode: Expr,
  ): SingleContainerRule | null {
    for (const rule of applicableRules) {
      if (rule.selectionKind !== context.selection.kind) continue;
      if (rule.containerKind !== containerNode.kind) continue;
      if (!rule.canMove(context, containerNode, selectedNode, destinationNode)) continue;
      return rule;
    }
    return null;
  }
}

type GeneralPipelineState = {
  payload: Expr | null;
  updatedNodes: Record<string, Expr>;
  insertionPreview: InsertionPreview | null;
};

function startNodeIdForSelection(selection: TermSelection): string | null {
  if (selection.kind === "single") return selection.nodeId;
  return selection.nodeIds[0] ?? null;
}

function applyPipelineRuleResult(state: GeneralPipelineState, result: PipelineRuleResult): void {
  if (result.payload) state.payload = result.payload;
  if (result.updatedNodeId && result.updatedNode) {
    state.updatedNodes[result.updatedNodeId] = result.updatedNode;
  }
  if (result.insertionPreview) state.insertionPreview = result.insertionPreview;
}

function rebuildUpdatedSubtree(
  document: CompiledMathDocument,
  nodeId: string,
  updatedNodes: Record<string, Expr>,
): Expr | null {
  const original = document.index.nodeById[nodeId];
  if (!original) return null;

  if (updatedNodes[nodeId]) return structuredClone(updatedNodes[nodeId]) as Expr;

  const base = original;
  const next = structuredClone(base) as Expr;
  const nextRecord = next as Record<string, unknown>;
  const childIds = document.index.childrenById[nodeId] ?? [];

  for (const childId of childIds) {
    const location = document.index.locationById[childId];
    if (!location.field) continue;
    const updatedChild = rebuildUpdatedSubtree(document, childId, updatedNodes);
    if (!updatedChild) return null;

    if (location.index != null) {
      const current = nextRecord[location.field];
      if (!Array.isArray(current) || location.index >= current.length) continue;
      const nextChildren = [...current];
      nextChildren[location.index] = updatedChild;
      nextRecord[location.field] = nextChildren;
    } else if (location.field in nextRecord) {
      nextRecord[location.field] = updatedChild;
    }
  }

  return next;
}

function serializeRuleMoveResult(
  document: CompiledMathDocument,
  ruleMoveResult: NonNullable<ReturnType<SingleContainerRule["executeMove"]>>,
): MoveResult | null {
  const nextExpr = replaceCompiledNode(document, ruleMoveResult.updatedNodeId, ruleMoveResult.updatedNode);
  if (!nextExpr) return null;
  return { latex: exprToLatex(nextExpr, false) };
}

function lineOrientationForContainer(containerKind: Expr["kind"]): "vertical" | "horizontal" {
  switch (containerKind) {
    case "add":
    case "multiply":
      return "vertical";
    default:
      return "horizontal";
  }
}

function isReorderContainer(expr: Expr): boolean {
  return expr.kind === "add" || expr.kind === "multiply";
}

function resolveContainerIndexes({
  document,
  containerId,
  selectionNodeId,
  destinationId,
  destinationSlot,
}: {
  document: CompiledMathDocument;
  containerId: string;
  selectionNodeId: string;
  destinationId: string;
  destinationSlot: InsertionSlot;
}): ContainerIndexes | null {
  const directChildIds = document.index.childrenById[containerId] ?? [];
  if (directChildIds.length === 0) return null;

  const sourceAncestors = new Set(document.index.ancestorsById[selectionNodeId] ?? []);
  const destinationAncestors = new Set(document.index.ancestorsById[destinationId] ?? []);

  const sourceIndex = directChildIds.findIndex(
    (childId) => childId === selectionNodeId || sourceAncestors.has(childId),
  );
  const destinationIndex = directChildIds.findIndex(
    (childId) => childId === destinationId || destinationAncestors.has(childId),
  );
  if (sourceIndex < 0 || destinationIndex < 0) return null;

  const adjustedDestinationIndex = sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;
  const insertionIndex =
    destinationSlot === "after" ? adjustedDestinationIndex + 1 : adjustedDestinationIndex;

  return { sourceIndex, destinationIndex, insertionIndex };
}

/* 
    At some point we need to resolve an actual concrete destination inferred from the destinationId.

    Return null if there's no insertion point. Otherwise, we need to return an actual insertion point somehow.
    Later we will need to render the insertion point as an indicator. This will be done somewhere else.

    How will we save the state? If we follow different logic paths, they can diverge. But if we follow
    the same path, we should not be doing all the work to actually modify the tree. Perhaps we have
    two entry points, canMove and executeMove, and then the rewriteEngine calls one with a boolean that indicates
    to skip the actual extraction.
    
*/
export function canExecuteMove({
  document,
  selection,
  destinationId,
  moveType,
  destinationSlot,
  pointerX,
  rectById,
  rightOfCenterMarginPx,
}: {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
  moveType: MoveType;
  destinationSlot?: InsertionSlot;
  pointerX?: number;
  rectById?: Record<string, NodeHorizontalBounds>;
  rightOfCenterMarginPx?: number;
}): InsertionPreview | null {
  const resolvedSlot =
    destinationSlot ??
    (pointerX != null && rectById
      ? resolveSingleContainerSlot({
          document,
          selection,
          destinationId,
          pointerX,
          rectById,
          rightOfCenterMarginPx,
        })
      : null) ??
    "before";

  return new RulesPipeline(
    document,
    SINGLE_CONTAINER_RULES,
    selection,
    destinationId,
    moveType,
    resolvedSlot,
  ).getInsertionPreview();
}

export function executeMove({
  document,
  selection,
  destinationId,
  moveType,
  destinationSlot,
}: {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
  moveType: MoveType;
  destinationSlot: InsertionSlot;
}): MoveResult | null {
  return new RulesPipeline(
    document,
    SINGLE_CONTAINER_RULES,
    selection,
    destinationId,
    moveType,
    destinationSlot,
  ).executeMove();
}

function resolveSingleContainerSlot({
  document,
  selection,
  destinationId,
  pointerX,
  rectById,
  rightOfCenterMarginPx = 0,
}: {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
  pointerX: number;
  rectById: Record<string, NodeHorizontalBounds>;
  rightOfCenterMarginPx?: number;
}): InsertionSlot | null {
  if (selection.kind !== "single") return null;
  if (selection.nodeId === destinationId) return null;

  const sourceParentId = document.index.parentById[selection.nodeId];
  const destinationParentId = document.index.parentById[destinationId];
  if (!sourceParentId || !destinationParentId) return null;

  const destinationRect = rectById[destinationId];
  if (!destinationRect) return null;
  const centerX = (destinationRect.left + destinationRect.right) / 2;

  return pointerX >= centerX + rightOfCenterMarginPx ? "after" : "before";
}
