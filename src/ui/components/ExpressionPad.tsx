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
import {
  mathPadFacade,
  type ExprSelection,
  type SubstituteScope,
} from "../../application";
import { useHistory, type History } from "../../hooks/useHistory";
import {
  useSelection,
  getNodeIdsFromPointerEvent,
} from "../../hooks/useSelection";
import { useDragMove } from "../../hooks/useDragMove";
import {
  applySelectionHighlight,
  getSelectionDetailsForNode,
  getSelectionDetailsForSpan,
  getResetSelectionDetails,
  getSelectionDetailsForMulti,
  getLatexForSelectionCopy,
  type SelectionDetails,
} from "../../helpers/selectionHelpers";
import { MathDisplayPanel } from "./MathDisplayPanel";
import { MoveModeToolbar } from "./MoveModeToolbar";
import { ApplyModal } from "./ApplyModal";
import { SubstituteModal } from "./SubstituteModal";
import { InvalidateHistoryModal } from "./InvalidateHistoryModal";
import type { MoveMode } from "../../moveExpression/applyMove";
import type {
  MoveCaptureFixture,
  MoveTraceSample,
} from "../../domain/move/moveDebugFixture";
import { hitTestOrClosestNodeIdInMathliveShadow } from "../../infra/mathlive/mathliveShadow";
import { snapshotSelectableRectsForTree } from "../../infra/mathlive/rectProvider";
import {
  installShadowStyle,
  setHighlightedText,
} from "../../infra/mathlive/derivationPadHighlight";
import { lhsMatchesSelected } from "../../mathJson/match";
import { getAtPath } from "../../movePath";
import { LatexInputWithToggle, type InputMode } from "./LatexInputWithToggle";
import { rectFromPoints, rectsOverlap, type RectLTRB } from "../../rectMath";

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
  clickTrace: string;
  selectionProfile: string;
  selectionProfileHistory: string;
  toolbarProfile: string;
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

export type ExpressionPadHistoryStep = {
  latex: string;
  rootJson?: MJ;
};
export type ExpressionPadHistory = History<ExpressionPadHistoryStep>;

export type OtherPadSnapshot = {
  padIndex: number;
  snapshot: ExpressionPadSnapshot;
};

type SubstituteSuggestionMatch = {
  rhsJson: MJ;
  rhsLatex: string;
};

function stripOuterNegate(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Negate" || expr.length < 2)
    return null;
  return expr[1] as MJ;
}

function matchSubstituteSuggestion(
  lhs: MJ,
  rhs: MJ,
  selected: MJ,
): SubstituteSuggestionMatch | null {
  if (lhsMatchesSelected(lhs, selected)) {
    return { rhsJson: rhs, rhsLatex: ExpressionTree.create(rhs).latexPlain };
  }

  // Allow selecting -A to match a known relation A = B, and suggest -B.
  const selectedWithoutNegate = stripOuterNegate(selected);
  if (selectedWithoutNegate && lhsMatchesSelected(lhs, selectedWithoutNegate)) {
    const negatedRhs = ["Negate", rhs] as MJ;
    return {
      rhsJson: negatedRhs,
      rhsLatex: ExpressionTree.create(negatedRhs).latexPlain,
    };
  }

  // Symmetric case: selected A can match -A = B and suggest -B.
  const lhsWithoutNegate = stripOuterNegate(lhs);
  if (lhsWithoutNegate && lhsMatchesSelected(lhsWithoutNegate, selected)) {
    const negatedRhs = ["Negate", rhs] as MJ;
    return {
      rhsJson: negatedRhs,
      rhsLatex: ExpressionTree.create(negatedRhs).latexPlain,
    };
  }

  return null;
}

function normalizeHistoryStep(step: unknown): ExpressionPadHistoryStep | null {
  if (!step || typeof step !== "object") return null;
  const candidate = step as Partial<ExpressionPadHistoryStep>;
  if (typeof candidate.latex !== "string") return null;
  const hasRootJson = candidate.rootJson !== undefined;
  return {
    latex: candidate.latex,
    ...(hasRootJson ? { rootJson: cloneMj(candidate.rootJson as MJ) } : {}),
  };
}

function normalizePersistedHistory(input: unknown): ExpressionPadHistory | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ExpressionPadHistory>;
  const present = normalizeHistoryStep(candidate.present);
  if (!present) return null;

  const normalizeArray = (value: unknown): ExpressionPadHistoryStep[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => normalizeHistoryStep(item))
      .filter((item): item is ExpressionPadHistoryStep => item !== null);
  };

  return {
    past: normalizeArray(candidate.past),
    present,
    future: normalizeArray(candidate.future),
  };
}

function cloneMj(value: MJ): MJ {
  return JSON.parse(JSON.stringify(value)) as MJ;
}

function historyLatexSignature(history: ExpressionPadHistory): string {
  const encode = (steps: ExpressionPadHistoryStep[]) =>
    steps.map((step) => step.latex).join("\u241e");
  const present = history.present?.latex ?? "";
  return `${encode(history.past)}\u241f${present}\u241f${encode(history.future)}`;
}

export type ExpressionPadProps = {
  debug?: {
    render?: (
      state: ExpressionPadDebugState,
      actions: ExpressionPadDebugActions,
    ) => ReactNode;
  };
  initialLatex?: string;
  /**
   * Optional initial snapshot to hydrate the pad directly into render mode.
   * History is not restored.
   */
  initialSnapshot?: ExpressionPadSnapshot;
  /**
   * Optional serialized history to hydrate undo/redo state and current step.
   * When provided, this takes priority over initialSnapshot.
   */
  initialHistory?: ExpressionPadHistory;
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
   * Called whenever history changes so parents can persist it.
   */
  onHistoryChange?: (history: ExpressionPadHistory) => void;
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
  rects: Record<
    string,
    { left: number; top: number; right: number; bottom: number }
  >;
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

type MarqueeState = {
  pointerId: number;
  origin: { x: number; y: number };
  current: { x: number; y: number };
  candidateRects: Record<string, RectLTRB>;
  selectedIds: string[];
};

type PendingClickSelection = {
  pointerId: number;
  clickedId: string;
  newSelection: ExprSelection | null;
  multiplicativeSpan: ExprSelection | null;
  startedAt: number;
  phases: ProfilePhase[];
};

type ProfilePhase = {
  label: string;
  durationMs: number;
};

type ProfileSample = {
  kind: string;
  totalMs: number;
  phases: ProfilePhase[];
  selectionKind: string;
  selectionLatex: string;
  treeLatex: string;
  clickedId?: string;
  note?: string;
};

type PendingProfileSample = Omit<ProfileSample, "totalMs"> & {
  startedAt: number;
};

function roundProfileDuration(value: number): number {
  return Math.round(value * 100) / 100;
}

function measureProfileStep<T>(
  phases: ProfilePhase[],
  label: string,
  fn: () => T,
): T {
  const startedAt = performance.now();
  const result = fn();
  phases.push({
    label,
    durationMs: roundProfileDuration(performance.now() - startedAt),
  });
  return result;
}

function selectionKindLabel(selection: ExprSelection | null): string {
  return selection?.kind ?? "none";
}

function selectionLatexForProfile(
  tree: ExpressionTree | null,
  selection: ExprSelection | null,
): string {
  if (!tree || !selection) return "";
  if (selection.kind === "node") {
    return tree.nodesById[selection.nodeId]?.latex ?? "";
  }
  return getLatexForSelectionCopy(tree, selection);
}

function formatProfileSample(sample: ProfileSample | ProfileSample[] | null): string {
  if (!sample) return "";
  return JSON.stringify(sample, null, 2);
}

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
  initialHistory,
  prefillLatex,
  prefillKey,
  onSnapshot,
  onHistoryChange,
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
  const MARQUEE_SELECT_THRESHOLD_PX = 4;

  const [latexDraft, setLatexDraft] = useState<string>(initialLatex ?? "");

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
      rootJson: cloneMj(nextTree.rootJson),
    });
  }

  const applyPresentStep = useCallback((step: ExpressionPadHistoryStep) => {
    const sourceJson =
      step.rootJson !== undefined
        ? cloneMj(step.rootJson)
        : mathPadFacade.parseLatex(step.latex);
    if (!sourceJson) return;
    applyPresentJson(sourceJson, { latex: step.latex });
  }, [applyPresentJson]);

  // Use extracted hooks
  const {
    undo: undoHistory,
    redo: redoHistory,
    commit: commitHistory,
    canUndo,
    canRedo,
    history,
    replace: replaceHistory,
  } = useHistory<ExpressionPadHistoryStep>(null);

  const {
    selection,
    setSelection,
    handleClick: handleSelectionClick,
    expand: expandSelection,
    clear: clearSelection,
  } = useSelection(tree, moveMode);

  const [showInvalidateHistoryModal, setShowInvalidateHistoryModal] =
    useState(false);
  const [pendingHistoryStep, setPendingHistoryStep] =
    useState<ExpressionPadHistoryStep | null>(null);

  const commitStep = useCallback(
    (step: ExpressionPadHistoryStep) => {
      commitHistory(step);
      applyPresentStep(step);
    },
    [commitHistory, applyPresentStep],
  );

  const commitStepWithBranchGuard = useCallback(
    (step: ExpressionPadHistoryStep) => {
      if (canRedo) {
        setPendingHistoryStep(step);
        setShowInvalidateHistoryModal(true);
        return;
      }
      commitStep(step);
    },
    [canRedo, commitStep],
  );

  const handleMoveComplete = useCallback(
    (newTree: ExpressionTree, latex: string) => {
      commitStepWithBranchGuard(buildHistoryStep(newTree.rootJson, { latex }));
    },
    [commitStepWithBranchGuard],
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
    },
  );

  const [latexText, setLatexText] = useState<string>(
    "Type an equation, click Add / Update.",
  );
  const [expressionJsonText, setExpressionJsonText] = useState<string>(
    "Expression tree will appear here after rendering.",
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
  const [substituteSuggestionJson, setSubstituteSuggestionJson] =
    useState<MJ | null>(null);
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
  const [clickTrace, setClickTrace] = useState<string>("");
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "done">("idle");
  const [copySelectionFeedback, setCopySelectionFeedback] = useState<
    "idle" | "done"
  >("idle");
  const [copyHistoryFeedback, setCopyHistoryFeedback] = useState<
    "idle" | "done"
  >("idle");
  const [selectionProfile, setSelectionProfile] = useState<string>("");
  const [selectionProfileHistory, setSelectionProfileHistory] =
    useState<string>("");
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const copySelectionFeedbackTimeoutRef = useRef<number | null>(null);
  const copyHistoryFeedbackTimeoutRef = useRef<number | null>(null);
  const pendingClickSelectionRef = useRef<PendingClickSelection | null>(null);
  const activeMoveCaptureRef = useRef<ActiveMoveCapture | null>(null);
  const lastMoveCaptureRef = useRef<MoveCaptureFixture | null>(null);
  const moveApplyAttemptsRef = useRef<MoveApplyAttempt[]>([]);
  const selectionProfileHistoryRef = useRef<ProfileSample[]>([]);
  const pendingProfileSampleRef = useRef<PendingProfileSample | null>(null);
  const [profileFlushVersion, setProfileFlushVersion] = useState(0);
  const hasHydratedInitialRef = useRef(false);
  const lastHistorySignatureRef = useRef<string | null>(null);

  const recordProfileSample = useCallback((sample: ProfileSample) => {
    const normalized: ProfileSample = {
      ...sample,
      totalMs: roundProfileDuration(sample.totalMs),
      phases: sample.phases.map((phase) => ({
        ...phase,
        durationMs: roundProfileDuration(phase.durationMs),
      })),
    };
    setSelectionProfile(formatProfileSample(normalized));
    const nextHistory = [normalized, ...selectionProfileHistoryRef.current].slice(
      0,
      12,
    );
    selectionProfileHistoryRef.current = nextHistory;
    setSelectionProfileHistory(formatProfileSample(nextHistory));
  }, []);

  const scheduleProfileAfterPaint = useCallback((sample: PendingProfileSample) => {
    pendingProfileSampleRef.current = sample;
    setProfileFlushVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (hasHydratedInitialRef.current) return;
    const normalizedInitialHistory = normalizePersistedHistory(initialHistory);
    if (normalizedInitialHistory?.present) {
      replaceHistory(normalizedInitialHistory);
      applyPresentStep(normalizedInitialHistory.present);
      hasHydratedInitialRef.current = true;
      return;
    }
    if (!initialSnapshot) return;
    const initialStep: ExpressionPadHistoryStep = {
      latex: initialSnapshot.latex,
      rootJson: cloneMj(initialSnapshot.rootJson),
    };
    replaceHistory({ past: [], present: initialStep, future: [] });
    applyPresentStep(initialStep);
    hasHydratedInitialRef.current = true;
  }, [initialHistory, initialSnapshot, replaceHistory, applyPresentStep]);

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

  useEffect(() => {
    if (!onHistoryChange) return;
    if (!history.present) return;
    const signature = historyLatexSignature(history);
    if (lastHistorySignatureRef.current === signature) return;
    lastHistorySignatureRef.current = signature;
    onHistoryChange(history);
  }, [history, onHistoryChange]);

  const selectionCapabilities = useMemo(() => {
    const phases: ProfilePhase[] = [];
    const startedAt = performance.now();
    const canFlip = measureProfileStep(phases, "isFlippableEquation", () =>
      !!tree && mathPadFacade.isFlippableEquation(tree.rootJson),
    );
    const expandTargetId = measureProfileStep(phases, "getExpandTargetId", () =>
      tree ? mathPadFacade.getExpandTargetId(tree, selection) : null,
    );
    const substituteTargetId = measureProfileStep(
      phases,
      "getSubstituteTargetId",
      () => (tree ? mathPadFacade.getSubstituteTargetId(tree, selection) : null),
    );
    const canSubstitute = measureProfileStep(phases, "canSubstitute", () =>
      mathPadFacade.canSubstitute(tree, selection),
    );
    const canCancel = measureProfileStep(phases, "canCancel", () =>
      mathPadFacade.canCancel(tree, selection),
    );
    const canNegate = measureProfileStep(phases, "canNegate", () =>
      mathPadFacade.canNegate(tree, selection),
    );
    const canToggleDelimiterStyle = measureProfileStep(
      phases,
      "canToggleDelimiterStyle",
      () => mathPadFacade.canToggleDelimiterStyle(tree, selection),
    );
    const canForceDelimiter = measureProfileStep(
      phases,
      "canForceDelimiter",
      () => mathPadFacade.canForceDelimiter(tree, selection),
    );
    const canEvaluate = measureProfileStep(phases, "canEvaluate", () =>
      mathPadFacade.canEvaluate(tree, selection),
    );
    const canSimplify = measureProfileStep(phases, "canSimplify", () =>
      mathPadFacade.canSimplify(tree, selection),
    );
    const canFactor = measureProfileStep(phases, "canFactor", () =>
      mathPadFacade.canFactor(tree, selection),
    );
    const canDeclareFunction = measureProfileStep(
      phases,
      "canDeclareFunction",
      () => mathPadFacade.canDeclareFunction(tree, selection),
    );
    return {
      expandTargetId,
      substituteTargetId,
      canFlip,
      canApply: canFlip,
      canExpand: !!tree && !!expandTargetId,
      canSubstitute,
      canCancel,
      canNegate,
      canToggleDelimiterStyle,
      canForceDelimiter,
      canEvaluate,
      canSimplify,
      canFactor,
      canDeclareFunction,
      profile: {
        kind: "toolbar-enablement",
        totalMs: performance.now() - startedAt,
        phases,
        selectionKind: selectionKindLabel(selection),
        selectionLatex: selectionLatexForProfile(tree, selection),
        treeLatex: tree?.latexPlain ?? latexDraft,
      } satisfies ProfileSample,
    };
  }, [tree, selection, latexDraft]);

  const toolbarProfile = useMemo(
    () => formatProfileSample(selectionCapabilities.profile),
    [selectionCapabilities],
  );

  const {
    expandTargetId,
    substituteTargetId,
    canFlip,
    canApply,
    canExpand,
    canSubstitute,
    canCancel,
    canNegate,
    canToggleDelimiterStyle,
    canForceDelimiter,
    canEvaluate,
    canSimplify,
    canFactor,
    canDeclareFunction,
  } = selectionCapabilities;

  useEffect(() => {
    const pending = pendingProfileSampleRef.current;
    if (!pending) return;

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (pendingProfileSampleRef.current !== pending) return;
        const totalMs = roundProfileDuration(performance.now() - pending.startedAt);
        const phaseSum = pending.phases.reduce(
          (sum, phase) => sum + phase.durationMs,
          0,
        );
        const remainder = Math.max(0, roundProfileDuration(totalMs - phaseSum));
        const noteParts = [pending.note];
        noteParts.push(
          `toolbarEnablementMs=${roundProfileDuration(
            selectionCapabilities.profile.totalMs,
          )}`,
        );
        recordProfileSample({
          ...pending,
          totalMs,
          note: noteParts.filter(Boolean).join("; "),
          phases: [
            ...pending.phases,
            { label: "react/render/paint", durationMs: remainder },
          ],
        });
        pendingProfileSampleRef.current = null;
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [profileFlushVersion, recordProfileSample, selectionCapabilities.profile.totalMs]);

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
        const hit = Object.values(tree.nodesById).find(
          (node) => node.latex === latex,
        );
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
      getSelectionProfile: () => selectionProfileHistoryRef.current[0] ?? null,
      getSelectionProfileHistory: () => selectionProfileHistoryRef.current,
      getToolbarProfile: () => selectionCapabilities.profile,
      getNodeRectById: (nodeId: string) => {
        if (!nodeId) return null;
        const sr = (host as any).shadowRoot as ShadowRoot | null;
        if (!sr) return null;
        const els = sr.querySelectorAll<HTMLElement>(
          `[data-node-id="${CSS.escape(nodeId)}"]`,
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
  }, [tree, mode, selectionCapabilities, latexDraft]);

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
    },
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

  function buildHistoryStep(next: MJ, opts?: { latex?: string }): ExpressionPadHistoryStep {
    const nextTree = ExpressionTree.create(next);
    return {
      latex: opts?.latex ?? nextTree.latexPlain,
      rootJson: cloneMj(nextTree.rootJson),
    };
  }

  function commitJson(next: MJ, opts?: { latex?: string }) {
    const step = buildHistoryStep(next, opts);
    commitStepWithBranchGuard(step);
  }

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

  const onDeclareFunction = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "declareFunction" },
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

  const onNegate = useCallback(() => {
    if (!tree) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "negate" },
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

  const onForceDelimiter = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "forceDelimiter" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  function undo() {
    undoHistory(applyPresentStep);
  }

  function redo() {
    redoHistory(applyPresentStep);
  }

  function openSubstituteModal() {
    setSubstituteScope("single");
    setSubstituteError("");
    setSubstituteSuggestionJson(null);
    const initialLatex = getLatexForSelectionCopy(tree, selection);
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
          if (!Array.isArray(root) || root[0] !== "Equal" || root.length < 3)
            return [];
          const lhs = root[1] as MJ;
          const rhs = root[2] as MJ;
          const match = matchSubstituteSuggestion(lhs, rhs, selectedJson);
          if (!match) return [];
          return [
            {
              padIndex: sourcePadIndex,
              rhsLatex: match.rhsLatex,
              rhsJson: match.rhsJson,
            },
          ];
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
    [
      setSubstituteError,
      setSubstituteLatexDraft,
      substituteInputMode,
      otherPadSnapshots,
      tree,
      substituteTargetId,
    ],
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

    const parsed =
      substituteSuggestionJson ?? mathPadFacade.parseLatex(rhsLatex);
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
        "",
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

  function normalizeMarqueeSelectionIds(
    rawIds: string[],
    candidateRects: Record<string, RectLTRB>,
  ): string[] {
    if (!tree || rawIds.length === 0) return [];

    const keepDelimiterAsAtomicSelection = (id: string): boolean => {
      const info = tree.nodesById[id];
      if (!info) return false;
      if (info.op !== "Delimiter" && info.op !== "List") return false;
      const childId = tree.childrenById[id]?.[0];
      if (!childId) return false;
      const childOp = tree.nodesById[childId]?.op;
      // Keep grouped partial-operator terms selectable during marquee selection.
      return childOp === "FractionPartialDerivative";
    };

    const deduped = new Set<string>();
    for (const id of rawIds) {
      const normalized = mathPadFacade.normalizeSelection(tree, id);
      const info = tree.nodesById[normalized];
      if (!info) continue;
      if (
        info.op === "Add" ||
        info.op === "Equal" ||
        info.op === "InvisibleOperator" ||
        ((info.op === "Delimiter" || info.op === "List") &&
          !keepDelimiterAsAtomicSelection(normalized))
      ) {
        continue;
      }
      deduped.add(normalized);
    }

    const ids = Array.from(deduped);
    const idSet = new Set(ids);
    const survivors = ids.filter((id) => {
      let p = tree.parentById[id];
      while (p) {
        if (idSet.has(p)) return false;
        p = tree.parentById[p];
      }
      return true;
    });

    return survivors.sort((a, b) => {
      const ra = candidateRects[a];
      const rb = candidateRects[b];
      if (!ra && !rb) return a.localeCompare(b);
      if (!ra) return 1;
      if (!rb) return -1;
      if (ra.left !== rb.left) return ra.left - rb.left;
      if (ra.top !== rb.top) return ra.top - rb.top;
      return a.localeCompare(b);
    });
  }

  function computeMarqueeSelectionIds(
    origin: { x: number; y: number },
    current: { x: number; y: number },
    candidateRects: Record<string, RectLTRB>,
  ): string[] {
    const marqueeRect = rectFromPoints(origin, current);
    const raw = Object.entries(candidateRects)
      .filter(([, rect]) => rectsOverlap(marqueeRect, rect))
      .map(([id]) => id);
    return normalizeMarqueeSelectionIds(raw, candidateRects);
  }

  function commitSelectionFromClickResult(
    clickResult: {
      newSelection: ExprSelection | null;
      multiplicativeSpan: ExprSelection | null;
    },
    clickedId: string,
    source = "selection-commit",
    opts?: {
      startedAt?: number;
      phases?: ProfilePhase[];
      note?: string;
    },
  ) {
    if (!tree) return;
    const phases: ProfilePhase[] = [...(opts?.phases ?? [])];
    const startedAt = opts?.startedAt ?? performance.now();
    const nextSelection = clickResult.newSelection;
    if (nextSelection) {
      measureProfileStep(phases, "setSelection", () =>
        setSelection(nextSelection),
      );
      measureProfileStep(phases, "applySelectionHighlight", () =>
        applySelectionHighlight(
          nextSelection,
          tree,
          displayRef.current,
        ),
      );

      if (nextSelection.kind === "span") {
        const details = measureProfileStep(
          phases,
          "getSelectionDetailsForSpan",
          () =>
            getSelectionDetailsForSpan(
              tree,
              nextSelection,
              clickResult.multiplicativeSpan ? "Multiplicative span" : undefined,
            ),
        );
        measureProfileStep(phases, "updateSelectionDetails", () =>
          updateSelectionDetails(details),
        );
      } else if (nextSelection.kind === "multi") {
        const details = measureProfileStep(
          phases,
          "getSelectionDetailsForMulti",
          () => getSelectionDetailsForMulti(tree, nextSelection),
        );
        measureProfileStep(phases, "updateSelectionDetails", () =>
          updateSelectionDetails(details),
        );
      } else {
        const details = measureProfileStep(
          phases,
          "getSelectionDetailsForNode",
          () =>
            getSelectionDetailsForNode(tree, nextSelection.nodeId, {
              clickedId,
            }),
        );
        measureProfileStep(phases, "updateSelectionDetails", () =>
          updateSelectionDetails(details),
        );
      }
      scheduleProfileAfterPaint({
        kind: source,
        phases,
        selectionKind: selectionKindLabel(nextSelection),
        selectionLatex: selectionLatexForProfile(tree, nextSelection),
        treeLatex: tree.latexPlain,
        clickedId,
        note: opts?.note,
        startedAt,
      });
      return;
    }

    measureProfileStep(phases, "setSelection", () => setSelection(null));
    measureProfileStep(phases, "applySelectionHighlight", () =>
      applySelectionHighlight(null, tree, displayRef.current),
    );
    const clearedDetails = measureProfileStep(
      phases,
      "getResetSelectionDetails",
      () => getResetSelectionDetails("Cleared selection"),
    );
    measureProfileStep(phases, "updateSelectionDetails", () =>
      updateSelectionDetails(clearedDetails),
    );
    scheduleProfileAfterPaint({
      kind: source,
      phases,
      selectionKind: "none",
      selectionLatex: "",
      treeLatex: tree.latexPlain,
      clickedId,
      note: opts?.note,
      startedAt,
    });
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

    const phases: ProfilePhase[] = [];
    const startedAt = performance.now();
    let ids = measureProfileStep(phases, "getNodeIdsFromPointerEvent", () =>
      getNodeIdsFromPointerEvent(e),
    );
    const trace: Record<string, unknown> = {
      pointer: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
      composedPathIds: ids,
      primaryFallbackHitId: null,
      secondaryFallbackHitId: null,
      chosenId: null,
      startedMarquee: false,
    };
    if ((!ids || ids.length === 0) && displayRef.current) {
      const hit = measureProfileStep(phases, "hitTestOrClosestNodeId.primary", () =>
        hitTestOrClosestNodeIdInMathliveShadow(
          displayEl,
          e.clientX,
          e.clientY,
          { maxDistance: 40 },
        ),
      );
      trace.primaryFallbackHitId = hit.id;
      if (hit.id) ids = [hit.id];
    }
    let clickedId = measureProfileStep(
      phases,
      "chooseBestAllowedSelectedNode",
      () => mathPadFacade.chooseBestAllowedSelectedNode(ids, tree),
    );
    trace.chosenId = clickedId;
    if (!clickedId && displayRef.current) {
      // Composed-path IDs can be present but too structural (e.g. wrappers).
      // Retry from geometric hit test to recover the nearest selectable node.
      const fallback = measureProfileStep(
        phases,
        "hitTestOrClosestNodeId.secondary",
        () =>
          hitTestOrClosestNodeIdInMathliveShadow(
            displayEl,
            e.clientX,
            e.clientY,
            { maxDistance: 40 },
          ),
      );
      trace.secondaryFallbackHitId = fallback.id;
      const fallbackId = fallback.id;
      if (fallbackId) {
        const recovered = measureProfileStep(
          phases,
          "chooseBestAllowedSelectedNode.recovered",
          () =>
            mathPadFacade.chooseBestAllowedSelectedNode(
              [fallbackId, ...ids],
              tree,
            ),
        );
        if (recovered) clickedId = recovered;
      }
      trace.chosenId = clickedId;
    }

    if (!clickedId) {
      trace.startedMarquee = true;
      setClickTrace(JSON.stringify(trace, null, 2));
      pendingClickSelectionRef.current = null;
      const candidateRects = measureProfileStep(
        phases,
        "snapshotSelectableRectsForTree",
        () => snapshotSelectableRectsForTree(displayEl, tree),
      );
      recordProfileSample({
        kind: "marquee-start",
        totalMs: performance.now() - startedAt,
        phases,
        selectionKind: "none",
        selectionLatex: "",
        treeLatex: tree.latexPlain,
        note: `candidateRects=${Object.keys(candidateRects).length}`,
      });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setMarquee({
        pointerId: e.pointerId,
        origin: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY },
        candidateRects,
        selectedIds: [],
      });
      return;
    }
    setClickTrace(JSON.stringify(trace, null, 2));

    // Use the selection hook to handle click logic
    const modKey = e.metaKey || e.ctrlKey;
    const clickResult = measureProfileStep(phases, "handleSelectionClick", () =>
      handleSelectionClick(clickedId, e.shiftKey, modKey, selection),
    );
    const isAncestorOrSelf = (ancestorId: string, nodeId: string): boolean => {
      let cur: string | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };
    const clickedWithinExistingMultiSelection =
      !!tree &&
      selection?.kind === "multi" &&
      selection.nodeIds.some(
        (selectedId) =>
          isAncestorOrSelf(selectedId, clickedId) ||
          isAncestorOrSelf(clickedId, selectedId),
      );
    const effectiveDragIds =
      !e.shiftKey && !modKey && clickedWithinExistingMultiSelection
        ? selection.nodeIds
        : clickResult.dragIds;
    const effectiveReuseExisting =
      clickResult.reuseExistingSelection || clickedWithinExistingMultiSelection;

    // Ensure this pad receives keyboard events (Delete/Backspace) after click.
    (e.currentTarget as HTMLElement).focus?.();

    // Ctrl/Cmd multi-select: update selection only, no drag start.
    if (modKey) {
      pendingClickSelectionRef.current = null;
      commitSelectionFromClickResult(clickResult, clickedId, "multi-select commit", {
        startedAt,
        phases,
      });
      return;
    }

    // Handle SHIFT+click range selection
    if (e.shiftKey && clickResult.newSelection?.kind === "span") {
      pendingClickSelectionRef.current = null;
      measureProfileStep(phases, "setSelection", () =>
        setSelection(clickResult.newSelection),
      );
      measureProfileStep(phases, "applySelectionHighlight", () =>
        applySelectionHighlight(
          clickResult.newSelection,
          tree,
          displayRef.current,
        ),
      );
      const details = measureProfileStep(phases, "getSelectionDetailsForSpan", () =>
        getSelectionDetailsForSpan(
          tree,
          clickResult.newSelection as ExprSelection & { kind: "span" },
        ),
      );
      measureProfileStep(phases, "updateSelectionDetails", () =>
        updateSelectionDetails(details),
      );
      scheduleProfileAfterPaint({
        kind: "shift-range commit",
        phases,
        selectionKind: selectionKindLabel(clickResult.newSelection),
        selectionLatex: selectionLatexForProfile(tree, clickResult.newSelection),
        treeLatex: tree.latexPlain,
        clickedId,
        startedAt,
      });
      return;
    }

    // Start drag
    measureProfileStep(phases, "startDrag", () => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      startDrag(e.pointerId, effectiveDragIds, { x: e.clientX, y: e.clientY });
      setDragSlot("");
    });

    const shouldDeferClickSelectionCommit =
      !e.shiftKey &&
      !modKey &&
      (selection?.kind === "multi" ||
        (effectiveReuseExisting && clickResult.newSelection?.kind === "node"));
    if (shouldDeferClickSelectionCommit) {
      pendingClickSelectionRef.current = {
        pointerId: e.pointerId,
        clickedId,
        newSelection: clickResult.newSelection,
        multiplicativeSpan: clickResult.multiplicativeSpan,
        startedAt,
        phases: [...phases],
      };
    } else {
      pendingClickSelectionRef.current = null;
      commitSelectionFromClickResult(clickResult, clickedId, "click commit", {
        startedAt,
        phases,
      });
    }

    // Logging
    const normalizedId = mathPadFacade.normalizeSelection(tree, clickedId);
    const hit = tree.nodesById[normalizedId];
    if (!hit) {
      const resetDetails = getResetSelectionDetails(
        `clicked node-id: ${clickedId} (no NodeInfo found)`,
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
        `shift+${e.key} → no expansion (not in Add/InvisibleOperator or no parent/kids)`,
      );
      updateSelectionDetails(resetDetails);
      return;
    }

    setSelection(expanded);
    applySelectionHighlight(expanded, tree, displayRef.current);
    if (expanded.kind === "span") {
      const details = getSelectionDetailsForSpan(
        tree,
        expanded,
        `shift+${e.key} → expanded`,
      );
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
    if (marquee && e.pointerId === marquee.pointerId) {
      const current = { x: e.clientX, y: e.clientY };
      const selectedIds = computeMarqueeSelectionIds(
        marquee.origin,
        current,
        marquee.candidateRects,
      );
      setMarquee((prev) =>
        prev && prev.pointerId === e.pointerId
          ? { ...prev, current, selectedIds }
          : prev,
      );
      return;
    }

    const result = handleDragMove(e);
    setMovePlanText(
      result.planDescription || "No move intent (planMove returned null)",
    );
    setInfo3(
      result.plan
        ? JSON.stringify(result.plan, null, 2)
        : "planMove returned null",
    );
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
    if (marquee && e.pointerId === marquee.pointerId) {
      pendingClickSelectionRef.current = null;
      if (!tree) {
        setMarquee(null);
        return;
      }
      const phases: ProfilePhase[] = [];
      const startedAt = performance.now();
      const current = { x: e.clientX, y: e.clientY };
      const dragDistance = Math.hypot(
        current.x - marquee.origin.x,
        current.y - marquee.origin.y,
      );
      const selectedIds = measureProfileStep(
        phases,
        "computeMarqueeSelectionIds",
        () =>
          computeMarqueeSelectionIds(
            marquee.origin,
            current,
            marquee.candidateRects,
          ),
      );

      if (dragDistance < MARQUEE_SELECT_THRESHOLD_PX) {
        measureProfileStep(phases, "clearSelection", () => clearSelection());
        measureProfileStep(phases, "applySelectionHighlight", () =>
          applySelectionHighlight(null, tree, displayRef.current),
        );
        const details = measureProfileStep(
          phases,
          "getResetSelectionDetails",
          () => getResetSelectionDetails("Cleared selection"),
        );
        measureProfileStep(phases, "updateSelectionDetails", () =>
          updateSelectionDetails(details),
        );
        scheduleProfileAfterPaint({
          kind: "marquee-clear",
          phases,
          selectionKind: "none",
          selectionLatex: "",
          treeLatex: tree.latexPlain,
          startedAt,
        });
      } else {
        let next: ExprSelection | null = null;
        if (selectedIds.length === 1) {
          next = { kind: "node", nodeId: selectedIds[0] };
        } else if (selectedIds.length >= 2) {
          next = { kind: "multi", nodeIds: selectedIds };
        }

        measureProfileStep(phases, "setSelection", () => setSelection(next));
        measureProfileStep(phases, "applySelectionHighlight", () =>
          applySelectionHighlight(next, tree, displayRef.current),
        );
        if (next?.kind === "node") {
          const details = measureProfileStep(
            phases,
            "getSelectionDetailsForNode",
            () => getSelectionDetailsForNode(tree, next.nodeId),
          );
          measureProfileStep(phases, "updateSelectionDetails", () =>
            updateSelectionDetails(details),
          );
        } else if (next?.kind === "multi") {
          const details = measureProfileStep(
            phases,
            "getSelectionDetailsForMulti",
            () =>
              getSelectionDetailsForMulti(
                tree,
                next,
                "Rubber-band selection",
              ),
          );
          measureProfileStep(phases, "updateSelectionDetails", () =>
            updateSelectionDetails(details),
          );
        } else {
          const details = measureProfileStep(
            phases,
            "getResetSelectionDetails",
            () => getResetSelectionDetails("Rubber-band selection"),
          );
          measureProfileStep(phases, "updateSelectionDetails", () =>
            updateSelectionDetails(details),
          );
        }
        scheduleProfileAfterPaint({
          kind: "marquee-commit",
          phases,
          selectionKind: selectionKindLabel(next),
          selectionLatex: selectionLatexForProfile(tree, next),
          treeLatex: tree.latexPlain,
          note: `selectedIds=${selectedIds.length}`,
          startedAt,
        });
      }

      if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      }
      setMarquee(null);
      return;
    }

    const dragResult = handleDragUp(e);
    const pending = pendingClickSelectionRef.current;
    if (pending && pending.pointerId === e.pointerId) {
      if (!dragResult.dragged) {
        commitSelectionFromClickResult(
          {
            newSelection: pending.newSelection,
            multiplicativeSpan: pending.multiplicativeSpan,
          },
          pending.clickedId,
          "deferred click commit",
          {
            startedAt: pending.startedAt,
            phases: pending.phases,
            note: "selection commit deferred until pointerup",
          },
        );
      }
      pendingClickSelectionRef.current = null;
      return;
    }

    if (!dragResult.moved && tree) {
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
    opts?: { stroke?: string; fill?: string; dash?: boolean },
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
    overlay: HTMLElement,
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

  const marqueeRect = useMemo(() => {
    if (!marquee || !renderBoxRef.current) return null;
    const local = renderBoxRef.current.getBoundingClientRect();
    const rect = rectFromPoints(marquee.origin, marquee.current);
    return {
      left: rect.left - local.left,
      top: rect.top - local.top,
      width: Math.max(0, rect.right - rect.left),
      height: Math.max(0, rect.bottom - rect.top),
    };
  }, [marquee]);
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
      return getLatexForSelectionCopy(tree, selection);
    }
    return substituteTargetId
      ? (tree.nodesById[substituteTargetId]?.latex ?? "")
      : "";
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
      const match = matchSubstituteSuggestion(lhs, rhs, selectedJson);
      if (!match) return [];
      return [{ padIndex, rhsLatex: match.rhsLatex, rhsJson: match.rhsJson }];
    });
  }, [otherPadSnapshots, substituteTargetId, tree]);

  const latexForCopy =
    (tree ? ExpressionTree.exportLatex(tree.rootJson) : null) ??
    (latexText && latexText !== "Type an equation, click Add / Update."
      ? latexText
      : latexDraft);
  const canCopyLatex = !!latexForCopy?.trim();

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      if (copySelectionFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copySelectionFeedbackTimeoutRef.current);
      }
      if (copyHistoryFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyHistoryFeedbackTimeoutRef.current);
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
      900,
    );
  }

  function markCopySelectionSuccess() {
    setCopySelectionFeedback("done");
    if (copySelectionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copySelectionFeedbackTimeoutRef.current);
    }
    copySelectionFeedbackTimeoutRef.current = window.setTimeout(
      () => setCopySelectionFeedback("idle"),
      900,
    );
  }

  function markCopyHistorySuccess() {
    setCopyHistoryFeedback("done");
    if (copyHistoryFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyHistoryFeedbackTimeoutRef.current);
    }
    copyHistoryFeedbackTimeoutRef.current = window.setTimeout(
      () => setCopyHistoryFeedback("idle"),
      900,
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
    // Prefer the canonical rendered latex so edit mode reflects normalized forms
    // (e.g. MathLive aliases like \lbrack/\rbrack -> \left[...\right]).
    const currentLatex = tree?.latexPlain || latexText || latexDraft;
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

  const onSimplify = useCallback(() => {
    if (!tree || !selection) return;
    const result = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "simplify" },
    });
    if (!result.ok) return;
    commitJson(result.tree.rootJson, { latex: result.tree.latexPlain });
  }, [tree, selection, commitJson]);

  async function onCopyLatex() {
    if (!canCopyLatex || !latexForCopy) return;
    const copied = await copyTextToClipboard(latexForCopy);
    if (copied) {
      markCopySuccess();
    }
  }

  const selectionLatexForCopy = useMemo(
    () => getLatexForSelectionCopy(tree, selection),
    [tree, selection],
  );
  const canCopySelection = !!selectionLatexForCopy.trim();
  const fullHistorySteps = useMemo(() => {
    if (!history.present) return [];
    return [...history.past, history.present, ...history.future];
  }, [history]);
  const fullHistoryLatex = useMemo(() => {
    return fullHistorySteps
      .map((step) => {
        const parsed =
          step.rootJson !== undefined
            ? cloneMj(step.rootJson)
            : mathPadFacade.parseLatex(step.latex);
        const exportLatex = parsed ? ExpressionTree.exportLatex(parsed) : step.latex;
        return `$$ ${exportLatex} $$`;
      })
      .join("\n");
  }, [fullHistorySteps]);
  const canCopyHistory = !!fullHistorySteps.length;

  async function copyTextToClipboard(text: string): Promise<boolean> {
    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // Ignore and try fallback path.
    }
    if (!copied) {
      try {
        if (typeof document === "undefined") return false;
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        copied = true;
      } catch {
        // Best effort only.
      }
    }
    return copied;
  }

  async function onCopySelection() {
    if (!canCopySelection) return;
    const copied = await copyTextToClipboard(selectionLatexForCopy);
    if (copied) markCopySelectionSuccess();
  }

  async function onCopyHistory() {
    if (!canCopyHistory || !fullHistoryLatex) return;
    const copied = await copyTextToClipboard(fullHistoryLatex);
    if (copied) markCopyHistorySuccess();
  }

  function confirmInvalidateFutureHistory() {
    if (!pendingHistoryStep) return;
    commitStep(pendingHistoryStep);
    setPendingHistoryStep(null);
    setShowInvalidateHistoryModal(false);
  }

  function cancelInvalidateFutureHistory() {
    setPendingHistoryStep(null);
    setShowInvalidateHistoryModal(false);
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
    clickTrace,
    selectionProfile,
    selectionProfileHistory,
    toolbarProfile,
    debugBoxes,
  };

  const debugActions: ExpressionPadDebugActions = {
    setDebugBoxesEnabled: setDebugBoxes,
    toggleDebugBoxes: () => setDebugBoxes((v) => !v),
  };

  return (
    <div style={{ padding: 6, maxWidth: 1000 }}>
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
            marqueeRect={marqueeRect}
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
                onDeclareFunction={onDeclareFunction}
                canDeclareFunction={canDeclareFunction}
                onCancelTerm={onCancelTerm}
                canCancelTerm={canCancel}
                onNegate={onNegate}
                canNegate={canNegate}
                onForceDelimiter={onForceDelimiter}
                canForceDelimiter={canForceDelimiter}
                onToggleDelimiterStyle={onToggleDelimiterStyle}
                canToggleDelimiterStyle={canToggleDelimiterStyle}
                onEvaluate={onEvaluate}
                canEvaluate={canEvaluate}
                onSimplify={onSimplify}
                canSimplify={canSimplify}
                onOpenApply={openApplyModal}
                canApply={canApply}
                onOpenSubstitute={openSubstituteModal}
                canSubstitute={canSubstitute}
                onCopyLatex={onCopyLatex}
                canCopyLatex={canCopyLatex}
                onCopySelection={onCopySelection}
                canCopySelection={canCopySelection}
                onCopyHistory={onCopyHistory}
                canCopyHistory={canCopyHistory}
                copyFeedback={copyFeedback}
                copySelectionFeedback={copySelectionFeedback}
                copyHistoryFeedback={copyHistoryFeedback}
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
      <InvalidateHistoryModal
        open={showInvalidateHistoryModal}
        onConfirm={confirmInvalidateFutureHistory}
        onCancel={cancelInvalidateFutureHistory}
      />
    </div>
  );
}
