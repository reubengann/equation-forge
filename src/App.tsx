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
} from "react";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { parse } from "./computeEngine";
import { getMathliveShadowRoot } from "./infra/mathlive/mathliveShadow";
import { vecMacroOptions } from "./infra/mathlive/vecMacroOptions";
import {
  chooseBestAllowedSelectedNode,
  normalizeSelection,
  type ExprSelection,
} from "./selectionSemantics";
import { substitute, type SubstituteScope } from "./substitute";
import { useHistory } from "./hooks/useHistory";
import { useSelection, getNodeIdsFromPointerEvent } from "./hooks/useSelection";
import { useDragMove } from "./hooks/useDragMove";
import { flipEquation, isFlippableEquation } from "./flipEquation";
import {
  applySelectionHighlight,
  getSelectionDetailsForNode,
  getSelectionDetailsForSpan,
  getResetSelectionDetails,
  type SelectionDetails,
} from "./helpers/selectionHelpers";
import { MathDisplayPanel } from "./ui/components/MathDisplayPanel";
import { MoveModeToolbar } from "./ui/components/MoveModeToolbar";
import { SubstituteModal } from "./ui/components/SubstituteModal";
import type { MoveMode } from "./moveExpression/applyMove";
import "./App.css";
import { hitTestNodeIdInMathliveShadow } from "./infra/mathlive/mathliveShadow";
MathfieldElement.fontsDirectory = "/fonts";

// let found2: any = null;
// let found3: any = null;

// getNodeIdsFromComposedPath is now in useSelection hook

function installShadowStyle(mathDivEl: HTMLElement) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  if (sr.querySelector("style[data-derivation-pad]")) return;

  const style = document.createElement("style");
  style.setAttribute("data-derivation-pad", "1");
  style.textContent = `

  /* Any element whose class includes ML__vlist and any descendant.
     Disable clicks on Mathlive's fraction layout scaffolding */
  .ML__vlist {
    pointer-events: none !important;
  }

  [data-node-id] [data-node-id] {
    pointer-events: auto !important;
  }

  /* But still allow clicks on our tagged nodes (and their descendants) */
  .dp-selected { color: #ff9800;}
  .dp-faded { opacity: 0.25; }
  .dp-dragging { color: #7c4dff; font-weight: 600; }
  `;
  sr.appendChild(style);
}

export function setHighlightedText(
  mathDivEl: HTMLElement,
  nodeIds?: string[] | null
) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  sr.querySelectorAll(".dp-selected").forEach((el) =>
    el.classList.remove("dp-selected")
  );

  const ids = nodeIds ?? [];
  for (const id of ids) {
    sr.querySelectorAll<HTMLElement>(
      `[data-node-id="${CSS.escape(id)}"]`
    ).forEach((el) => el.classList.add("dp-selected"));
  }
}

export default function App() {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);

  const [tree, setTree] = useState<ExpressionTree | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>("additive");

  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const substituteFieldRef = useRef<any>(null);
  const insertOverlayRef = useRef<HTMLDivElement | null>(null);

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
    measureRef.current,
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
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
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

  // Example expressions for quick testing
  const examples = [
    String.raw`\vec{F} = m \vec{a}`,
    String.raw`\exp x`,
    String.raw`\sin (x+y) + \cos x`,
    String.raw`\int_{0}^{5} x^2\,\mathrm{d}x`,
    String.raw`\dfrac{\partial f}{\partial x}`,
    String.raw`\dfrac{\differentialD f(x)}{\differentialD x}`,
    String.raw`\frac{a+b}{2}+c+d=e-f`,
    String.raw`x^2 + v_x = m a`,
    String.raw`\frac{d x}{d t} = v`,
    String.raw`\sum_{i=1}^{n} a_i = S`,
    String.raw`\vec{F} = m \vec{a}`,
  ];
  const [exampleIdx, setExampleIdx] = useState(0);
  const [exampleLatex, setExampleLatex] = useState(examples[0]);

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

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: 240,
    resize: "vertical",
  };

  const readonlyBoxStyle: CSSProperties = {
    ...inputStyle,
    minHeight: 52,
    whiteSpace: "pre-wrap",
  };

  const fieldHalfStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: "calc(50% - 6px)",
  };

  const fieldFullStyle: CSSProperties = { ...fieldHalfStyle, width: "100%" };

  const debugPanelStyle: CSSProperties = {
    marginTop: 18,
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  };

  const gridStyle: CSSProperties = {
    width: "100%",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  };

  const miniGridStyle: CSSProperties = {
    width: "100%",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  };

  useEffect(() => {
    const mf = inputRef.current;
    const latex = examples[exampleIdx] ?? examples[0];
    setExampleLatex(latex);
    if (mf) {
      mf.value = latex;
    }
  }, [exampleIdx]);

  useEffect(() => {
    if (showSubstituteModal && substituteFieldRef.current) {
      substituteFieldRef.current.value = "";
      substituteFieldRef.current.focus();
    }
  }, [showSubstituteModal]);

  useEffect(() => {
    if (
      showSubstituteModal &&
      (!tree || !selection || selection?.kind !== "node")
    ) {
      closeSubstituteModal();
    }
  }, [showSubstituteModal, tree, selection, closeSubstituteModal]);
  useEffect(() => {
    const mf = inputRef.current;
    if (!mf) return;

    mf.setOptions(vecMacroOptions);
  }, []);
  // Helper functions moved to helpers/hooks:
  // - selectionContainsId: in useSelection hook
  // - rectForNodeId, rectForVisual: in dragHelpers
  // - describeMovePlan, planToApplyMoveTarget: in dragHelpers
  // - insertXForAdd, computeInsertX, targetRectForPlan, renderInsertOverlay: in dragHelpers

  // Helper functions moved to hooks/helpers:
  // - clearSelection: in useSelection hook
  // - applySelectionHighlight: in selectionHelpers
  // - getNodeIdsFromPointerEvent: exported from useSelection hook

  function renderTree(
    t: ExpressionTree,
    opts?: {
      preview?: boolean;
      selectionOverride?: ExprSelection | null;
      clearHighlightAfterRender?: boolean;
    }
  ) {
    if (!displayRef.current) return;
    if (!measureRef.current) return;

    // Ensure output math-div uses the same vec macro as input.
    (displayRef.current as any).setOptions?.(vecMacroOptions);
    (measureRef.current as any).setOptions?.(vecMacroOptions);

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

    if (!opts?.preview) {
      (measureRef.current as any).setOptions?.(vecMacroOptions);
      if ("value" in (measureRef.current as any)) {
        (measureRef.current as any).value = renderLatex;
      } else {
        measureRef.current.textContent = renderLatex;
      }
      (measureRef.current as any).render?.();
    }

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
  }, [tree, commitJson]);

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

  function closeSubstituteModal() {
    setShowSubstituteModal(false);
    setSubstituteError("");
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

  function onAddEquation() {
    const mf = inputRef.current;
    // console.log(mf.value);
    const latex: string = mf.value;
    const mj = parse(latex);
    if (!mj) {
      setLatexText(latex);
      setExpressionJsonText("Parse failed. Check LaTeX input.");
      return;
    }

    commitJson(mj, { latex });
  }

  // getNodeIdsFromPointerEvent is now exported from useSelection hook

  function displayNodeInfo(nodeId: string | null): string {
    if (!nodeId) return "No id";
    if (!tree) return "No tree";
    if (!tree.nodesById[nodeId]) return `Node ${nodeId} not found`;
    const node = tree.nodesById[nodeId];
    return `${node.id} ${node.latex}`;
  }

  function onDisplayPointerDown(e: React.PointerEvent) {
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
      applySelectionHighlight(
        clickResult.newSelection,
        tree,
        displayRef.current
      );
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
      applySelectionHighlight(
        clickResult.newSelection,
        tree,
        displayRef.current
      );

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

  // Selection details helpers are now in selectionHelpers.ts
  // Using updateSelectionDetails wrapper function above

  function onKeyDown(e: React.KeyboardEvent) {
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
      const details = getSelectionDetailsForSpan(
        tree,
        expanded,
        `shift+${e.key} → expanded`
      );
      updateSelectionDetails(details);
    } else {
      const details = getSelectionDetailsForNode(tree, expanded.nodeId, {
        shiftKey: true,
      });
      details.note = `shift+${e.key} → expanded`;
      updateSelectionDetails(details);
    }
  }

  // collapseMultiplicativeSelection is now in useDragMove hook

  function onDisplayPointerMove(e: React.PointerEvent) {
    const result = handleDragMove(e);
    if (result.plan) {
      setMovePlanText(result.planDescription);
      setInfo3(
        result.plan
          ? JSON.stringify(result.plan, null, 2)
          : "planMove returned null"
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "`") {
        e.preventDefault();
        setDebugBoxes((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onShortcut(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const insideMathField =
        active?.tagName?.toLowerCase() === "math-field" ||
        active?.closest?.("math-field");
      const tag = active?.tagName?.toLowerCase();
      const isFormField = tag === "input" || tag === "textarea";
      if (insideMathField || isFormField || active?.isContentEditable) return;

      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const isUndo = mod && key === "z" && !e.shiftKey;
      const isRedo = mod && (key === "y" || (key === "z" && e.shiftKey));

      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [undo, redo]);

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

  // function clearOverlay(overlay: HTMLElement) {
  //   overlay.replaceChildren();
  // }

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

  // function drawPoint(overlay: HTMLElement, x: number, y: number) {
  //   const p = document.createElement("div");
  //   p.style.position = "absolute";
  //   p.style.left = `${x - 3}px`;
  //   p.style.top = `${y - 3}px`;
  //   p.style.width = "6px";
  //   p.style.height = "6px";
  //   p.style.borderRadius = "50%";
  //   p.style.background = "red";
  //   overlay.appendChild(p);
  // }

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

  // const defaultString = String.raw`a=b`;

  // canUndo and canRedo are now from useHistory hook
  const canSubstitute = !!tree && selection?.kind === "node";
  const selectedNodeLatex =
    canSubstitute && tree && selection?.kind === "node"
      ? tree.nodesById[selection.nodeId]?.latex ?? ""
      : "";
  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h2>Derivation Pad — Confirm Selection</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ width: "100%" }}>
          <MathField
            ref={inputRef}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
            data-testid="latex-input"
          >
            {exampleLatex}
          </MathField>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 200,
            }}
          >
            <label style={{ fontSize: 12, opacity: 0.8 }}>Examples</label>
            <select
              value={exampleIdx}
              onChange={(e) => setExampleIdx(Number(e.target.value))}
              style={{ padding: "6px 8px", borderRadius: 6, width: "100%" }}
              data-testid="examples-select"
            >
              {examples.map((ex, idx) => (
                <option key={idx} value={idx}>
                  {ex}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onAddEquation}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #888",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            data-testid="add-update"
          >
            Add / Update
          </button>
        </div>
      </div>

      <MathDisplayPanel
        renderBoxRef={renderBoxRef}
        mathWrapRef={mathWrapRef}
        measureRef={measureRef}
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
            onOpenSubstitute={openSubstituteModal}
            canSubstitute={canSubstitute}
          />
        }
        isDragging={!!drag}
        MathDiv={MathDiv}
      />

      <div style={debugPanelStyle}>
        <div style={fieldFullStyle}>
          <label htmlFor="dp-latex-text" style={labelStyle}>
            LaTeX
          </label>
          <input
            id="dp-latex-text"
            style={inputStyle}
            readOnly
            value={latexText}
            data-testid="info-text"
          />
        </div>

        <div style={fieldFullStyle}>
          <label htmlFor="dp-expression-json" style={labelStyle}>
            Expression Tree (MathJSON)
          </label>
          <textarea
            id="dp-expression-json"
            style={textareaStyle}
            readOnly
            value={expressionJsonText}
          />
        </div>

        <div style={gridStyle}>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Selection kind</label>
            <input style={inputStyle} readOnly value={selectionKind || "—"} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Clicked node id</label>
            <input
              style={inputStyle}
              readOnly
              value={selectionClickedId || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Selected node id</label>
            <input
              style={inputStyle}
              readOnly
              value={selectionSelectedId || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Node op</label>
            <input style={inputStyle} readOnly value={selectionOp || "—"} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Parent</label>
            <input style={inputStyle} readOnly value={selectionParent || "—"} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Range / span</label>
            <input style={inputStyle} readOnly value={selectionRange || "—"} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child ids</label>
            <div style={readonlyBoxStyle}>{selectionChildIds || "—"}</div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child ops</label>
            <div style={readonlyBoxStyle}>{selectionChildOps || "—"}</div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child latex</label>
            <div style={readonlyBoxStyle}>{selectionChildLatex || "—"}</div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Node latex</label>
            <input
              style={inputStyle}
              readOnly
              value={selectionLatexDetail || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Node mathjson</label>
            <div style={readonlyBoxStyle}>{selectionJsonDetail || "—"}</div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Selection note</label>
            <div style={readonlyBoxStyle}>{selectionNote || "—"}</div>
          </div>
        </div>

        <div style={gridStyle}>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Move plan</label>
            <div style={readonlyBoxStyle}>{movePlanText || "—"}</div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Move plan (JSON)</label>
            <div style={readonlyBoxStyle} data-testid="info3-text">
              {info3 || "—"}
            </div>
          </div>
        </div>

        <div style={fieldFullStyle}>
          <label style={labelStyle}>Planner args</label>
          <textarea
            style={{ ...textareaStyle, minHeight: 140 }}
            readOnly
            value={infoArgs || "—"}
            data-testid="info-args"
          />
        </div>

        <div style={miniGridStyle}>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Previous hover target</label>
            <input style={inputStyle} readOnly value={dragStartInfo} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Hover drag</label>
            <input style={inputStyle} readOnly value={dragHoverInfo} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Drag slot</label>
            <input style={inputStyle} readOnly value={dragSlot} />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Parent Add</label>
            <input style={inputStyle} readOnly value={parentAddId} />
          </div>
        </div>
      </div>

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
