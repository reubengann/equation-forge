import "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { parse } from "../../computeEngine";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";
import {
  chooseBestAllowedSelectedNode,
  normalizeSelection,
  type ExprSelection,
} from "../../selectionSemantics";
import { substitute, type SubstituteScope } from "../../substitute";
import { useHistory } from "../../hooks/useHistory";
import { useSelection, getNodeIdsFromPointerEvent } from "../../hooks/useSelection";
import { useDragMove } from "../../hooks/useDragMove";
import { flipEquation, isFlippableEquation } from "../../flipEquation";
import {
  applySelectionHighlight,
  getSelectionDetailsForNode,
  getSelectionDetailsForSpan,
  getResetSelectionDetails,
  type SelectionDetails,
} from "../../helpers/selectionHelpers";
import { MathDisplayPanel } from "./MathDisplayPanel";
import { MoveModeToolbar } from "./MoveModeToolbar";
import { ApplyModal } from "./ApplyModal";
import { SubstituteModal } from "./SubstituteModal";
import type { MoveMode } from "../../moveExpression/applyMove";
import { hitTestNodeIdInMathliveShadow } from "../../infra/mathlive/mathliveShadow";
import { applyOperationToBothSides } from "../../applyBothSides";
import {
  installShadowStyle,
  setHighlightedText,
} from "../../infra/mathlive/derivationPadHighlight";

type InputMode = "mathlive" | "text";

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

export type ExpressionPadProps = {
  debug?: {
    render?: (
      state: ExpressionPadDebugState,
      actions: ExpressionPadDebugActions
    ) => ReactNode;
  };
  initialLatex?: string;
  /**
   * Optional external prefill used by debug tooling (e.g., examples list in App).
   * Whenever prefillKey changes, this latex is applied to the input fields.
   */
  prefillLatex?: string;
  prefillKey?: string | number;
};

MathfieldElement.fontsDirectory = "/fonts";

type Mode = "entry" | "render";

export function ExpressionPad({
  debug,
  initialLatex,
  prefillLatex,
  prefillKey,
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
  const insertOverlayRef = useRef<HTMLDivElement | null>(null);

  const [latexDraft, setLatexDraft] = useState<string>(
    initialLatex ?? ""
  );

  // Define applyPresentJson before hooks that use it
  function applyPresentJson(json: MJ, opts?: { latex?: string }) {
    const nextTree = ExpressionTree.create(json);
    setTree(nextTree);
    renderTree(nextTree, {
      preview: false,
      selectionOverride: null,
      clearHighlightAfterRender: true,
    });
    setSelection(null);
    setInfoFromTree(nextTree, opts?.latex ?? nextTree.latexPlain);
    setMode("render");
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
    handleMoveComplete
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

  // Allow parent (debug UI) to push a new latex draft (e.g., example copy).
  useEffect(() => {
    if (prefillLatex === undefined) return;
    setLatexDraft(prefillLatex);
    setMode("entry");
    if (inputRef.current) inputRef.current.value = prefillLatex;
    if (textInputRef.current) textInputRef.current.value = prefillLatex;
  }, [prefillLatex, prefillKey]);

  useEffect(() => {
    if (showSubstituteModal && substituteFieldRef.current) {
      substituteFieldRef.current.value = "";
      substituteFieldRef.current.focus();
    }
  }, [showSubstituteModal]);

  useEffect(() => {
    if (showApplyModal && applyFieldRef.current) {
      applyFieldRef.current.value = "";
      applyFieldRef.current.focus();
    }
  }, [showApplyModal]);

  useEffect(() => {
    if (showSubstituteModal && (!tree || !selection || selection?.kind !== "node")) {
      closeSubstituteModal();
    }
  }, [showSubstituteModal, tree, selection]);

  useEffect(() => {
    const mf = inputRef.current;
    if (!mf) return;

    mf.setOptions(vecMacroOptions);
  }, []);

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

    (displayRef.current as any).setOptions?.(vecMacroOptions);

    const renderLatex = t.latexTagged;
    (displayRef.current as any).setOptions?.(vecMacroOptions);
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
    return !!tree && isFlippableEquation(tree.rootJson);
  }, [tree]);

  const onFlip = useCallback(() => {
    if (!tree) return;
    const flipped = flipEquation(tree.rootJson);
    if (!flipped) return;
    const latex = ExpressionTree.create(flipped).latexPlain;
    commitJson(flipped, { latex });
  }, [tree]);

  function undo() {
    undoHistory(applyPresentJson);
  }

  function redo() {
    redoHistory(applyPresentJson);
  }

  function openSubstituteModal() {
    setSubstituteScope("single");
    setSubstituteError("");
    setShowSubstituteModal(true);
  }

  function openApplyModal() {
    setApplyError("");
    setShowApplyModal(true);
  }

  function closeSubstituteModal() {
    setShowSubstituteModal(false);
    setSubstituteError("");
  }

  function closeApplyModal() {
    setShowApplyModal(false);
    setApplyError("");
  }

  function submitSubstitution() {
    if (!tree || selection?.kind !== "node") {
      setSubstituteError("Select a node to substitute.");
      return;
    }

    const rhsLatex: string = substituteFieldRef.current?.value ?? "";
    if (!rhsLatex.trim()) {
      setSubstituteError("Enter a replacement expression.");
      return;
    }

    const parsed = parse(rhsLatex);
    if (!parsed) {
      setSubstituteError("Could not parse replacement.");
      return;
    }

    const replacement = parsed as MJ;
    const result = substitute({
      tree,
      targetId: selection.nodeId,
      replacement,
      scope: substituteScope,
    });

    if (!result) {
      setSubstituteError("Substitution failed.");
      return;
    }

    commitJson(result.rootJson, { latex: result.latexPlain });
    setSubstituteError("");
    setShowSubstituteModal(false);
  }

  function submitApplyOperation() {
    if (!tree || !isFlippableEquation(tree.rootJson)) {
      setApplyError("Enter an equation first.");
      return;
    }

    const opLatex: string = applyFieldRef.current?.value ?? "";
    if (!opLatex.trim()) {
      setApplyError("Enter an operation.");
      return;
    }

    try {
      const result = applyOperationToBothSides(tree.rootJson, opLatex);
      const latex = ExpressionTree.create(result).latexPlain;
      commitJson(result, { latex });
      setApplyError("");
      setShowApplyModal(false);
    } catch (err: any) {
      setApplyError(err?.message || "Could not apply operation.");
    }
  }

  function onAddEquation() {
    const latex: string =
      inputMode === "mathlive"
        ? (inputRef.current?.value as string)
        : textInputRef.current?.value ?? "";
    const mj = parse(latex);
    if (!mj) {
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
    const clickedId = chooseBestAllowedSelectedNode(ids, tree);

    if (!clickedId) {
      clearSelection();
      applySelectionHighlight(null, tree, displayRef.current);
      return;
    }

    // Use the selection hook to handle click logic
    const clickResult = handleSelectionClick(clickedId, e.shiftKey, selection);

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
    startDrag(e.pointerId, clickResult.dragIds);
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
    const normalizedId = normalizeSelection(tree, clickedId);
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

    if (!e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!displayRef.current) return;
    if (!selection) return;
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
    } else {
      const details = getSelectionDetailsForNode(tree, expanded.nodeId, {
        shiftKey: true,
      });
      details.note = `shift+${e.key} → expanded`;
      updateSelectionDetails(details);
    }
  }

  function onDisplayPointerMove(e: React.PointerEvent) {
    const result = handleDragMove(e);
    if (result.plan) {
      setMovePlanText(result.planDescription);
      setInfo3(
        result.plan ? JSON.stringify(result.plan, null, 2) : "planMove returned null"
      );
      setInfoArgs(result.infoArgs);
      setDragSlot(result.plan ? result.plan.kind : "");
      // Update drag info for display
      if (drag) {
        setDragStartInfo(displayNodeInfo(drag.selectedIds[0] ?? null));
        setDragHoverInfo(
          result.hoverId ? displayNodeInfo(result.hoverId) : "No current hover"
        );
        setParentAddId(result.hoverId ?? "");
      }
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

  const canSubstitute = !!tree && selection?.kind === "node";
  const canApply = !!tree && isFlippableEquation(tree.rootJson);
  const selectedNodeLatex =
    canSubstitute && tree && selection?.kind === "node"
      ? tree.nodesById[selection.nodeId]?.latex ?? ""
      : "";

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

  const monoFont =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const labelStyle: CSSProperties = { fontSize: 13, color: "var(--dp-muted)" };
  const inputStyle: CSSProperties = {
    width: "100%",
    border: "1px solid var(--dp-border)",
    background: "var(--dp-surface)",
    color: "inherit",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: monoFont,
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h2>Derivation Pad — Confirm Selection</h2>

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
              {inputMode === "mathlive" ? (
                <MathField
                  ref={inputRef}
                  value={latexDraft}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 8,
                  }}
                  data-testid="latex-input"
                  onInput={(e: any) => setLatexDraft(e.target?.value ?? "")}
                  macros={{ vec: "\\mathbf{#1}" }}
                />
              ) : (
                <textarea
                  ref={textInputRef}
                  value={latexDraft}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    minHeight: 80,
                    fontFamily: monoFont,
                    background: "var(--dp-surface)",
                    color: "inherit",
                  }}
                  data-testid="latex-input"
                  onChange={(e) => setLatexDraft(e.target.value)}
                />
              )}
            </div>
            <button
              onClick={onAddEquation}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #888",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
              }}
              title="Add / Update"
              aria-label="Add / Update"
              data-testid="add-update"
            >
              ✓
            </button>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="entry-mode"
                value="mathlive"
                checked={inputMode === "mathlive"}
                onChange={() => setInputMode("mathlive")}
              />
              MathLive
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="entry-mode"
                value="text"
                checked={inputMode === "text"}
                onChange={() => setInputMode("text")}
              />
              Plain text (LaTeX)
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
          </div>
        </div>
      )}

      {mode === "render" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              onClick={onEdit}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--dp-border)",
                background: "var(--dp-surface)",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          </div>
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
                onOpenApply={openApplyModal}
                canApply={canApply}
                onOpenSubstitute={openSubstituteModal}
                canSubstitute={canSubstitute}
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
        substituteFieldRef={substituteFieldRef}
        MathField={MathField}
        MathDiv={MathDiv}
      />
    </div>
  );
}
