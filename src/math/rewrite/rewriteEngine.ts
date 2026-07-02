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
import { applySign, multiplySigns, splitSign, structuralKey } from "./algebraUtils";
import type {
  InsertionPreview,
  InsertionSlot,
  MoveContext,
  MoveResult,
  MoveType,
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

type MultiContainerMove = {
  containerId: string;
  destinationId: string;
  sourceIndex: number;
  sourceEndIndex: number;
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
  moveType: MoveType;

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
      const normalizedSelection = normalizeSingleSelectionForMove(
        this.document,
        this.selection,
        this.destinationId,
        this.moveType,
      );
      if (normalizedSelection && normalizedSelection.nodeId !== this.selection.nodeId) {
        return new RulesPipeline(
          this.document,
          this.rules,
          normalizedSelection,
          this.destinationId,
          this.moveType,
          this.destinationSlot,
        ).runEngine(shouldExecute);
      }

      const context: MoveContext = {
        document: this.document,
        selection: this.selection,
        payload: null,
        destinationId: this.destinationId,
        destinationSlot: this.destinationSlot,
      };
      if (shouldUseGeneralPipelineForSingleContainerMove(this.document, this.moveType, this.selection.nodeId, this.destinationId)) {
        return this.runGeneralPipeline(context, shouldExecute);
      }
      const sourceParentId = this.document.index.parentById[this.selection.nodeId];
      const destinationParentId = this.document.index.parentById[this.destinationId];
      if (!sourceParentId || !destinationParentId) {
        return this.runGeneralPipeline(context, shouldExecute);
      }
      const normalizedDestinationId = directChildIdUnderContainer(this.document, sourceParentId, this.destinationId);
      if (!normalizedDestinationId) {
        return this.runGeneralPipeline(context, shouldExecute);
      }

      const containerNode = this.document.index.nodeById[sourceParentId];
      const selectedNode = this.document.index.nodeById[this.selection.nodeId];
      const destinationNode = this.document.index.nodeById[normalizedDestinationId];
      if (!containerNode || !selectedNode || !destinationNode) return null;

      const containerIndexes = resolveContainerIndexes({
        document: this.document,
        containerId: sourceParentId,
        selectionNodeId: this.selection.nodeId,
        destinationId: normalizedDestinationId,
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
          destinationId: normalizedDestinationId,
          destinationSlot: context.destinationSlot ?? "before",
          lineOrientation: lineOrientationForContainer(containerNode.kind),
        },
        ...(moveResult ? { moveResult } : {}),
      };
    }
    if (this.selection.kind === "multi") {
      const sameContainer = resolveMultiSelectionContainerMove(this.document, this.selection, this.destinationId, this.destinationSlot ?? "before");
      if (sameContainer) {
        const context: MoveContext = {
          document: this.document,
          selection: this.selection,
          payload: null,
          destinationId: sameContainer.destinationId,
          destinationSlot: this.destinationSlot,
          sourceContainerIndex: sameContainer.sourceIndex,
          sourceContainerEndIndex: sameContainer.sourceEndIndex,
          destinationInsertionIndex: sameContainer.insertionIndex,
        };
        const containerNode = this.document.index.nodeById[sameContainer.containerId];
        const selectedNode = this.document.index.nodeById[this.selection.nodeIds[0] ?? ""];
        const destinationNode = this.document.index.nodeById[sameContainer.destinationId];
        if (containerNode && selectedNode && destinationNode) {
          const rule = this.findSingleContainerRule(
            applicableRules,
            context,
            containerNode,
            selectedNode,
            destinationNode,
          );
          const ruleMoveResult = shouldExecute && rule
            ? rule.executeMove(context, containerNode, selectedNode, destinationNode)
            : null;
          if (rule || ruleMoveResult) {
            if (shouldExecute && ruleMoveResult == null) return null;
            const moveResult = ruleMoveResult == null ? null : serializeRuleMoveResult(this.document, ruleMoveResult);
            return {
              insertionPreview: {
                containerId: sameContainer.containerId,
                containerKind: containerNode.kind,
                destinationId: sameContainer.destinationId,
                destinationSlot: context.destinationSlot ?? "before",
                lineOrientation: lineOrientationForContainer(containerNode.kind),
              },
              ...(moveResult ? { moveResult } : {}),
            };
          }
        }
      }
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
        (candidate.pivotKind === "*" || candidate.pivotKind === pivotNode.kind) &&
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
    if (state.updatedNodes[nodeId]) return state.updatedNodes[nodeId];

    const parentId = this.document.index.parentById[nodeId];
    const updatedParent = parentId ? state.updatedNodes[parentId] : null;
    const originalNode = this.document.index.nodeById[nodeId];
    if (updatedParent && originalNode) {
      const currentChild = findChildInUpdatedParent(this.document, nodeId, updatedParent, originalNode);
      if (currentChild) return currentChild;
    }

    return originalNode ?? null;
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
      if (rule.selectionKind !== "*" && rule.selectionKind !== context.selection.kind) continue;
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

function resolveMultiSelectionContainerMove(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "multi" }>,
  destinationId: string,
  destinationSlot: InsertionSlot,
): MultiContainerMove | null {
  const containerId = selection.containerNodeId;
  if (!containerId || selection.nodeIds.length === 0) return null;
  const container = document.index.nodeById[containerId];
  if (!container || !isReorderContainer(container)) return null;

  const childIds = document.index.childrenById[containerId] ?? [];
  const selectedIndexes = selection.nodeIds
    .map((nodeId) => childIds.findIndex((childId) => childId === nodeId || (document.index.ancestorsById[nodeId] ?? []).includes(childId)))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (selectedIndexes.length !== selection.nodeIds.length) return null;

  const sourceIndex = selectedIndexes[0];
  const sourceEndIndex = selectedIndexes[selectedIndexes.length - 1];
  if (sourceIndex == null || sourceEndIndex == null) return null;
  if (sourceEndIndex - sourceIndex + 1 !== selectedIndexes.length) return null;

  const destinationIndex = childIds.findIndex(
    (childId) => childId === destinationId || (document.index.ancestorsById[destinationId] ?? []).includes(childId),
  );
  if (destinationIndex < 0) return null;
  if (destinationIndex >= sourceIndex && destinationIndex <= sourceEndIndex) return null;

  const insertionIndex = destinationSlot === "after" ? destinationIndex + 1 : destinationIndex;
  if (insertionIndex === sourceIndex || insertionIndex === sourceEndIndex + 1) return null;
  return {
    containerId,
    destinationId: childIds[destinationIndex] ?? destinationId,
    sourceIndex,
    sourceEndIndex,
    insertionIndex,
  };
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

  const hasDirectUpdate = !!updatedNodes[nodeId];
  const base = updatedNodes[nodeId] ?? original;
  const next = structuredClone(base) as Expr;
  const nextRecord = next as Record<string, unknown>;
  const childIds = document.index.childrenById[nodeId] ?? [];

  for (const childId of childIds) {
    if (hasDirectUpdate && !hasUpdatedNodeInSubtree(document, childId, updatedNodes)) continue;
    const location = document.index.locationById[childId];
    const originalChild = document.index.nodeById[childId];
    if (!location.field) continue;
    if (!originalChild) return null;
    const updatedChild = rebuildUpdatedSubtree(document, childId, updatedNodes);
    if (!updatedChild) return null;

    if (hasDirectUpdate && updatedNodes[childId]) {
      const nextSigned = splitSign(next);
      const originalChildSigned = splitSign(originalChild);
      if (structuralKey(nextSigned.value) === structuralKey(originalChildSigned.value)) {
        return applySign(multiplySigns(nextSigned.sign, originalChildSigned.sign), updatedChild);
      }
    }

    if (location.index != null) {
      const current = nextRecord[location.field];
      if (!Array.isArray(current)) continue;
      const nextChildren = [...current];
      const replacementIndex = hasDirectUpdate
        ? nextChildren.findIndex((child) => isExprNode(child) && matchesOriginalChildAfterDirectUpdate(child, originalChild))
        : location.index;
      if (replacementIndex < 0 || replacementIndex >= nextChildren.length) continue;
      nextChildren[replacementIndex] = updatedChild;
      nextRecord[location.field] = nextChildren;
    } else if (location.field in nextRecord) {
      nextRecord[location.field] = updatedChild;
    }
  }

  return next;
}

function hasUpdatedNodeInSubtree(
  document: CompiledMathDocument,
  nodeId: string,
  updatedNodes: Record<string, Expr>,
): boolean {
  if (updatedNodes[nodeId]) return true;
  return (document.index.childrenById[nodeId] ?? []).some((childId) =>
    hasUpdatedNodeInSubtree(document, childId, updatedNodes),
  );
}

function isExprNode(value: unknown): value is Expr {
  return typeof value === "object" && value !== null && "kind" in value;
}

function findChildInUpdatedParent(
  document: CompiledMathDocument,
  nodeId: string,
  updatedParent: Expr,
  originalNode: Expr,
): Expr | null {
  const location = document.index.locationById[nodeId];
  if (!location.field) return null;
  const updatedParentRecord = updatedParent as Record<string, unknown>;
  const current = updatedParentRecord[location.field];

  if (Array.isArray(current)) {
    const indexedCandidate = location.index == null ? null : current[location.index];
    if (isExprNode(indexedCandidate) && matchesOriginalChildAfterDirectUpdate(indexedCandidate, originalNode)) {
      return indexedCandidate;
    }
    return current.find((candidate) =>
      isExprNode(candidate) && matchesOriginalChildAfterDirectUpdate(candidate, originalNode)) ?? null;
  }

  return isExprNode(current) && matchesOriginalChildAfterDirectUpdate(current, originalNode) ? current : null;
}

function matchesOriginalChildAfterDirectUpdate(candidate: Expr, originalChild: Expr): boolean {
  if (structuralKey(candidate) === structuralKey(originalChild)) return true;
  const candidateSigned = splitSign(candidate);
  const originalSigned = splitSign(originalChild);
  return structuralKey(candidateSigned.value) === structuralKey(originalSigned.value);
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

function shouldUseGeneralPipelineForSingleContainerMove(
  document: CompiledMathDocument,
  moveType: MoveType,
  selectionNodeId: string,
  destinationId: string,
): boolean {
  if (moveType !== "multiplicative") return false;

  const sourceParentId = document.index.parentById[selectionNodeId];
  const sourceParent = sourceParentId ? document.index.nodeById[sourceParentId] : null;
  if (
    sourceParentId &&
    sourceParent &&
    isReorderContainer(sourceParent) &&
    hasAncestorLocationField(document, sourceParentId, "numerator") &&
    directChildIdUnderContainer(document, sourceParentId, destinationId)
  ) {
    return false;
  }

  if (hasAncestorLocationField(document, selectionNodeId, "numerator")) return true;
  return hasAncestorLocationField(document, destinationId, "numerator");
}

function hasAncestorLocationField(
  document: CompiledMathDocument,
  nodeId: string,
  field: string,
): boolean {
  let cursor: string | null = nodeId;
  while (cursor) {
    const location = document.index.locationById[cursor];
    if (location?.field === field) return true;
    cursor = document.index.parentById[cursor] ?? null;
  }
  return false;
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

function directChildIdUnderContainer(
  document: CompiledMathDocument,
  containerId: string,
  nodeId: string,
): string | null {
  let cursor: string | null = nodeId;
  while (cursor) {
    const parentId: string | null = document.index.parentById[cursor] ?? null;
    if (parentId === containerId) return cursor;
    cursor = parentId;
  }
  return null;
}

function normalizeSingleSelectionForMove(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "single" }>,
  destinationId: string,
  moveType: MoveType,
): Extract<TermSelection, { kind: "single" }> | null {
  if (moveType !== "additive") return null;
  const sourceParentId = document.index.parentById[selection.nodeId];
  if (!sourceParentId) return null;

  let cursor: string | null = selection.nodeId;
  while (cursor) {
    const parentId: string | null = document.index.parentById[cursor] ?? null;
    if (!parentId) return null;
    const parent = document.index.nodeById[parentId];
    if (parent?.kind === "add") {
      const destinationTermId = directChildIdUnderContainer(document, parentId, destinationId);
      if (!destinationTermId) return null;
      return cursor === selection.nodeId ? null : { kind: "single", nodeId: cursor };
    }
    if (parent?.kind === "multiply") {
      const parentLocation = document.index.locationById[parentId];
      const grandparent = parentLocation?.parentId ? document.index.nodeById[parentLocation.parentId] : null;
      if (grandparent?.kind === "add" && parentLocation?.parentId) {
        const destinationTermId = directChildIdUnderContainer(document, parentLocation.parentId, destinationId);
        if (!destinationTermId) return null;
        return { kind: "single", nodeId: parentId };
      }
    }
    cursor = parentId;
  }

  return null;
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
}: {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
  moveType: MoveType;
  destinationSlot?: InsertionSlot;
}): InsertionPreview | null {
  return new RulesPipeline(
    document,
    SINGLE_CONTAINER_RULES,
    selection,
    destinationId,
    moveType,
    destinationSlot ?? "before",
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

