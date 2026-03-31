import "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";
import {
  fromMathLiveLatex,
  toMathLiveLatex,
} from "../../infra/mathlive/differentialLatex";
import { mathPadFacade, type ExprSelection, type SubstituteScope } from "../../application";
import { useHistory } from "../../hooks/useHistory";
import { useSelection, getNodeIdsFromPointerEvent } from "../../hooks/useSelection";
import { useDragMove } from "../../hooks/useDragMove";
import {
  applySelectionHighlight,
  getSelectionDetailsForNode,
  getSelectionDetailsForSpan,
  getResetSelectionDetails,
  getSelectionDetailsForMulti,
  type SelectionDetails,
} from "../../helpers/selectionHelpers";
import { MathDisplayPanel } from "./MathDisplayPanel";
import { MoveModeToolbar } from "./MoveModeToolbar";
import { ApplyModal } from "./ApplyModal";
import { SubstituteModal } from "./SubstituteModal";
import type { MoveMode } from "../../moveExpression/applyMove";
import type {
  MoveCaptureFixture,
  MoveTraceSample,
} from "../../domain/move/moveDebugFixture";
import { hitTestNodeIdInMathliveShadow } from "../../infra/mathlive/mathliveShadow";
import {
  installShadowStyle,
  setHighlightedText,
} from "../../infra/mathlive/derivationPadHighlight";
import { lhsMatchesSelected } from "../../mathJson/match";
import { getAtPath } from "../../movePath";
import {
  LatexInputWithToggle,
  type InputMode,
} from "./LatexInputWithToggle";

export type ExpressionPadDebugState = {
  latexText: string;
  expressionJsonText: string;
  movePlanText: string;
  info3: string;
  infoArgs: string;
  dragStartInfo: string;
  dragHoverInfo: string;
  dragSlot: string;
  parentAddId: string;
  selectionKind: string;
  selectionClickedId: string;
  selectionSelectedId: string;
  selectionOp: string;
  selectionLatexDetail: string;
  selectionJsonDetail: string;
  selectionParent: string;
  selectionRange: string;
  selectionChildIds: string;
  selectionChildOps: string;
  selectionChildLatex: string;
  selectionNote: string;
  debugBoxes: boolean;
};

export type ExpressionPadDebugActions = {
  setDebugBoxesEnabled: (v: boolean) => void;
  toggleDebugBoxes: () => void;
};

export type ExpressionPadSnapshot = {
  latex: string;
  rootJson: MJ;
};

export type OtherPadSnapshot = {
  padIndex: number;
  snapshot: ExpressionPadSnapshot;
};

export type ExpressionPadProps = {
  debug?: {
    render?: (
      state: ExpressionPadDebugState,
      actions: ExpressionPadDebugActions
    ) => ReactNode;
  };
  initialLatex?: string;
  /**
   * Optional initial snapshot to hydrate the pad directly into render mode.
   * History is not restored.
   */
  initialSnapshot?: ExpressionPadSnapshot;
  /**
   * Optional external prefill used by debug tooling (e.g., examples list in App).
   * Whenever prefillKey changes, this latex is applied to the input fields.
   */
  prefillLatex?: string;
  prefillKey?: string | number;
  /**
   * Called whenever the pad commits a new state (including undo/redo).
   */
  onSnapshot?: (snapshot: ExpressionPadSnapshot) => void;
  /**
   * Snapshots from sibling pads (derivation view) to surface substitution
   * suggestions. Optional so debug page remains unchanged.
   */
  otherPadSnapshots?: OtherPadSnapshot[];
};

type ActiveMoveCapture = {
  pointerId: number;
  expressionLatex: string;
  mode: MoveMode;
  selectedIds: string[];
  rects: Record<string, { left: number; top: number; right: number; bottom: number }>;
  samples: MoveTraceSample[];
};

type MoveApplyAttempt = {
  source: "primary" | "pullOutFallback" | "crossEqualFallback";
  selectedIds: string[];
  hoverId: string;
  targetSlot: number | null;
  mode: MoveMode;
  planKind: string | null;
  succeeded: boolean;
};

MathfieldElement.fontsDirectory = "/fonts";
// Ensure all MathLive fields pick up our custom macros (e.g., \differentialD).
(MathfieldElement as any).defaultOptions = {
  ...((MathfieldElement as any).defaultOptions ?? {}),
  macros: vecMacroOptions.macros,
};

type Mode = "entry" | "render";

export function ExpressionPad({
  debug,
  initialLatex,
  initialSnapshot,
  prefillLatex,
  prefillKey,
  onSnapshot,
  otherPadSnapshots,
}: ExpressionPadProps) {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);

  const [mode, setMode] = useState<Mode>("entry");
  const [inputMode, setInputMode] = useState<InputMode>("mathlive");

  const [tree, setTree] = useState<ExpressionTree | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>("additive");

  const inputRef = useRef<any>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const applyFieldRef = useRef<any>(null);
  const substituteFieldRef = useRef<any>(null);
  const substituteTextFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const insertOverlayRef = useRef<HTMLDivElement | null>(null);

  const [latexDraft, setLatexDraft] = useState<string>(
    initialLatex ?? ""
  );

  // Define applyPresentJson before hooks that use it
  function applyPresentJson(json: MJ, opts?: { latex?: string }) {
    const nextTree = ExpressionTree.create(json);
    const latexValue = opts?.latex ?? nextTree.latexPlain;
    setTree(nextTree);
    renderTree(nextTree, {
      preview: false,
      selectionOverride: null,
      clearHighlightAfterRender: true,
    });
    setSelection(null);
    setInfoFromTree(nextTree, latexValue);
    setMode("render");
    onSnapshot?.({
      latex: latexValue,
      rootJson: nextTree.rootJson,
    });
  }

  // Use extracted hooks
  const {
    undo: undoHistory,
    redo: redoHistory,
    commit: commitHistory,
    canUndo,
    canRedo,
  } = useHistory(null);

  const {
    selection,
    setSelection,
    handleClick: handleSelectionClick,
    expand: expandSelection,
    clear: clearSelection,
  } = useSelection(tree, moveMode);

  const handleMoveComplete = useCallback(
    (newTree: ExpressionTree, latex: string) => {
      commitHistory(newTree.rootJson);
      applyPresentJson(newTree.rootJson, { latex });
    },
    [commitHistory]
  );

  const {
    drag,
    startDrag,
    handlePointerMove: handleDragMove,
    handlePointerUp: handleDragUp,
  } = useDragMove(
    tree,
    moveMode,
    displayRef.current,
    displayRef.current,
    insertOverlayRef.current,
    handleMoveComplete,
    {
      onDragStart: ({ pointerId, selectedIds, mode, rects }) => {
        moveApplyAttemptsRef.current = [];
        activeMoveCaptureRef.current = {
          pointerId,
          expressionLatex: tree?.latexPlain ?? latexDraft,
          mode,
          selectedIds,
          rects,
          samples: [],
        };
      },
      onMoveSample: ({ pointer, hoverId, hoverUsedFallback }) => {
        const active = activeMoveCaptureRef.current;
        if (!active) return;
        active.samples.push({
          pointer,
          hoverId,
          hoverUsedFallback,
        });
      },
      onDragEnd: () => {
        const active = activeMoveCaptureRef.current;
        if (!active) return;
        lastMoveCaptureRef.current = {
          version: 1,
          name: "captured-drag",
          expressionLatex: active.expressionLatex,
          mode: active.mode,
          selectedIds: active.selectedIds,
          rects: active.rects,
          samples: active.samples,
        };
        activeMoveCaptureRef.current = null;
      },
      onApplyAttempt: (payload) => {
        moveApplyAttemptsRef.current.push({
          source: payload.source,
          selectedIds: payload.selectedIds,
          hoverId: payload.hoverId,
          targetSlot: payload.targetSlot,
          mode: payload.mode,
          planKind: payload.planKind ?? null,
          succeeded: payload.succeeded,
        });
      },
    }
  );

  const [latexText, setLatexText] = useState<string>(
    "Type an equation, click Add / Update."
  );
  const [expressionJsonText, setExpressionJsonText] = useState<string>(
    "Expression tree will appear here after rendering."
  );
  const [movePlanText, setMovePlanText] = useState<string>("");
  const [info3, setInfo3] = useState<string>("");

  const [dragStartInfo, setDragStartInfo] = useState<string>("");
  const [dragHoverInfo, setDragHoverInfo] = useState<string>("");
  const [dragSlot, setDragSlot] = useState<string>("");
  const [parentAddId, setParentAddId] = useState<string>("");
  const [debugBoxes, setDebugBoxes] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [substituteScope, setSubstituteScope] =
    useState<SubstituteScope>("single");
  const [substituteError, setSubstituteError] = useState("");
  const [substituteInputMode, setSubstituteInputMode] =
    useState<InputMode>("mathlive");
  const [substituteLatexDraft, setSubstituteLatexDraft] = useState<string>("");
  const [substituteSuggestionJson, setSubstituteSuggestionJson] = useState<MJ | null>(null);
  const [infoArgs, setInfoArgs] = useState<string>("");
  const [selectionKind, setSelectionKind] = useState<string>("");
  const [selectionClickedId, setSelectionClickedId] = useState<string>("");
  const [selectionSelectedId, setSelectionSelectedId] = useState<string>("");
  const [selectionOp, setSelectionOp] = useState<string>("");
  const [selectionLatexDetail, setSelectionLatexDetail] = useState<string>("");
  const [selectionJsonDetail, setSelectionJsonDetail] = useState<string>("");
  const [selectionParent, setSelectionParent] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<string>("");
  const [selectionChildIds, setSelectionChildIds] = useState<string>("");
  const [selectionChildOps, setSelectionChildOps] = useState<string>("");
  const [selectionChildLatex, setSelectionChildLatex] = useState<string>("");
  const [selectionNote, setSelectionNote] = useState<string>("");
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "done">("idle");
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const activeMoveCaptureRef = useRef<ActiveMoveCapture | null>(null);
  const lastMoveCaptureRef = useRef<MoveCaptureFixture | null>(null);
  const moveApplyAttemptsRef = useRef<MoveApplyAttempt[]>([]);

  useEffect(() => {
    if (!initialSnapshot) return;
    if (tree) return;
    commitHistory(initialSnapshot.rootJson);
    applyPresentJson(initialSnapshot.rootJson, { latex: initialSnapshot.latex });
  }, [initialSnapshot, tree, commitHistory, applyPresentJson]);

  // Allow parent (debug UI) to push a new latex draft (e.g., example copy).
  useEffect(() => {
    if (prefillLatex === undefined) return;
    setLatexDraft(prefillLatex);
    setMode("entry");
    if (inputRef.current) {
      const pref = toMathLiveLatex(prefillLatex);
      if (typeof inputRef.current.setValue === "function") {
        inputRef.current.setValue(pref);
      } else {
        inputRef.current.value = pref;
      }
    }
    if (textInputRef.current) textInputRef.current.value = prefillLatex;
  }, [prefillLatex, prefillKey]);

  useEffect(() => {
    if (showApplyModal && applyFieldRef.current) {
      applyFieldRef.current.value = "";
      applyFieldRef.current.focus();
    }
  }, [showApplyModal]);

  const substituteTargetId = useMemo(() => {
    if (!tree) return null;
    return mathPadFacade.getSubstituteTargetId(tree, selection);
  }, [tree, selection]);

  useEffect(() => {
    if (!showSubstituteModal) return;

    if (substituteInputMode === "mathlive" && substituteFieldRef.current) {
      const el = substituteFieldRef.current as any;
      const focusField = () => {
        try {
          el.focus?.();
        } catch {
          // MathLive element may not be upgraded yet; ignore and rely on next frame.
        }
      };

      // Ensure the custom element is upgraded before focusing to avoid ariaLiveText errors.
      if (typeof customElements !== "undefined" && customElements.whenDefined) {
        customElements.whenDefined("math-field").then(() => {
          requestAnimationFrame(focusField);
        });
      } else {
        requestAnimationFrame(focusField);
      }
    }

    if (substituteInputMode === "text" && substituteTextFieldRef.current) {
      substituteTextFieldRef.current.focus();
    }
  }, [showSubstituteModal, substituteInputMode]);

  const canSubstitute = useMemo(
    () => mathPadFacade.canSubstitute(tree, selection),
    [tree, selection]
  );

  useEffect(() => {
    if (showSubstituteModal && !canSubstitute) {
      closeSubstituteModal();
    }
  }, [showSubstituteModal, canSubstitute]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = displayRef.current;
    if (!host) return;

    const api = {
      getNodeIdByLatex: (latex: string) => {
        if (!tree || !latex) return null;
        const hit = Object.values(tree.nodesById).find((node) => node.latex === latex);
        return hit?.id ?? null;
      },
      getTreeLatex: () => tree?.latexPlain ?? "",
      getMoveCapture: () => lastMoveCaptureRef.current,
      clearMoveCapture: () => {
        lastMoveCaptureRef.current = null;
      },
      getMoveApplyAttempts: () => moveApplyAttemptsRef.current,
      clearMoveApplyAttempts: () => {
        moveApplyAttemptsRef.current = [];
      },
      getNodeRectById: (nodeId: string) => {
        if (!nodeId) return null;
        const sr = (host as any).shadowRoot as ShadowRoot | null;
        if (!sr) return null;
        const els = sr.querySelectorAll<HTMLElement>(
          `[data-node-id="${CSS.escape(nodeId)}"]`
        );
        if (!els.length) return null;
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        return { left, right, top, bottom };
      },
    };

    (window as any).__dpDebug = api;
    return () => {
      if ((window as any).__dpDebug === api) {
        delete (window as any).__dpDebug;
      }
    };
  }, [tree, mode]);

  // Render once the display element is mounted in render mode
  useEffect(() => {
    if (mode !== "render") return;
    if (!tree || !displayRef.current) return;
    renderTree(tree, { preview: false, clearHighlightAfterRender: true });
  }, [mode, tree]);

  function renderTree(
    t: ExpressionTree,
    opts?: {
      preview?: boolean;
      selectionOverride?: ExprSelection | null;
      clearHighlightAfterRender?: boolean;
    }
  ) {
    if (!displayRef.current) return;

    const renderLatex = t.latexTagged;
    if ("value" in (displayRef.current as any)) {
      (displayRef.current as any).value = renderLatex;
    } else {
      displayRef.current.textContent = renderLatex;
    }
    (displayRef.current as any).render?.();
    installShadowStyle(displayRef.current);

    const sel = opts?.selectionOverride ?? selection;
    applySelectionHighlight(sel, tree, displayRef.current);

    // Clear highlights after the render if requested (useful after a completed move).
    if (opts?.clearHighlightAfterRender) {
      const el = displayRef.current;
      if (el) setHighlightedText(el, []);
    }
  }

  function setInfoFromTree(t: ExpressionTree, latex?: string) {
    setLatexText(latex ?? "");
    setExpressionJsonText(JSON.stringify(t.rootJson, null, 2));
  }

  function commitJson(next: MJ, opts?: { latex?: string }) {
    commitHistory(next);
    applyPresentJson(next, opts);
  }

  const canFlip = useMemo(() => {
    return !!tree && mathPadFacade.isFlippableEquation(tree.rootJson);
  }, [tree]);

  const onFlip = useCallback(() => {
    if (!tree) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection: null,
      action: { type: "flip" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree]);

  const expandTargetId = useMemo(() => {
    if (!tree) return null;
    return mathPadFacade.getExpandTargetId(tree, selection);
  }, [tree, selection]);

  const onExpand = useCallback(() => {
    if (!tree || !expandTargetId) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection: null,
      action: { type: "expand", targetId: expandTargetId },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, expandTargetId]);

  const onFactor = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "factor" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  const onCancelTerm = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "cancel" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  const onToggleDelimiterStyle = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "toggleDelimiterStyle" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  function undo() {
    undoHistory(applyPresentJson);
  }

  function redo() {
    redoHistory(applyPresentJson);
  }

  function openSubstituteModal() {
    setSubstituteScope("single");
    setSubstituteError("");
    setSubstituteSuggestionJson(null);
    const initialLatex = (() => {
      if (!tree || !selection) return "";
      if (selection.kind === "node") {
        return tree.nodesById[selection.nodeId]?.latex ?? "";
      }
      if (selection.kind === "multi") {
        const span = mathPadFacade.multiSelectionAsSpan(tree, selection);
        if (span) {
          const parentPath = tree.pathById[span.parentId];
          if (parentPath !== undefined) {
            const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
            if (Array.isArray(parentExpr)) {
              const kids = parentExpr.slice(1) as MJ[];
              const chosen = kids.slice(span.start, span.end + 1);
              const selectedExpr =
                chosen.length === 1 ? chosen[0] : ([span.op, ...chosen] as MJ);
              return ExpressionTree.create(selectedExpr).latexPlain;
            }
          }
        }
        const firstId = selection.nodeIds[0];
        return firstId ? tree.nodesById[firstId]?.latex ?? "" : "";
      }
      return tree.nodesById[substituteTargetId ?? ""]?.latex ?? "";
    })();
    setSubstituteLatexDraft(initialLatex);
    setSubstituteInputMode("mathlive");
    setShowSubstituteModal(true);
  }

  function openApplyModal() {
    setApplyError("");
    setShowApplyModal(true);
  }

  function closeSubstituteModal() {
    setShowSubstituteModal(false);
    setSubstituteError("");
    setSubstituteSuggestionJson(null);
  }

  function closeApplyModal() {
    setShowApplyModal(false);
    setApplyError("");
  }

  const applySuggestionToField = useCallback(
    (padIndex: number) => {
      if (!otherPadSnapshots || !tree || !substituteTargetId) return;
      const targetNode = tree.nodesById[substituteTargetId];
      if (!targetNode) return;
      const selectedJson = targetNode.json;
      const picked = otherPadSnapshots
        .flatMap(({ padIndex: sourcePadIndex, snapshot }) => {
          const root = snapshot.rootJson;
          if (!Array.isArray(root) || root[0] !== "Equal" || root.length < 3) return [];
          const lhs = root[1] as MJ;
          const rhs = root[2] as MJ;
          if (!lhsMatchesSelected(lhs, selectedJson)) return [];
          return [{ padIndex: sourcePadIndex, rhsLatex: ExpressionTree.create(rhs).latexPlain, rhsJson: rhs }];
        })
        .find((s) => s.padIndex === padIndex);
      if (!picked) return;
      const rhsLatex = picked.rhsLatex;
      setSubstituteLatexDraft(rhsLatex);
      setSubstituteError("");
      setSubstituteSuggestionJson(picked.rhsJson);

      if (substituteInputMode === "mathlive") {
        const el = substituteFieldRef.current as any;
        if (!el) return;
        const mlLatex = toMathLiveLatex(rhsLatex);
        try {
          if (typeof el.setValue === "function") {
            el.setValue(mlLatex);
          } else {
            el.value = mlLatex;
          }
          el.focus?.();
        } catch {
          // Ignore MathLive upgrade timing; user can still type manually.
        }
      } else {
        if (substituteTextFieldRef.current) {
          substituteTextFieldRef.current.value = rhsLatex;
          substituteTextFieldRef.current.focus();
        }
      }
    },
    [setSubstituteError, setSubstituteLatexDraft, substituteInputMode, otherPadSnapshots, tree, substituteTargetId]
  );

  function submitSubstitution() {
    if (!tree || !canSubstitute) {
      setSubstituteError("Select a node to substitute.");
      return;
    }

    const rhsLatex: string = substituteLatexDraft;
    if (!rhsLatex.trim()) {
      setSubstituteError("Enter a replacement expression.");
      return;
    }

    const parsed = substituteSuggestionJson ?? mathPadFacade.parseLatex(rhsLatex);
    if (parsed == null) {
      setSubstituteError("Could not parse replacement.");
      return;
    }

    const action: {
      type: "substitute";
      replacement: MJ;
      scope: SubstituteScope;
      targetId?: string;
    } = {
      type: "substitute",
      replacement: parsed as MJ,
      scope: substituteScope,
      ...(substituteTargetId ? { targetId: substituteTargetId } : {}),
    };

    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action,
    });

    if (!result.ok) {
      setSubstituteError(result.reason);
      return;
    }

    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
    setSubstituteError("");
    setShowSubstituteModal(false);
    setSubstituteSuggestionJson(null);
  }

  function submitApplyOperation() {
    if (!tree || !mathPadFacade.isFlippableEquation(tree.rootJson)) {
      setApplyError("Enter an equation first.");
      return;
    }

    const opLatex: string = fromMathLiveLatex(
      applyFieldRef.current?.getValue?.("latex") ??
        applyFieldRef.current?.value ??
        ""
    );
    if (!opLatex.trim()) {
      setApplyError("Enter an operation.");
      return;
    }

    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "applyToBothSides", operationLatex: opLatex },
    });
    if (result.ok) {
      commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
      setApplyError("");
      setShowApplyModal(false);
      return;
    }
    setApplyError(result.reason);
  }

  function onAddEquation() {
    const latex = latexDraft;
    const mj = mathPadFacade.parseLatex(latex);
    if (mj == null) {
      setLatexText(latex);
      setExpressionJsonText("Parse failed. Check LaTeX input.");
      return;
    }
    setLatexDraft(latex);
    commitJson(mj, { latex });
  }

  function onDisplayPointerDown(e: React.PointerEvent) {
    if (mode !== "render") return;
    const displayEl = displayRef.current;
    if (!displayEl) return;
    if (!tree) return;

    // Ignore clicks on the toolbar so selection is preserved
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
      return;
    }

    let ids = getNodeIdsFromPointerEvent(e);
    if ((!ids || ids.length === 0) && displayRef.current) {
      const hitId = hitTestNodeIdInMathliveShadow(
        displayRef.current,
        e.clientX,
        e.clientY
      );
      if (hitId) ids = [hitId];
    }
    const clickedId = mathPadFacade.chooseBestAllowedSelectedNode(ids, tree);

    if (!clickedId) {
      clearSelection();
      applySelectionHighlight(null, tree, displayRef.current);
      return;
    }

    // Use the selection hook to handle click logic
    const modKey = e.metaKey || e.ctrlKey;
    const clickResult = handleSelectionClick(
      clickedId,
      e.shiftKey,
      modKey,
      selection
    );

    // Ensure this pad receives keyboard events (Delete/Backspace) after click.
    (e.currentTarget as HTMLElement).focus?.();

    // Ctrl/Cmd multi-select: update selection only, no drag start.
    if (modKey) {
      if (clickResult.newSelection) {
        setSelection(clickResult.newSelection);
        applySelectionHighlight(clickResult.newSelection, tree, displayRef.current);

        if (clickResult.newSelection.kind === "span") {
          const details = getSelectionDetailsForSpan(
            tree,
            clickResult.newSelection,
            clickResult.multiplicativeSpan ? "Multiplicative span" : undefined
          );
          updateSelectionDetails(details);
        } else if (clickResult.newSelection.kind === "multi") {
          const details = getSelectionDetailsForMulti(tree, clickResult.newSelection);
          updateSelectionDetails(details);
        } else {
          const details = getSelectionDetailsForNode(tree, clickResult.newSelection.nodeId, {
            clickedId,
          });
          updateSelectionDetails(details);
        }
      } else {
        setSelection(null);
        applySelectionHighlight(null, tree, displayRef.current);
        updateSelectionDetails(getResetSelectionDetails("Cleared selection"));
      }
      return;
    }

    // Handle SHIFT+click range selection
    if (e.shiftKey && clickResult.newSelection?.kind === "span") {
      setSelection(clickResult.newSelection);
      applySelectionHighlight(clickResult.newSelection, tree, displayRef.current);
      const details = getSelectionDetailsForSpan(
        tree,
        clickResult.newSelection as ExprSelection & { kind: "span" }
      );
      updateSelectionDetails(details);
      return;
    }

    // Start drag
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startDrag(e.pointerId, clickResult.dragIds, { x: e.clientX, y: e.clientY });
    setDragSlot("");

    // Update selection and details
    if (clickResult.newSelection) {
      setSelection(clickResult.newSelection);
      applySelectionHighlight(clickResult.newSelection, tree, displayRef.current);

      if (clickResult.newSelection.kind === "span") {
        const details = getSelectionDetailsForSpan(
          tree,
          clickResult.newSelection,
          clickResult.multiplicativeSpan ? "Multiplicative span" : undefined
        );
        updateSelectionDetails(details);
      } else if (clickResult.newSelection.kind === "multi") {
        const details = getSelectionDetailsForMulti(tree, clickResult.newSelection);
        updateSelectionDetails(details);
      } else {
        const details = getSelectionDetailsForNode(
          tree,
          clickResult.newSelection.nodeId,
          {
            clickedId,
          }
        );
        updateSelectionDetails(details);
      }
    }

    // Logging
    const normalizedId = mathPadFacade.normalizeSelection(tree, clickedId);
    const hit = tree.nodesById[normalizedId];
    if (!hit) {
      const resetDetails = getResetSelectionDetails(
        `clicked node-id: ${clickedId} (no NodeInfo found)`
      );
      updateSelectionDetails(resetDetails);
      return;
    }
    setDragStartInfo(`${clickedId}`);

    // Only update selection details if we didn't already set span details
    if (!clickResult.useExistingSpan && !clickResult.multiplicativeSpan) {
      const details = getSelectionDetailsForNode(tree, hit.id, {
        clickedId,
        normalizedId,
        shiftKey: e.shiftKey,
      });
      updateSelectionDetails(details);
    }
  }

  function updateSelectionDetails(details: SelectionDetails) {
    setSelectionKind(details.kind);
    setSelectionClickedId(details.clickedId);
    setSelectionSelectedId(details.selectedId);
    setSelectionOp(details.op);
    setSelectionLatexDetail(details.latex);
    setSelectionJsonDetail(details.json);
    setSelectionParent(details.parent);
    setSelectionRange(details.range);
    setSelectionChildIds(details.childIds);
    setSelectionChildOps(details.childOps);
    setSelectionChildLatex(details.childLatex);
    setSelectionNote(details.note);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (mode !== "render") return;

    // instance-scoped shortcuts
    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;
    if (key === "`") {
      e.preventDefault();
      setDebugBoxes((v) => !v);
      return;
    }
    if (mod && key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }

    if (key === "delete" || key === "backspace") {
      if (!tree || !selection) return;
      const result = mathPadFacade.applyAction({
        tree,
        selection,
        action: { type: "cancel" },
      });
      if (!result.ok) return;
      e.preventDefault();
      commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
      return;
    }

    if (!e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!displayRef.current) return;
    if (!selection) return;
    if (selection.kind === "multi") return;
    if (!tree) return;

    e.preventDefault();

    const dir = e.key === "ArrowLeft" ? "left" : "right";
    const expanded = expandSelection(dir);

    if (!expanded) {
      const resetDetails = getResetSelectionDetails(
        `shift+${e.key} → no expansion (not in Add/InvisibleOperator or no parent/kids)`
      );
      updateSelectionDetails(resetDetails);
      return;
    }

    setSelection(expanded);
    applySelectionHighlight(expanded, tree, displayRef.current);
    if (expanded.kind === "span") {
      const details = getSelectionDetailsForSpan(tree, expanded, `shift+${e.key} → expanded`);
      updateSelectionDetails(details);
    } else if (expanded.kind === "node") {
      const details = getSelectionDetailsForNode(tree, expanded.nodeId, {
        shiftKey: true,
      });
      details.note = `shift+${e.key} → expanded`;
      updateSelectionDetails(details);
    }
  }

  function onDisplayPointerMove(e: React.PointerEvent) {
    const result = handleDragMove(e);
    setMovePlanText(
      result.planDescription || "No move intent (planMove returned null)"
    );
    setInfo3(result.plan ? JSON.stringify(result.plan, null, 2) : "planMove returned null");
    setInfoArgs(result.infoArgs);
    setDragSlot(result.plan ? result.plan.kind : "");

    if (drag) {
      setDragStartInfo(displayNodeInfo(drag.selectedIds[0] ?? null));
      const hoverLabel = result.hoverId
        ? displayNodeInfo(result.hoverId) +
          (result.hoverUsedFallback ? " (fallback hover)" : "")
        : "No current hover";
      setDragHoverInfo(hoverLabel);
      setParentAddId(result.hoverId ?? "");
    } else {
      setDragStartInfo("Not dragging");
      setDragHoverInfo("");
      setParentAddId("");
    }
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    const moved = handleDragUp(e);
    if (!moved && tree) {
      // Failed move -> keep current selection/highlight
      renderTree(tree, { preview: false });
    }
  }

  useEffect(() => {
    const overlay = debugOverlayRef.current;
    const mathDivEl = displayRef.current;
    if (!overlay) return;

    overlay.replaceChildren();

    if (!debugBoxes || !tree || !mathDivEl) return;

    renderNodeIdBoxes(tree, mathDivEl, overlay);
  }, [debugBoxes, tree]);

  // Test helper: expose node-center lookup by visible text within MathLive shadow DOM.
  type Box = { left: number; top: number; width: number; height: number };

  function drawRect(
    overlay: HTMLElement,
    box: Box,
    label: string,
    opts?: { stroke?: string; fill?: string; dash?: boolean }
  ) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    el.style.border = `1px solid ${opts?.stroke ?? "lime"}`;
    el.style.background = opts?.fill ?? "transparent";
    if (opts?.dash) el.style.borderStyle = "dashed";
    el.style.boxSizing = "border-box";

    const tag = document.createElement("div");
    tag.textContent = label;
    tag.style.position = "absolute";
    tag.style.left = "0";
    tag.style.top = "0";
    tag.style.transform = "translateY(-100%)";
    tag.style.fontSize = "10px";
    tag.style.lineHeight = "10px";
    tag.style.padding = "1px 2px";
    tag.style.color = opts?.stroke ?? "lime";
    tag.style.background = "rgba(0,0,0,0.65)";
    tag.style.whiteSpace = "nowrap";

    el.appendChild(tag);
    overlay.appendChild(el);
  }

  function renderNodeIdBoxes(
    tree: ExpressionTree,
    mathDivEl: HTMLElement,
    overlay: HTMLElement
  ) {
    const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
    if (!sr) return;

    const hostRect = mathDivEl.getBoundingClientRect();

    const nodes = sr.querySelectorAll<HTMLElement>("[data-node-id]");
    for (const el of nodes) {
      const id = el.dataset.nodeId;
      if (!id) continue;
      const info = tree.nodesById[id];
      if (!info) continue;

      // ✅ FILTER HERE
      if (info.op !== "Add") continue;

      const r = el.getBoundingClientRect();
      const box: Box = {
        left: r.left - hostRect.left,
        top: r.top - hostRect.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
      };

      const op = tree.nodesById[id]?.op ?? "?";
      drawRect(overlay, box, `${id} ${op}`, {
        stroke: op === "Equal" ? "orange" : "lime",
        fill: "rgba(0,255,0,0.06)",
      });
    }
  }

  const canApply = !!tree && mathPadFacade.isFlippableEquation(tree.rootJson);
  const canExpand = !!tree && !!expandTargetId;
  const canCancel = useMemo(() => mathPadFacade.canCancel(tree, selection), [tree, selection]);
  const canToggleDelimiterStyle = useMemo(
    () => mathPadFacade.canToggleDelimiterStyle(tree, selection),
    [tree, selection]
  );
  const canEvaluate = useMemo(
    () => mathPadFacade.canEvaluate(tree, selection),
    [tree, selection]
  );
  const canFactor = useMemo(() => mathPadFacade.canFactor(tree, selection), [tree, selection]);
  const selectedNodeLatex = useMemo(() => {
    if (!canSubstitute || !tree || !selection) return "";
    if (selection.kind === "node") {
      return tree.nodesById[selection.nodeId]?.latex ?? "";
    }
    if (selection.kind === "span") {
      const parentPath = tree.pathById[selection.parentId];
      if (parentPath === undefined) return "";
      const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
      if (!Array.isArray(parentExpr)) return "";
      const op = selection.op;
      const kids = parentExpr.slice(1) as MJ[];
      const chosen = kids.slice(selection.start, selection.end + 1);
      if (chosen.length === 0) return "";
      const selectedExpr =
        chosen.length === 1 ? chosen[0] : ([op, ...chosen] as MJ);
      return ExpressionTree.create(selectedExpr).latexPlain;
    }
    if (selection.kind === "multi") {
      const span = mathPadFacade.multiSelectionAsSpan(tree, selection);
      if (span) {
        const parentPath = tree.pathById[span.parentId];
        if (parentPath !== undefined) {
          const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
          if (Array.isArray(parentExpr)) {
            const kids = parentExpr.slice(1) as MJ[];
            const chosen = kids.slice(span.start, span.end + 1);
            if (chosen.length === 0) return "";
            const selectedExpr =
              chosen.length === 1 ? chosen[0] : ([span.op, ...chosen] as MJ);
            return ExpressionTree.create(selectedExpr).latexPlain;
          }
        }
      }
      const latexes = selection.nodeIds
        .map((id) => tree.nodesById[id]?.latex)
        .filter((s): s is string => !!s);
      if (latexes.length === 0) return "";
      if (latexes.length === 1) return latexes[0];
      return `${latexes[0]} (+${latexes.length - 1} selected)`;
    }
    return substituteTargetId ? tree.nodesById[substituteTargetId]?.latex ?? "" : "";
  }, [canSubstitute, tree, selection, substituteTargetId]);
  const substituteSuggestions = useMemo(() => {
    if (!otherPadSnapshots || !tree || !substituteTargetId) return [];
    const targetNode = tree.nodesById[substituteTargetId];
    if (!targetNode) return [];
    const selectedJson = targetNode.json;

    return otherPadSnapshots.flatMap(({ padIndex, snapshot }) => {
      const root = snapshot.rootJson;
      if (!Array.isArray(root) || root[0] !== "Equal" || root.length < 3)
        return [];
      const lhs = root[1] as MJ;
      const rhs = root[2] as MJ;
      if (!lhsMatchesSelected(lhs, selectedJson)) return [];
      const rhsLatex = ExpressionTree.create(rhs).latexPlain;
      return [{ padIndex, rhsLatex, rhsJson: rhs }];
    });
  }, [otherPadSnapshots, substituteTargetId, tree]);

  const latexForCopy =
    latexText && latexText !== "Type an equation, click Add / Update."
      ? latexText
      : latexDraft;
  const canCopyLatex = !!latexForCopy?.trim();

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function markCopySuccess() {
    setCopyFeedback("done");
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(
      () => setCopyFeedback("idle"),
      900
    );
  }

  function displayNodeInfo(nodeId: string | null): string {
    if (!nodeId) return "No id";
    if (!tree) return "No tree";
    if (!tree.nodesById[nodeId]) return `Node ${nodeId} not found`;
    const node = tree.nodesById[nodeId];
    return `${node.id} ${node.latex}`;
  }

  function onEdit() {
    const currentLatex = latexText || latexDraft;
    setLatexDraft(currentLatex);
    setMode("entry");
  }

  const onEvaluate = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "evaluate" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  async function onCopyLatex() {
    if (!canCopyLatex || !latexForCopy) return;
    let copied = false;
    // Prefer modern clipboard API; fall back to execCommand when unavailable.
    try {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(latexForCopy);
        copied = true;
      }
    } catch {
      // Ignore and try the legacy path.
    }

    if (!copied) {
      try {
        if (typeof document === "undefined") return;
        const textarea = document.createElement("textarea");
        textarea.value = latexForCopy;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        copied = true;
      } catch {
        // Swallow copy failures; button is best-effort.
      }
    }

    if (copied) {
      markCopySuccess();
    }
  }

  const debugState: ExpressionPadDebugState = {
    latexText,
    expressionJsonText,
    movePlanText,
    info3,
    infoArgs,
    dragStartInfo,
    dragHoverInfo,
    dragSlot,
    parentAddId,
    selectionKind,
    selectionClickedId,
    selectionSelectedId,
    selectionOp,
    selectionLatexDetail,
    selectionJsonDetail,
    selectionParent,
    selectionRange,
    selectionChildIds,
    selectionChildOps,
    selectionChildLatex,
    selectionNote,
    debugBoxes,
  };

  const debugActions: ExpressionPadDebugActions = {
    setDebugBoxesEnabled: setDebugBoxes,
    toggleDebugBoxes: () => setDebugBoxes((v) => !v),
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      {mode === "entry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
              width: "100%",
              flexWrap: "nowrap",
            }}
          >
            <div style={{ flex: "1 1 auto" }}>
              <LatexInputWithToggle
                inputMode={inputMode}
                latex={latexDraft}
                onLatexChange={setLatexDraft}
                onInputModeChange={setInputMode}
                mathFieldRef={inputRef}
                textAreaRef={textInputRef}
                MathField={MathField}
                dataTestId="latex-input"
                radioName="entry-mode"
                fieldStyle={{ border: "1px solid #ccc" }}
                actionButton={{
                  label: "✓",
                  onClick: onAddEquation,
                  title: "Add / Update",
                  ariaLabel: "Add / Update",
                  dataTestId: "add-update",
                }}
              />
            </div>
          </div>

        </div>
      )}

      {mode === "render" && (
        <>
          <MathDisplayPanel
            renderBoxRef={renderBoxRef}
            mathWrapRef={mathWrapRef}
            displayRef={displayRef}
            insertOverlayRef={insertOverlayRef}
            debugOverlayRef={debugOverlayRef}
            onPointerDown={onDisplayPointerDown}
            onPointerMove={onDisplayPointerMove}
            onPointerUp={onDisplayPointerUp}
            onKeyDown={onKeyDown}
            renderHeader={
              <MoveModeToolbar
                ref={toolbarRef}
                moveMode={moveMode}
                onSetMoveMode={setMoveMode}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onFlip={onFlip}
                canFlip={canFlip}
                onExpand={onExpand}
                canExpand={canExpand}
                onFactor={onFactor}
                canFactor={canFactor}
                onCancelTerm={onCancelTerm}
                canCancelTerm={canCancel}
                onToggleDelimiterStyle={onToggleDelimiterStyle}
                canToggleDelimiterStyle={canToggleDelimiterStyle}
                onEvaluate={onEvaluate}
                canEvaluate={canEvaluate}
                onOpenApply={openApplyModal}
                canApply={canApply}
                onOpenSubstitute={openSubstituteModal}
                canSubstitute={canSubstitute}
                onCopyLatex={onCopyLatex}
                canCopyLatex={canCopyLatex}
                copyFeedback={copyFeedback}
                onEdit={onEdit}
              />
            }
            isDragging={!!drag}
            MathDiv={MathDiv}
          />

          {debug?.render ? debug.render(debugState, debugActions) : null}
        </>
      )}

      <ApplyModal
        open={showApplyModal}
        equationLatex={latexText}
        applyError={applyError}
        onSubmit={submitApplyOperation}
        onClose={closeApplyModal}
        applyFieldRef={applyFieldRef}
        MathField={MathField}
        MathDiv={MathDiv}
      />
      <SubstituteModal
        open={showSubstituteModal}
        selectedNodeLatex={selectedNodeLatex}
        substituteError={substituteError}
        substituteScope={substituteScope}
        onScopeChange={setSubstituteScope}
        onSubmit={submitSubstitution}
        onClose={closeSubstituteModal}
        substituteLatexDraft={substituteLatexDraft}
        substituteInputMode={substituteInputMode}
        onSubstituteInputModeChange={setSubstituteInputMode}
        onSubstituteLatexChange={(latex) => {
          setSubstituteSuggestionJson(null);
          setSubstituteLatexDraft(latex);
        }}
        substituteFieldRef={substituteFieldRef}
        substituteTextFieldRef={substituteTextFieldRef}
        suggestions={substituteSuggestions}
        onSuggestionPick={applySuggestionToField}
        MathField={MathField}
        MathDiv={MathDiv}
      />
    </div>
  );
}
