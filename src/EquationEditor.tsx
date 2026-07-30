import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  type NodeRect,
  captureGeometryFromMathdiv,
  DRAG_COMMIT_THRESHOLD_PX,
  DRAG_PREVIEW_HIT_TEST_PADDING_PX,
  rectFromPoints,
  resolveNodeAtPoint,
  resolveMoveDestinationNodeAtPoint,
  resolveSelectionFromEvent,
  type SelectionControllerEvent,
  selectionSet,
  type RectBounds,
} from "./interaction/selectionController";
import type { TermSelection } from "@physics-derivation-pad/core/selection";
import {
  canToggleFunctionSymbol,
  isFunctionSymbolSelectionTagged,
  toggleFunctionSymbol,
  type CompiledMathDocument,
} from "@physics-derivation-pad/core/compile";
import { exprToLatex, parseLatexToExpr } from "@physics-derivation-pad/core/latex";
import {
  applyDefaultIdentityRewriteToSelection,
  applyIdentityRewriteToSelection,
  applyOperationToFraction,
  applyOperationToRelation,
  autoRewriteSelection,
  canApplyOperationToFraction,
  canApplyOperationToRelation,
  canAutoRewrite,
  canCycleDelimiterSelection,
  canEvaluateWithAlgebrite,
  canExecuteMove,
  canFlipRelation,
  canForceFactorSelection,
  canToggleDelimiterSelection,
  canToggleNegateSelection,
  cycleDelimiterSelection,
  evaluateSelectionWithAlgebrite,
  executeMove,
  flipRelation,
  forceFactorSelection,
  getApplicableIdentityRewritesForSelection,
  getReplaceableSymbols,
  getSelectionRewriteTarget,
  getSubstitutionSelection,
  isValidSubstitutionReplacement,
  operationPlaceholderForTarget,
  resolveHorizontalInsertionSlot,
  substituteAllMatchingExpressions,
  substituteSelection,
  toggleDelimiterSelection,
  toggleNegateSelection,
  validateForceFactorExpr,
  type ApplyOperationTargetKind,
  type InsertionPreview,
  type MoveType,
  type NodeHorizontalBounds,
  validateOperationTemplate,
} from "@physics-derivation-pad/core/rewrite";
import type { EquationEditorRecordingHooks } from "./EquationEditorRecordingHooks";
import { EquationToolbar } from "./EquationToolbar";
import { SubstituteModal } from "./SubstituteModal";
import { SymbolReplacementModal, type SymbolReplacementDraft } from "./SymbolReplacementModal";
import { ApplyOperationModal } from "./ApplyOperationModal";
import { ForceFactorModal } from "./ForceFactorModal";
import { buildPadSubstituteSuggestions, type PadDefinitionSource } from "./substituteSuggestions";
import type { FunctionSymbolTag } from "./EquationRowState";
import { formatEquationHistoryLatexForCopy, formatEquationLatexForCopy } from "./copyLatex";

type InsertionLineStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MarqueeDraft = {
  pointerId: number;
  origin: { x: number; y: number };
  current: { x: number; y: number };
};

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
    .replace(/\\mathrm\{eqn\}/g, String.raw`\eqn`)
    .replace(/\\mathord\{\\mathrm\{part\}\}/g, String.raw`\part`)
    .replace(/\\mathrm\{part\}/g, String.raw`\part`);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below for browsers that block async clipboard access.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function isSelectionValidInDocument(document: CompiledMathDocument, selection: TermSelection): boolean {
  const { nodeById } = document.index;
  if (selection.kind === "single") {
    return !!nodeById[selection.nodeId];
  }
  if (!selection.containerNodeId || !nodeById[selection.containerNodeId]) return false;
  return selection.nodeIds.every((nodeId) => !!nodeById[nodeId]);
}

function selectionSubtreeSet(document: CompiledMathDocument, selection: TermSelection | null): Set<string> {
  const selectedNodeIds = selectionSet(selection);
  const nodeIds = new Set<string>(selectedNodeIds);
  const visit = (nodeId: string) => {
    for (const childId of document.index.childrenById[nodeId] ?? []) {
      if (nodeIds.has(childId)) continue;
      nodeIds.add(childId);
      visit(childId);
    }
  };
  for (const nodeId of selectedNodeIds) visit(nodeId);
  return nodeIds;
}

type EquationEditorProps = {
  compiledDoc: CompiledMathDocument;
  functionSymbols: FunctionSymbolTag[];
  onFunctionSymbolsChanged: (nextFunctionSymbols: FunctionSymbolTag[]) => void;
  onCanonicalLatexChanged: (nextLatex: string) => void;
  canUndo?: boolean;
  onUndoRequested?: () => void;
  canRedo?: boolean;
  onRedoRequested?: () => void;
  onEditRequested?: () => void;
  recordingHooks?: EquationEditorRecordingHooks;
  isActive?: boolean;
  substituteSuggestionSources?: PadDefinitionSource[];
  wrapEquationCopiesInDisplayMath?: boolean;
  equationHistoryLatexes?: string[];
};

const DEBUG_DRAW_NODE_RECTS = false;

export function EquationEditor({
  compiledDoc,
  functionSymbols,
  onFunctionSymbolsChanged,
  onCanonicalLatexChanged,
  canUndo = false,
  onUndoRequested,
  canRedo = false,
  onRedoRequested,
  onEditRequested,
  recordingHooks,
  isActive = true,
  substituteSuggestionSources = [],
  wrapEquationCopiesInDisplayMath = false,
  equationHistoryLatexes = [],
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
  const [isSymbolReplacementModalOpen, setIsSymbolReplacementModalOpen] = useState(false);
  const [isApplyOperationModalOpen, setIsApplyOperationModalOpen] = useState(false);
  const [isForceFactorModalOpen, setIsForceFactorModalOpen] = useState(false);
  const [applyOperationTargetKind, setApplyOperationTargetKind] =
    useState<ApplyOperationTargetKind>("relation");
  const [substituteLatex, setSubstituteLatex] = useState("");
  const [forceFactorLatex, setForceFactorLatex] = useState("");
  const [substituteError, setSubstituteError] = useState<string | null>(null);
  const [forceFactorError, setForceFactorError] = useState<string | null>(null);
  const [symbolReplacementRows, setSymbolReplacementRows] = useState<SymbolReplacementDraft[]>([]);
  const [symbolReplacementError, setSymbolReplacementError] = useState<string | null>(null);
  const [applyOperationLatex, setApplyOperationLatex] = useState("");
  const [applyOperationError, setApplyOperationError] = useState<string | null>(null);
  const [applyOperationSwitchInequality, setApplyOperationSwitchInequality] = useState(false);
  const [forceFactorModalSession, setForceFactorModalSession] = useState(0);
  const [copyEquationFeedback, setCopyEquationFeedback] = useState<"idle" | "done">("idle");
  const [copyHistoryFeedback, setCopyHistoryFeedback] = useState<"idle" | "done">("idle");
  const [copySelectionFeedback, setCopySelectionFeedback] = useState<"idle" | "done">("idle");
  const [insertionLineStyle, setInsertionLineStyle] = useState<InsertionLineStyle | null>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<MarqueeDraft | null>(null);
  const [debugNodeRects, setDebugNodeRects] = useState<NodeRect[]>([]);
  const lastSelectionKeyRef = useRef<string>("null");
  const selectionStateRef = useRef(createSelectionControllerState());
  const lastDragEngineQueryKeyRef = useRef<string | null>(null);
  const snapshotCounterRef = useRef(0);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const currentDomSnapshotIdRef = useRef<string | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeDraftRef = useRef<MarqueeDraft | null>(null);
  const copyEquationFeedbackTimeoutRef = useRef<number | null>(null);
  const copyHistoryFeedbackTimeoutRef = useRef<number | null>(null);
  const copySelectionFeedbackTimeoutRef = useRef<number | null>(null);
  const substituteModalSessionRef = useRef(0);
  const symbolReplacementModalSessionRef = useRef(0);
  const applyOperationModalSessionRef = useRef(0);
  const canFlip = canFlipRelation(compiledDoc.expr);
  const substitutionSelection = useMemo(
    () => getSubstitutionSelection(compiledDoc, selection),
    [compiledDoc, selection],
  );
  const substituteSuggestions = useMemo(
    () => buildPadSubstituteSuggestions(substitutionSelection, substituteSuggestionSources),
    [substituteSuggestionSources, substitutionSelection],
  );
  const selectionLatexForCopy = substitutionSelection?.latex ?? "";
  const canCopyEquation = compiledDoc.plainLatex.trim().length > 0;
  const historyLatexesForCopy = useMemo(
    () => equationHistoryLatexes.filter((latex) => latex.trim().length > 0),
    [equationHistoryLatexes],
  );
  const canCopyHistory = historyLatexesForCopy.length > 0;
  const canCopySelection = selectionLatexForCopy.trim().length > 0;
  const canSubstitute = substitutionSelection !== null;
  const replaceableSymbols = useMemo(() => getReplaceableSymbols(compiledDoc), [compiledDoc]);
  const canSubstituteAllMatches = replaceableSymbols.length > 0;
  const canApplyOperationToCurrentRelation = canApplyOperationToRelation(compiledDoc.expr);
  const canApplyOperationToSelectedFraction = canApplyOperationToFraction(compiledDoc, selection);
  const canApplyOperation = canApplyOperationToCurrentRelation || canApplyOperationToSelectedFraction;
  const canSwitchApplyOperationInequality =
    applyOperationTargetKind === "relation" && compiledDoc.expr.kind === "inequality";
  const canFactor = canAutoRewrite(compiledDoc, selection, "factor");
  const canForceFactor = canForceFactorSelection(compiledDoc, selection);
  const canDistribute = canAutoRewrite(compiledDoc, selection, "distribute");
  const canCleanup = canAutoRewrite(compiledDoc, selection, "cleanup");
  const canEvaluateSelectionWithAlgebrite = canEvaluateWithAlgebrite(compiledDoc, selection);
  const identityRewriteOptions = useMemo(
    () => getApplicableIdentityRewritesForSelection(compiledDoc, selection),
    [compiledDoc, selection],
  );
  const canApplyIdentityRewrite = identityRewriteOptions.length > 0;
  const canToggleNegate =
    selection?.kind === "single" ? canToggleNegateSelection(compiledDoc, selection.nodeId) : false;
  const canToggleDelimiter = canToggleDelimiterSelection(compiledDoc, selection);
  const canCycleDelimiter = canCycleDelimiterSelection(compiledDoc, selection);
  const selectedNodeId = selection?.kind === "single" ? selection.nodeId : null;
  const canToggleFunctionSymbolSelection = canToggleFunctionSymbol(compiledDoc, selectedNodeId);
  const isFunctionSymbolSelected = isFunctionSymbolSelectionTagged(
    compiledDoc,
    functionSymbols,
    selectedNodeId,
  );

  const publishGeometrySnapshot = useCallback(() => {
    const snapshot = captureGeometryFromMathdiv(mathDivRef.current);
    const currentNodeRects =
      snapshot?.nodeRects.filter((rect) => !!compiledDoc.index.nodeById[rect.nodeId]) ?? [];
    const nodeResolution = buildNodeResolutionSource(currentNodeRects, compiledDoc.index);
    nodeRectsRef.current = nodeResolution.nodeRects;
    if (DEBUG_DRAW_NODE_RECTS) setDebugNodeRects(nodeRectsRef.current);
    nodeResolutionRef.current = nodeResolution;

    if (!snapshot) {
      lastSnapshotKeyRef.current = null;
      currentDomSnapshotIdRef.current = null;
      recordingHooks?.onDomSnapshotObserved?.({
        domSnapshotId: null,
        domSnapshot: null,
      });
      return null;
    }

    const currentSnapshot = {
      ...snapshot,
      nodeRects: nodeResolution.nodeRects,
    };

    const snapshotKey = JSON.stringify(currentSnapshot);
    if (snapshotKey !== lastSnapshotKeyRef.current) {
      snapshotCounterRef.current += 1;
      currentDomSnapshotIdRef.current = `s${snapshotCounterRef.current}`;
      lastSnapshotKeyRef.current = snapshotKey;
    }

    recordingHooks?.onDomSnapshotObserved?.({
      domSnapshotId: currentDomSnapshotIdRef.current,
      domSnapshot: currentSnapshot,
    });
    return currentSnapshot;
  }, [compiledDoc.index, recordingHooks]);

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

    const functionEls = Array.from(shadowRoot.querySelectorAll<HTMLElement>(".pdp-user-function"));
    for (const el of functionEls) {
      el.style.color = "rgba(255, 255, 255, 0.72)";
    }

    const els = Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"));
    const selectedNodeIds = selectionSubtreeSet(compiledDoc, nextSelection);
    for (const el of els) {
      const nodeId = el.dataset.nodeId;
      const isSelected = !!nodeId && selectedNodeIds.has(nodeId);
      el.style.color = isSelected ? "#ff9800" : "";
      if (isSelected) {
        for (const functionEl of Array.from(el.querySelectorAll<HTMLElement>(".pdp-user-function"))) {
          functionEl.style.color = "#ff9800";
        }
      }
      el.style.opacity = "";
      el.style.outline = "";
    }
  };

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
      const snapshot = publishGeometrySnapshot();
      applySelectionHighlight(selectionRef.current);
      const hasRenderableDom = !!snapshot && snapshot.hostRect.height > 0 && snapshot.nodeRects.length > 0;
      if (hasRenderableDom || attempts >= maxAttempts) {
        return;
      }
      rafId = requestAnimationFrame(captureSnapshotWhenReady);
    };
    rafId = requestAnimationFrame(captureSnapshotWhenReady);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [compiledDoc, publishGeometrySnapshot]);

  useEffect(() => {
    applySelectionHighlight(selection);
  }, [compiledDoc, functionSymbols, selection]);

  useEffect(() => {
    if (!selection || isSelectionValidInDocument(compiledDoc, selection)) return;
    updateSelection(null);
  }, [compiledDoc, selection, updateSelection]);

  useEffect(() => {
    return () => {
      if (copyEquationFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyEquationFeedbackTimeoutRef.current);
      }
      if (copyHistoryFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyHistoryFeedbackTimeoutRef.current);
      }
      if (copySelectionFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copySelectionFeedbackTimeoutRef.current);
      }
    };
  }, []);

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

  const updateMarqueeDraft = (draft: MarqueeDraft | null) => {
    marqueeDraftRef.current = draft;
    setMarqueeDraft(draft);
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

  const markCopyEquationSuccess = () => {
    setCopyEquationFeedback("done");
    if (copyEquationFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyEquationFeedbackTimeoutRef.current);
    }
    copyEquationFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyEquationFeedback("idle");
    }, 900);
  };

  const markCopySelectionSuccess = () => {
    setCopySelectionFeedback("done");
    if (copySelectionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copySelectionFeedbackTimeoutRef.current);
    }
    copySelectionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopySelectionFeedback("idle");
    }, 900);
  };

  const markCopyHistorySuccess = () => {
    setCopyHistoryFeedback("done");
    if (copyHistoryFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyHistoryFeedbackTimeoutRef.current);
    }
    copyHistoryFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyHistoryFeedback("idle");
    }, 900);
  };

  const onCopyEquationRequested = useCallback(async () => {
    if (!canCopyEquation) return;
    const latexForCopy = formatEquationLatexForCopy(compiledDoc.plainLatex, wrapEquationCopiesInDisplayMath);
    const copied = await copyTextToClipboard(latexForCopy);
    if (copied) markCopyEquationSuccess();
  }, [canCopyEquation, compiledDoc.plainLatex, wrapEquationCopiesInDisplayMath]);

  const onCopySelectionRequested = useCallback(async () => {
    if (!canCopySelection) return;
    const copied = await copyTextToClipboard(selectionLatexForCopy);
    if (copied) markCopySelectionSuccess();
  }, [canCopySelection, selectionLatexForCopy]);

  const onCopyHistoryRequested = useCallback(async () => {
    if (!canCopyHistory) return;
    const copied = await copyTextToClipboard(formatEquationHistoryLatexForCopy(historyLatexesForCopy));
    if (copied) markCopyHistorySuccess();
  }, [canCopyHistory, historyLatexesForCopy]);

  const openSubstituteModal = useCallback(() => {
    if (!substitutionSelection) return;
    substituteModalSessionRef.current += 1;
    setSubstituteLatex(substitutionSelection.latex);
    setSubstituteError(null);
    setIsSubstituteModalOpen(true);
  }, [substitutionSelection]);

  const openSubstituteAllMatchesModal = useCallback(() => {
    if (!canSubstituteAllMatches) return;
    symbolReplacementModalSessionRef.current += 1;
    setSymbolReplacementRows(
      replaceableSymbols.map((symbol) => ({
        key: symbol.key,
        source: symbol,
        enabled: false,
        replacementLatex: symbol.latex,
      })),
    );
    setSymbolReplacementError(null);
    setIsSymbolReplacementModalOpen(true);
  }, [canSubstituteAllMatches, replaceableSymbols]);

  const openForceFactorModal = useCallback(() => {
    if (!canForceFactor) return;
    setForceFactorLatex("");
    setForceFactorError(null);
    setForceFactorModalSession((session) => session + 1);
    setIsForceFactorModalOpen(true);
  }, [canForceFactor]);

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

  const onEvaluateWithAlgebriteRequested = useCallback(() => {
    if (!selection || !canEvaluateSelectionWithAlgebrite) return;
    const result = evaluateSelectionWithAlgebrite(compiledDoc, selection);
    if (!result.ok) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(result.expr, false));
  }, [canEvaluateSelectionWithAlgebrite, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onApplyDefaultIdentityRequested = useCallback(() => {
    if (!selection || !canApplyIdentityRewrite) return;
    const nextExpr = applyDefaultIdentityRewriteToSelection(compiledDoc, selection);
    if (!nextExpr) return;
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  }, [canApplyIdentityRewrite, compiledDoc, onCanonicalLatexChanged, selection, updateSelection]);

  const onApplyIdentityRequested = useCallback(
    (identityId: string) => {
      if (!selection || !canApplyIdentityRewrite) return;
      const nextExpr = applyIdentityRewriteToSelection(compiledDoc, selection, identityId);
      if (!nextExpr) return;
      updateSelection(null);
      onCanonicalLatexChanged(exprToLatex(nextExpr, false));
    },
    [canApplyIdentityRewrite, compiledDoc, onCanonicalLatexChanged, selection, updateSelection],
  );

  const onToggleFunctionSymbolRequested = useCallback(() => {
    if (!selection || selection.kind !== "single" || !canToggleFunctionSymbolSelection) return;
    onFunctionSymbolsChanged(toggleFunctionSymbol(compiledDoc, functionSymbols, selection.nodeId));
  }, [canToggleFunctionSymbolSelection, compiledDoc, functionSymbols, onFunctionSymbolsChanged, selection]);

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
    setApplyOperationTargetKind(canApplyOperationToSelectedFraction ? "fraction" : "relation");
    setApplyOperationLatex("");
    setApplyOperationError(null);
    setApplyOperationSwitchInequality(false);
    applyOperationModalSessionRef.current += 1;
    setIsApplyOperationModalOpen(true);
  }, [canApplyOperation, canApplyOperationToSelectedFraction]);

  const resolveInsertionPreviewAtPoint = (pointer: { x: number; y: number }): InsertionPreview | null => {
    if (!selection) return null;

    const destinationId = resolveMoveDestinationNodeAtPoint(
      pointer,
      nodeResolutionRef.current,
      compiledDoc.index,
      moveType,
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
      if (!isActive) return;
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

      if (
        isSubstituteModalOpen ||
        isSymbolReplacementModalOpen ||
        isApplyOperationModalOpen ||
        isForceFactorModalOpen
      )
        return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.shiftKey && key === "c") {
        if (!canCopySelection) return;
        event.preventDefault();
        void onCopySelectionRequested();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "c") {
        if (!canCopyEquation) return;
        event.preventDefault();
        void onCopyEquationRequested();
        return;
      }

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

      if (key === "c") {
        if (!canCleanup) return;
        event.preventDefault();
        onCleanupRequested();
        return;
      }

      if (key === "d") {
        if (!canDistribute) return;
        event.preventDefault();
        onDistributeRequested();
        return;
      }

      if (key === "t") {
        if (!canApplyIdentityRewrite) return;
        event.preventDefault();
        onApplyDefaultIdentityRequested();
        return;
      }

      if (key === "e") {
        if (!onEditRequested) return;
        event.preventDefault();
        onEditRequested();
        return;
      }

      if (key === "p") {
        if (!canToggleDelimiter) return;
        event.preventDefault();
        onToggleDelimiterRequested();
        return;
      }

      if (key === "n") {
        if (!canToggleNegate) return;
        event.preventDefault();
        onToggleNegateRequested();
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
    canApplyIdentityRewrite,
    canEvaluateSelectionWithAlgebrite,
    canFactor,
    canCleanup,
    canCopyEquation,
    canCopySelection,
    canRedo,
    canSubstitute,
    canSubstituteAllMatches,
    canToggleDelimiter,
    canToggleNegate,
    canUndo,
    isActive,
    isApplyOperationModalOpen,
    isForceFactorModalOpen,
    isSymbolReplacementModalOpen,
    isSubstituteModalOpen,
    onCleanupRequested,
    onCopyEquationRequested,
    onCopySelectionRequested,
    onDistributeRequested,
    onEvaluateWithAlgebriteRequested,
    onApplyDefaultIdentityRequested,
    onEditRequested,
    onFactorRequested,
    onRedoRequested,
    onToggleDelimiterRequested,
    onToggleNegateRequested,
    onUndoRequested,
    openSubstituteModal,
    openSubstituteAllMatchesModal,
  ]);

  useEffect(() => {
    if (isActive) return;
    updateSelection(null);
    updateInsertionPreview(null);
  }, [isActive, updateInsertionPreview, updateSelection]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = { x: event.clientX, y: event.clientY };
    dragStartPointerRef.current = pointer;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    publishGeometrySnapshot();
    const hit = resolveNodeAtPoint(pointer, nodeResolutionRef.current, compiledDoc.index);
    if (!hit.treeHitNodeId && !event.ctrlKey) {
      updateMarqueeDraft({
        pointerId: event.pointerId,
        origin: pointer,
        current: pointer,
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
      return;
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
    publishGeometrySnapshot();
    const marqueeDraft = marqueeDraftRef.current;
    if (marqueeDraft && marqueeDraft.pointerId === event.pointerId) {
      const hasDragged = distanceBetweenPoints(marqueeDraft.origin, pointerUp) >= DRAG_COMMIT_THRESHOLD_PX;
      if (hasDragged) {
        applySelectionEvent({
          type: "marquee_select",
          marqueeRect: rectFromPoints(marqueeDraft.origin, pointerUp),
        });
      } else {
        applySelectionEvent({
          type: "pointer_up",
          pointer: { x: event.clientX, y: event.clientY },
          pointerId: event.pointerId,
          ts: event.timeStamp,
          buttons: event.buttons,
          ctrlKey: event.ctrlKey,
          suppressClickSelectionWhenDragging: false,
        });
      }
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragStartPointerRef.current = null;
      updateMarqueeDraft(null);
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
      return;
    }
    const hasDragged =
      !!dragStartPointerRef.current &&
      distanceBetweenPoints(dragStartPointerRef.current, pointerUp) >= DRAG_COMMIT_THRESHOLD_PX;
    const previewToApply = event.ctrlKey || !hasDragged ? null : resolveInsertionPreviewAtPoint(pointerUp);
    let didApplyMove = false;
    if (selection && previewToApply) {
      const moveResult = executeMove({
        document: compiledDoc,
        selection,
        destinationId: previewToApply.destinationId,
        moveType,
        destinationSlot: previewToApply.destinationSlot,
      });
      if (moveResult) {
        didApplyMove = true;
        onCanonicalLatexChanged(moveResult.latex);
      }
    }

    if (didApplyMove) {
      selectionStateRef.current = {
        ...selectionStateRef.current,
        selection: null,
        pendingPointerDown: null,
        suppressSelectionOnNextPointerUp: false,
      };
      updateSelection(null);
    } else {
      applySelectionEvent({
        type: "pointer_up",
        pointer: { x: event.clientX, y: event.clientY },
        pointerId: event.pointerId,
        ts: event.timeStamp,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        suppressClickSelectionWhenDragging: !!selection,
      });
    }
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
    const marqueeDraft = marqueeDraftRef.current;
    if (marqueeDraft && marqueeDraft.pointerId === event.pointerId) {
      updateMarqueeDraft({
        ...marqueeDraft,
        current: { x: event.clientX, y: event.clientY },
      });
      recordingHooks?.onPointerMoveEvent?.({
        x: event.clientX,
        y: event.clientY,
        domSnapshotId: currentDomSnapshotIdRef.current,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
      });
      return;
    }
    if (!selection) return;
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    publishGeometrySnapshot();

    const destinationId = resolveMoveDestinationNodeAtPoint(
      { x: event.clientX, y: event.clientY },
      nodeResolutionRef.current,
      compiledDoc.index,
      moveType,
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
    updateMarqueeDraft(null);
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
    updateMarqueeDraft(null);
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

  const closeSymbolReplacementModal = () => {
    setIsSymbolReplacementModalOpen(false);
    setSymbolReplacementError(null);
  };

  const closeApplyOperationModal = () => {
    setIsApplyOperationModalOpen(false);
    setApplyOperationError(null);
    setApplyOperationSwitchInequality(false);
  };

  const closeForceFactorModal = () => {
    setIsForceFactorModalOpen(false);
    setForceFactorError(null);
  };

  const updateSymbolReplacementRowEnabled = (key: string, enabled: boolean) => {
    setSymbolReplacementRows((rows) => rows.map((row) => (row.key === key ? { ...row, enabled } : row)));
    setSymbolReplacementError(null);
  };

  const updateSymbolReplacementLatex = (key: string, replacementLatex: string) => {
    setSymbolReplacementRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, replacementLatex, enabled: true } : row)),
    );
    setSymbolReplacementError(null);
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

  const acceptForceFactor = (latestLatex?: string) => {
    if (!selection) {
      setForceFactorError("Select a sum to factor.");
      return;
    }

    const nextLatex = typeof latestLatex === "string" ? latestLatex : forceFactorLatex;
    if (!nextLatex.trim()) {
      setForceFactorError("Enter a factor to pull out.");
      return;
    }

    let factor;
    try {
      factor = parseLatexToExpr(nextLatex, { onError: "throw" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse factor.";
      setForceFactorError(
        message.includes("still contains placeholders")
          ? "Fill or remove every placeholder before factoring."
          : message,
      );
      return;
    }

    const validationError = validateForceFactorExpr(factor);
    if (validationError) {
      setForceFactorError(validationError);
      return;
    }

    const nextExpr = forceFactorSelection(compiledDoc, selection, factor);
    if (!nextExpr) {
      setForceFactorError("Force factor failed for this selection.");
      return;
    }

    setForceFactorLatex("");
    setForceFactorError(null);
    setIsForceFactorModalOpen(false);
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  };

  const acceptSymbolReplacement = () => {
    const enabledRows = symbolReplacementRows.filter((row) => row.enabled);
    if (enabledRows.length === 0) {
      setSymbolReplacementError("Select at least one symbol to replace.");
      return;
    }

    const substitutions = [];
    for (const row of enabledRows) {
      if (!row.replacementLatex.trim()) {
        setSymbolReplacementError(`Enter a replacement for ${row.source.latex}.`);
        return;
      }

      let replacement;
      try {
        replacement = parseLatexToExpr(row.replacementLatex, { onError: "throw" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to parse replacement.";
        setSymbolReplacementError(
          message.includes("still contains placeholders")
            ? `Fill or remove every placeholder in the replacement for ${row.source.latex}.`
            : message,
        );
        return;
      }

      if (!isValidSubstitutionReplacement(replacement)) {
        setSymbolReplacementError(
          `Enter an expression for ${row.source.latex}, not an equation or inequality.`,
        );
        return;
      }

      substitutions.push({ target: row.source.expr, replacement });
    }

    const nextExpr = substituteAllMatchingExpressions(compiledDoc, substitutions);
    if (!nextExpr) {
      setSymbolReplacementError("Symbol replacement did not change this expression.");
      return;
    }

    setSymbolReplacementError(null);
    setIsSymbolReplacementModalOpen(false);
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  };

  const acceptApplyOperation = (latestLatex?: string) => {
    const targetKind = applyOperationTargetKind;
    const placeholder = operationPlaceholderForTarget(targetKind);
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

    const validationError = validateOperationTemplate(template, placeholder);
    if (validationError) {
      setApplyOperationError(validationError);
      return;
    }

    const nextExpr =
      targetKind === "relation"
        ? applyOperationToRelation(compiledDoc.expr, template, {
            switchInequality: applyOperationSwitchInequality,
          })
        : applyOperationToFraction(compiledDoc, selection, template);
    if (!nextExpr) {
      setApplyOperationError(
        targetKind === "relation"
          ? "Apply operation failed for this relation."
          : "Apply operation failed for this fraction.",
      );
      return;
    }

    setApplyOperationError(null);
    setIsApplyOperationModalOpen(false);
    updateSelection(null);
    onCanonicalLatexChanged(exprToLatex(nextExpr, false));
  };

  const editorRootRect = editorRootRef.current?.getBoundingClientRect();
  const selectedForceFactorLatex = selection
    ? exprToLatex(getSelectionRewriteTarget(compiledDoc, selection)?.expr ?? compiledDoc.expr, false)
    : "";
  const marqueeRect: RectBounds | null = marqueeDraft
    ? rectFromPoints(marqueeDraft.origin, marqueeDraft.current)
    : null;
  const marqueeStyle =
    marqueeRect && editorRootRect
      ? {
          left: marqueeRect.left - editorRootRect.left,
          top: marqueeRect.top - editorRootRect.top,
          width: marqueeRect.width,
          height: marqueeRect.height,
        }
      : null;
  const debugRectOverlays =
    DEBUG_DRAW_NODE_RECTS && editorRootRect
      ? debugNodeRects.map((rect) => ({
          nodeId: rect.nodeId,
          left: rect.left - editorRootRect.left,
          top: rect.top - editorRootRect.top,
          width: rect.width,
          height: rect.height,
        }))
      : [];

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
        canCopyEquation={canCopyEquation}
        onCopyEquationRequested={onCopyEquationRequested}
        copyEquationFeedback={copyEquationFeedback}
        canCopyHistory={canCopyHistory}
        onCopyHistoryRequested={onCopyHistoryRequested}
        copyHistoryFeedback={copyHistoryFeedback}
        canCopySelection={canCopySelection}
        onCopySelectionRequested={onCopySelectionRequested}
        copySelectionFeedback={copySelectionFeedback}
        canFlip={canFlip}
        onFlipRelationRequested={onFlipRelationRequested}
        canSubstitute={canSubstitute}
        onSubstituteRequested={openSubstituteModal}
        canSubstituteAllMatches={canSubstituteAllMatches}
        onSubstituteAllMatchesRequested={openSubstituteAllMatchesModal}
        canApplyOperation={canApplyOperation}
        onApplyOperationRequested={openApplyOperationModal}
        canFactor={canFactor}
        onFactorRequested={onFactorRequested}
        canForceFactor={canForceFactor}
        onForceFactorRequested={openForceFactorModal}
        canDistribute={canDistribute}
        onDistributeRequested={onDistributeRequested}
        canCleanup={canCleanup}
        onCleanupRequested={onCleanupRequested}
        canEvaluate={canEvaluateSelectionWithAlgebrite}
        onEvaluateRequested={onEvaluateWithAlgebriteRequested}
        identityRewriteOptions={identityRewriteOptions}
        canApplyIdentityRewrite={canApplyIdentityRewrite}
        onApplyDefaultIdentityRequested={onApplyDefaultIdentityRequested}
        onApplyIdentityRequested={onApplyIdentityRequested}
        canToggleNegate={canToggleNegate}
        onToggleNegateRequested={onToggleNegateRequested}
        canToggleFunctionSymbol={canToggleFunctionSymbolSelection}
        isFunctionSymbolSelected={isFunctionSymbolSelected}
        onToggleFunctionSymbolRequested={onToggleFunctionSymbolRequested}
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
        {debugRectOverlays.map((rect) => (
          <div
            key={rect.nodeId}
            title={rect.nodeId}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none",
              zIndex: 3,
              transform: `translate(${rect.left}px, ${rect.top}px)`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              border: "1px solid rgba(0, 188, 212, 0.75)",
              background: "rgba(0, 188, 212, 0.08)",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: "translateY(-100%)",
                fontSize: "9px",
                lineHeight: 1,
                color: "#00e5ff",
                background: "rgba(0, 0, 0, 0.65)",
                padding: "1px 2px",
                whiteSpace: "nowrap",
              }}
            >
              {rect.nodeId}
            </span>
          </div>
        ))}
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
        {marqueeStyle && (
          <div
            data-testid="selection-marquee"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              pointerEvents: "none",
              border: "1px dashed rgba(255, 152, 0, 0.95)",
              background: "rgba(255, 152, 0, 0.16)",
              borderRadius: "2px",
              zIndex: 2,
              transform: `translate(${marqueeStyle.left}px, ${marqueeStyle.top}px)`,
              width: `${marqueeStyle.width}px`,
              height: `${marqueeStyle.height}px`,
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
          suggestions={substituteSuggestions}
          onSuggestionSelected={(suggestion) => {
            setSubstituteLatex(suggestion.rhsLatex);
            setSubstituteError(null);
          }}
          onReplacementLatexChange={(nextLatex) => {
            setSubstituteLatex(nextLatex);
            setSubstituteError(null);
          }}
          onAccept={acceptSubstitution}
          onCancel={closeSubstituteModal}
        />
      )}
      {isSymbolReplacementModalOpen && (
        <SymbolReplacementModal
          rows={symbolReplacementRows}
          error={symbolReplacementError}
          focusSession={symbolReplacementModalSessionRef.current}
          onRowEnabledChange={updateSymbolReplacementRowEnabled}
          onReplacementLatexChange={updateSymbolReplacementLatex}
          onAccept={acceptSymbolReplacement}
          onCancel={closeSymbolReplacementModal}
        />
      )}
      {isForceFactorModalOpen && (
        <ForceFactorModal
          selectedLatex={selectedForceFactorLatex}
          factorLatex={forceFactorLatex}
          error={forceFactorError}
          focusSession={forceFactorModalSession}
          onFactorLatexChange={(nextLatex) => {
            setForceFactorLatex(nextLatex);
            setForceFactorError(null);
          }}
          onAccept={acceptForceFactor}
          onCancel={closeForceFactorModal}
        />
      )}
      {isApplyOperationModalOpen && (
        <ApplyOperationModal
          targetKind={applyOperationTargetKind}
          canSwitchInequality={canSwitchApplyOperationInequality}
          switchInequality={applyOperationSwitchInequality}
          placeholder={operationPlaceholderForTarget(applyOperationTargetKind)}
          operationLatex={applyOperationLatex}
          error={applyOperationError}
          focusSession={applyOperationModalSessionRef.current}
          onSwitchInequalityChange={setApplyOperationSwitchInequality}
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
