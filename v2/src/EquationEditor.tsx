import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  type NodeRect,
  captureGeometryFromMathdiv,
  DRAG_COMMIT_THRESHOLD_PX,
  DRAG_PREVIEW_HIT_TEST_PADDING_PX,
  resolveSelectableNodeAtPoint,
  resolveSelectionFromEvent,
  type SelectionControllerEvent,
  selectionSet,
} from "./interaction/selectionController";
import { type TermSelection } from "./selection/types";
import { compileMathDocument, type CompiledMathDocument } from "./math/compile/compileMathDocument";
import { exprToLatex, parseLatexToExpr } from "./math/adapters/latex";
import { canRun as canFlipRelation, run as flipRelation } from "./math/rewrite/flipRelation";
import { autoRewriteSelection, canAutoRewrite } from "./math/rewrite/autoRewrite";
import { canCycleDelimiterSelection, cycleDelimiterSelection } from "./math/rewrite/cycleDelimiter";
import {
  applyOperationToRelation,
  canApplyOperationToRelation,
  validateOperationTemplate,
} from "./math/rewrite/applyOperation";
import { canExecuteMove, executeMove } from "./math/rewrite/rewriteEngine";
import { canToggleDelimiterSelection, toggleDelimiterSelection } from "./math/rewrite/toggleDelimiter";
import { canToggleNegateSelection, toggleNegateSelection } from "./math/rewrite/toggleNegate";
import {
  getSubstitutionSelection,
  isValidSubstitutionReplacement,
  substituteSelection,
} from "./math/rewrite/substitute";
import type { InsertionPreview, MoveType, NodeHorizontalBounds } from "./math/rewrite/types";
import type { EquationEditorRecordingHooks } from "./TestRecorder";
import { EquationToolbar } from "./EquationToolbar";
import { SubstituteModal } from "./SubstituteModal";
import { ApplyOperationModal } from "./ApplyOperationModal";

type InsertionLineStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function resolveHorizontalInsertionSlot(pointerX: number, rect: NodeHorizontalBounds) {
  const centerX = (rect.left + rect.right) / 2;
  return pointerX >= centerX ? "after" : "before";
}

function selectionContainsNode(selection: TermSelection, nodeId: string): boolean {
  return selection.kind === "single" ? selection.nodeId === nodeId : selection.nodeIds.includes(nodeId);
}

function selectionKey(selection: TermSelection): string {
  return selection.kind === "single" ? selection.nodeId : selection.nodeIds.join(",");
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeApplyOperationLatex(latex: string): string {
  return latex
    .replace(/\\mathord\{\\mathrm\{eqn\}\}/g, String.raw`\eqn`)
    .replace(/\\mathrm\{eqn\}/g, String.raw`\eqn`);
}

function isSelectionValidInDocument(document: CompiledMathDocument, selection: TermSelection): boolean {
  const { nodeById } = document.index;
  if (selection.kind === "single") {
    return !!nodeById[selection.nodeId];
  }
  if (!selection.containerNodeId || !nodeById[selection.containerNodeId]) return false;
  return selection.nodeIds.every((nodeId) => !!nodeById[nodeId]);
}

type EquationEditorProps = {
  latex: string;
  onCanonicalLatexChanged: (nextLatex: string) => void;
  canUndo?: boolean;
  onUndoRequested?: () => void;
  canRedo?: boolean;
  onRedoRequested?: () => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EquationEditor({
  latex,
  onCanonicalLatexChanged,
  canUndo = false,
  onUndoRequested,
  canRedo = false,
  onRedoRequested,
  recordingHooks,
}: EquationEditorProps) {
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const mathDivRef = useRef<HTMLElement | null>(null);
  const nodeRectsRef = useRef<NodeRect[]>([]);
  const nodeResolutionRef = useRef<NodeResolutionSource>(buildNodeResolutionSource([], null));
  const [selection, setSelection] = useState<TermSelection | null>(null);
  const selectionRef = useRef<TermSelection | null>(null);
  const [moveType, setMoveType] = useState<MoveType>("additive");
  const [insertionPreview, setInsertionPreview] = useState<InsertionPreview | null>(null);
  const insertionPreviewRef = useRef<InsertionPreview | null>(null);
  const [isSubstituteModalOpen, setIsSubstituteModalOpen] = useState(false);
  const [isApplyOperationModalOpen, setIsApplyOperationModalOpen] = useState(false);
  const [substituteLatex, setSubstituteLatex] = useState("");
  const [substituteError, setSubstituteError] = useState<string | null>(null);
  const [applyOperationLatex, setApplyOperationLatex] = useState("");
  const [applyOperationError, setApplyOperationError] = useState<string | null>(null);
  const [insertionLineStyle, setInsertionLineStyle] = useState<InsertionLineStyle | null>(null);
  const lastSelectionKeyRef = useRef<string>("null");
  const selectionStateRef = useRef(createSelectionControllerState());
  const lastDragEngineQueryKeyRef = useRef<string | null>(null);
  const snapshotCounterRef = useRef(0);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const currentDomSnapshotIdRef = useRef<string | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const substituteModalSessionRef = useRef(0);
  const applyOperationModalSessionRef = useRef(0);
  const compiledDoc = useMemo(() => compileMathDocument(latex), [latex]);
  const canFlip = canFlipRelation(compiledDoc.expr);
  const canApplyOperation = canApplyOperationToRelation(compiledDoc.expr);
  const substitutionSelection = useMemo(
    () => getSubstitutionSelection(compiledDoc, selection),
    [compiledDoc, selection],
  );
  const canSubstitute = substitutionSelection !== null;
  const canFactor = canAutoRewrite(compiledDoc, selection, "factor");
  const canDistribute = canAutoRewrite(compiledDoc, selection, "distribute");
  const canCleanup = canAutoRewrite(compiledDoc, selection, "cleanup");
  const canToggleNegate =
    selection?.kind === "single" ? canToggleNegateSelection(compiledDoc, selection.nodeId) : false;
  const canToggleDelimiter = canToggleDelimiterSelection(compiledDoc, selection);
  const canCycleDelimiter = canCycleDelimiterSelection(compiledDoc, selection);

  const updateSelection = useCallback(
    (nextSelection: TermSelection | null) => {
      selectionRef.current = nextSelection;
      const nextSelectionKey = JSON.stringify(nextSelection);
      if (lastSelectionKeyRef.current === nextSelectionKey) return;
      lastSelectionKeyRef.current = nextSelectionKey;
      setSelection(nextSelection);
      recordingHooks?.onSelectionChanged?.(nextSelection);
    },
    [recordingHooks],
  );

  const applySelectionHighlight = (nextSelection: TermSelection | null) => {
    const host = mathDivRef.current as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) return;

    const els = Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"));
    const selectedNodeIds = selectionSet(nextSelection);
    for (const el of els) {
      const nodeId = el.dataset.nodeId;
      const isSelected = !!nodeId && selectedNodeIds.has(nodeId);
      el.style.color = isSelected ? "#ff9800" : "";
      el.style.outline = "";
    }
  };

  useEffect(() => {
    onCanonicalLatexChanged(compiledDoc.plainLatex);
  }, [compiledDoc, onCanonicalLatexChanged]);

  useEffect(() => {
    recordingHooks?.onMoveTypeChanged(moveType);
  }, [moveType, recordingHooks]);

  useEffect(() => {
    const mathDiv = mathDivRef.current as (HTMLElement & { value?: string; render?: () => void }) | null;
    if (!mathDiv) return;
    mathDiv.value = compiledDoc.taggedLatex;
    mathDiv.setAttribute("value", compiledDoc.taggedLatex);
    mathDiv.textContent = compiledDoc.taggedLatex;
    mathDiv.render?.();

    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 4;
    const captureSnapshotWhenReady = () => {
      attempts += 1;
      const snapshot = captureGeometryFromMathdiv(mathDivRef.current);
      nodeRectsRef.current = snapshot?.nodeRects ?? [];
      nodeResolutionRef.current = buildNodeResolutionSource(nodeRectsRef.current, compiledDoc.index);
      applySelectionHighlight(selectionRef.current);
      const hasRenderableDom = !!snapshot && snapshot.hostRect.height > 0 && snapshot.nodeRects.length > 0;
      if (hasRenderableDom || attempts >= maxAttempts) {
        if (!snapshot) {
          lastSnapshotKeyRef.current = null;
          currentDomSnapshotIdRef.current = null;
          recordingHooks?.onDomSnapshotObserved?.({
            domSnapshotId: null,
            domSnapshot: null,
          });
          return;
        }

        const snapshotKey = JSON.stringify(snapshot);
        if (snapshotKey !== lastSnapshotKeyRef.current) {
          snapshotCounterRef.current += 1;
          currentDomSnapshotIdRef.current = `s${snapshotCounterRef.current}`;
          lastSnapshotKeyRef.current = snapshotKey;
        }

        recordingHooks?.onDomSnapshotObserved?.({
          domSnapshotId: currentDomSnapshotIdRef.current,
          domSnapshot: snapshot,
        });
        return;
      }
      rafId = requestAnimationFrame(captureSnapshotWhenReady);
    };
    rafId = requestAnimationFrame(captureSnapshotWhenReady);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [compiledDoc, recordingHooks]);

  useEffect(() => {
    applySelectionHighlight(selection);
  }, [latex, selection]);

  useEffect(() => {
    if (!selection || isSelectionValidInDocument(compiledDoc, selection)) return;
    updateSelection(null);
  }, [compiledDoc, selection, updateSelection]);

  useEffect(() => {
    if (!insertionPreview) {
      setInsertionLineStyle(null);
      return;
    }

    const destinationRect = nodeResolutionRef.current.rectById[insertionPreview.destinationId];
    const containerRect = nodeResolutionRef.current.rectById[insertionPreview.containerId];
    const editorRootRect = editorRootRef.current?.getBoundingClientRect();
    if (!destinationRect || !containerRect || !editorRootRect) {
      setInsertionLineStyle(null);
      return;
    }

    if (insertionPreview.lineOrientation === "vertical") {
      const x = insertionPreview.destinationSlot === "after" ? destinationRect.right : destinationRect.left;
      setInsertionLineStyle({
        left: x - editorRootRect.left - 1,
        top: containerRect.top - editorRootRect.top,
        width: 2,
        height: containerRect.height,
      });
      return;
    }

    const y = insertionPreview.destinationSlot === "after" ? destinationRect.bottom : destinationRect.top;
    setInsertionLineStyle({
      left: containerRect.left - editorRootRect.left,
      top: y - editorRootRect.top - 1,
      width: containerRect.width,
      height: 2,
    });
  }, [insertionPreview]);

  useEffect(() => {
    // Any AST refresh invalidates cached drag evaluation.
    lastDragEngineQueryKeyRef.current = null;
    insertionPreviewRef.current = null;
    setInsertionPreview(null);
    setInsertionLineStyle(null);
    recordingHooks?.onPreviewChanged?.(null);
  }, [compiledDoc, moveType]);

  const applySelectionEvent = (event: SelectionControllerEvent) => {
    const result = resolveSelectionFromEvent({
      event,
      currentSelection: selection,
      nodeResolutionSource: nodeResolutionRef.current,
      index: compiledDoc.index,
      state: selectionStateRef.current,
    });
    selectionStateRef.current = result;
    updateSelection(result.selection);
  };

  const updateInsertionPreview = (preview: InsertionPreview | null) => {
    insertionPreviewRef.current = preview;
    setInsertionPreview(preview);
    recordingHooks?.onPreviewChanged?.(preview);
  };

  const updateMoveType = (nextMoveType: MoveType) => {
    if (moveType === nextMoveType) return;
    setMoveType(nextMoveType);
  };

  const openSubstituteModal = useCallback(() => {
    if (!substitutionSelection) return;
    substituteModalSessionRef.current += 1;
    setSubstituteLatex("");
    setSubstituteError(null);
    setIsSubstituteModalOpen(true);
  }, [substitutionSelection]);

  const onFactorRequested = useCallback(() => {
    if (!selection || !canFactor) return;
    const nextExpr = autoRewriteSelection(compiledDoc, selection, "factor");
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canFactor, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onDistributeRequested = useCallback(() => {
    if (!selection || !canDistribute) return;
    const nextExpr = autoRewriteSelection(compiledDoc, selection, "distribute");
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canDistribute, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onCleanupRequested = useCallback(() => {
    if (!selection || !canCleanup) return;
    const nextExpr = autoRewriteSelection(compiledDoc, selection, "cleanup");
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canCleanup, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onToggleNegateRequested = useCallback(() => {
    if (!selection || selection.kind !== "single" || !canToggleNegate) return;
    const nextExpr = toggleNegateSelection(compiledDoc, selection.nodeId);
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canToggleNegate, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onToggleDelimiterRequested = useCallback(() => {
    if (!selection || !canToggleDelimiter) return;
    const nextExpr = toggleDelimiterSelection(compiledDoc, selection);
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canToggleDelimiter, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onCycleDelimiterRequested = useCallback(() => {
    if (!selection || !canCycleDelimiter) return;
    const nextExpr = cycleDelimiterSelection(compiledDoc, selection);
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canCycleDelimiter, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const openApplyOperationModal = useCallback(() => {
    if (!canApplyOperation) return;
    setApplyOperationLatex("");
    setApplyOperationError(null);
    applyOperationModalSessionRef.current += 1;
    setIsApplyOperationModalOpen(true);
  }, [canApplyOperation]);

  const resolveInsertionPreviewAtPoint = (pointer: { x: number; y: number }): InsertionPreview | null => {
    if (!selection) return null;

    const destinationId = resolveSelectableNodeAtPoint(
      pointer,
      nodeResolutionRef.current,
      compiledDoc.index,
      DRAG_PREVIEW_HIT_TEST_PADDING_PX,
    );
    if (!destinationId || selectionContainsNode(selection, destinationId)) return null;

    const rectById: Record<string, NodeHorizontalBounds> = {};
    for (const [nodeId, rect] of Object.entries(nodeResolutionRef.current.rectById)) {
      rectById[nodeId] = { left: rect.left, right: rect.right };
    }

    const destinationRect = rectById[destinationId];
    if (!destinationRect) return null;

    const destinationSlot = resolveHorizontalInsertionSlot(pointer.x, destinationRect);
    return canExecuteMove({
      document: compiledDoc,
      selection,
      destinationId,
      moveType,
      destinationSlot,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.shiftKey && key === "z") {
        if (!canRedo || !onRedoRequested) return;
        event.preventDefault();
        onRedoRequested();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "y") {
        if (!canRedo || !onRedoRequested) return;
        event.preventDefault();
        onRedoRequested();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "z") {
        if (!canUndo || !onUndoRequested) return;
        event.preventDefault();
        onUndoRequested();
        return;
      }

      if (isSubstituteModalOpen || isApplyOperationModalOpen) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === "s") {
        if (!canSubstitute) return;
        event.preventDefault();
        openSubstituteModal();
        return;
      }

      if (key === "f") {
        if (!canFactor) return;
        event.preventDefault();
        onFactorRequested();
        return;
      }

      if (key === "d") {
        if (!canDistribute) return;
        event.preventDefault();
        onDistributeRequested();
        return;
      }

      if (key !== "a") return;
      event.preventDefault();
      setMoveType((currentMoveType) => (currentMoveType === "additive" ? "multiplicative" : "additive"));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    canDistribute,
    canFactor,
    canRedo,
    canSubstitute,
    canUndo,
    isApplyOperationModalOpen,
    isSubstituteModalOpen,
    onDistributeRequested,
    onFactorRequested,
    onRedoRequested,
    onUndoRequested,
    openSubstituteModal,
  ]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartPointerRef.current = { x: event.clientX, y: event.clientY };
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    applySelectionEvent({
      type: "pointer_down",
      pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      ts: event.timeStamp,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
    recordingHooks?.onPointerDownEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointerUp = { x: event.clientX, y: event.clientY };
    const hasDragged =
      !!dragStartPointerRef.current &&
      distanceBetweenPoints(dragStartPointerRef.current, pointerUp) >= DRAG_COMMIT_THRESHOLD_PX;
    const previewToApply = event.ctrlKey || !hasDragged ? null : resolveInsertionPreviewAtPoint(pointerUp);
    if (selection && previewToApply) {
      const moveResult = executeMove({
        document: compiledDoc,
        selection,
        destinationId: previewToApply.destinationId,
        moveType,
        destinationSlot: previewToApply.destinationSlot,
      });
      if (moveResult) {
        onCanonicalLatexChanged(moveResult.latex);
      }
    }

    applySelectionEvent({
      type: "pointer_up",
      pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      ts: event.timeStamp,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      suppressClickSelectionWhenDragging: !!selection,
    });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartPointerRef.current = null;
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
    recordingHooks?.onPointerUpEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selection) return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;

    const destinationId = resolveSelectableNodeAtPoint(
      { x: event.clientX, y: event.clientY },
      nodeResolutionRef.current,
      compiledDoc.index,
      DRAG_PREVIEW_HIT_TEST_PADDING_PX,
    );
    if (!destinationId || selectionContainsNode(selection, destinationId)) {
      lastDragEngineQueryKeyRef.current = null;
      updateInsertionPreview(null);
      return;
    }

    const rectById: Record<string, NodeHorizontalBounds> = {};
    for (const [nodeId, rect] of Object.entries(nodeResolutionRef.current.rectById)) {
      rectById[nodeId] = { left: rect.left, right: rect.right };
    }

    const destinationRect = rectById[destinationId];
    if (!destinationRect) {
      lastDragEngineQueryKeyRef.current = null;
      updateInsertionPreview(null);
      return;
    }

    const destinationSlot = resolveHorizontalInsertionSlot(event.clientX, destinationRect);
    const queryKey = `${selectionKey(selection)}|${destinationId}|${moveType}|${destinationSlot}`;
    if (queryKey === lastDragEngineQueryKeyRef.current) return;
    lastDragEngineQueryKeyRef.current = queryKey;
    recordingHooks?.onPointerMoveEvent?.({
      x: event.clientX,
      y: event.clientY,
      domSnapshotId: currentDomSnapshotIdRef.current,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
    });

    const preview = canExecuteMove({
      document: compiledDoc,
      selection,
      destinationId,
      moveType,
      destinationSlot,
    });
    updateInsertionPreview(preview);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartPointerRef.current = null;
    applySelectionEvent({
      type: "pointer_cancel",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
  };

  const onLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartPointerRef.current = null;
    applySelectionEvent({
      type: "lost_pointer_capture",
      pointerId: event.pointerId,
      ts: event.timeStamp,
    });
    lastDragEngineQueryKeyRef.current = null;
    updateInsertionPreview(null);
  };

  const onFlipRelationRequested = () => {
    if (!canFlip) return;
    onCanonicalLatexChanged(exprToLatex(flipRelation(compiledDoc.expr), false));
  };

  const closeSubstituteModal = () => {
    setIsSubstituteModalOpen(false);
    setSubstituteError(null);
  };

  const closeApplyOperationModal = () => {
    setIsApplyOperationModalOpen(false);
    setApplyOperationError(null);
  };

  const acceptSubstitution = (latestLatex?: string) => {
    if (!selection) {
      setSubstituteError("Select an expression to substitute.");
      return;
    }

    const nextLatex = typeof latestLatex === "string" ? latestLatex : substituteLatex;
    if (!nextLatex.trim()) {
      setSubstituteError("Enter a replacement expression.");
      return;
    }

    let replacement;
    try {
      replacement = parseLatexToExpr(nextLatex, { onError: "throw" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse replacement.";
      setSubstituteError(
        message.includes("still contains placeholders")
          ? "Fill or remove every placeholder before substituting."
          : message,
      );
      return;
    }

    if (!isValidSubstitutionReplacement(replacement)) {
      setSubstituteError("Enter an expression, not an equation or inequality.");
      return;
    }

    const nextExpr = substituteSelection(compiledDoc, selection, replacement);
    if (!nextExpr) {
      setSubstituteError("Substitution failed for this selection.");
      return;
    }

    const nextEquationLatex = exprToLatex(nextExpr, false);
    setSubstituteLatex("");
    setSubstituteError(null);
    setIsSubstituteModalOpen(false);
    updateSelection(null);
    onCanonicalLatexChanged(nextEquationLatex);
  };

  const acceptApplyOperation = (latestLatex?: string) => {
    const nextLatex = normalizeApplyOperationLatex(
      typeof latestLatex === "string" ? latestLatex : applyOperationLatex,
    );
    if (!nextLatex.trim()) {
      setApplyOperationError("Enter an operation template.");
      return;
    }

    let template;
    try {
      template = parseLatexToExpr(nextLatex, { onError: "throw" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse operation template.";
      setApplyOperationError(
        message.includes("still contains placeholders")
          ? "Fill or remove every placeholder before applying the operation."
          : message,
      );
      return;
    }

    const validationError = validateOperationTemplate(template);
    if (validationError) {
      setApplyOperationError(validationError);
      return;
    }

    const nextExpr = applyOperationToRelation(compiledDoc.expr, template);
    if (!nextExpr) {
      setApplyOperationError("Apply operation failed for this relation.");
      return;
    }

    setApplyOperationError(null);
    setIsApplyOperationModalOpen(false);
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <EquationToolbar
        moveType={moveType}
        onMoveTypeChanged={updateMoveType}
        canUndo={canUndo}
        onUndoRequested={onUndoRequested}
        canRedo={canRedo}
        onRedoRequested={onRedoRequested}
        canFlip={canFlip}
        onFlipRelationRequested={onFlipRelationRequested}
        canSubstitute={canSubstitute}
        onSubstituteRequested={openSubstituteModal}
        canApplyOperation={canApplyOperation}
        onApplyOperationRequested={openApplyOperationModal}
        canFactor={canFactor}
        onFactorRequested={onFactorRequested}
        canDistribute={canDistribute}
        onDistributeRequested={onDistributeRequested}
        canCleanup={canCleanup}
        onCleanupRequested={onCleanupRequested}
        canToggleNegate={canToggleNegate}
        onToggleNegateRequested={onToggleNegateRequested}
        canToggleDelimiter={canToggleDelimiter}
        onToggleDelimiterRequested={onToggleDelimiterRequested}
        canCycleDelimiter={canCycleDelimiter}
        onCycleDelimiterRequested={onCycleDelimiterRequested}
      />
      <div
        ref={editorRootRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        style={{
          flex: 1,
          minHeight: "100px",
          position: "relative",
          boxSizing: "border-box",
          color: "rgba(255, 255, 255, 1.0)",
          paddingLeft: "12px",
          paddingRight: "12px",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
        }}
      >
        <math-div
          ref={mathDivRef}
          data-testid="math-div-output"
          mode="displaystyle"
          value={compiledDoc.taggedLatex}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: "1.2rem",
          }}
        />
        {insertionPreview && insertionLineStyle && (
          <div
            data-testid="insertion-preview-line"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none",
              background: "#4caf50",
              borderRadius: "1px",
              zIndex: 1,
              transform: `translate(${insertionLineStyle.left}px, ${insertionLineStyle.top}px)`,
              width: `${insertionLineStyle.width}px`,
              height: `${insertionLineStyle.height}px`,
            }}
          />
        )}
      </div>
      {isSubstituteModalOpen && substitutionSelection && (
        <SubstituteModal
          selectedLatex={substitutionSelection.latex}
          replacementLatex={substituteLatex}
          error={substituteError}
          focusSession={substituteModalSessionRef.current}
          onReplacementLatexChange={(nextLatex) => {
            setSubstituteLatex(nextLatex);
            setSubstituteError(null);
          }}
          onAccept={acceptSubstitution}
          onCancel={closeSubstituteModal}
        />
      )}
      {isApplyOperationModalOpen && (
        <ApplyOperationModal
          operationLatex={applyOperationLatex}
          error={applyOperationError}
          focusSession={applyOperationModalSessionRef.current}
          onOperationLatexChange={(nextLatex) => {
            setApplyOperationLatex(nextLatex);
            setApplyOperationError(null);
          }}
          onAccept={acceptApplyOperation}
          onCancel={closeApplyOperationModal}
        />
      )}
    </div>
  );
}
