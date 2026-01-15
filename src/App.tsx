import "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { ce } from "./computeEngine";
import {
  getMathliveShadowRoot,
  hitTestNodeIdInMathliveShadow,
  queryElementsByNodeIds,
  remapEqualHoverToSide,
  unionBoundingClientRects,
} from "./mathliveShadow";
import {
  chooseBestAllowedSelectedNode,
  expandSelection,
  getDescendantNodeIds,
  normalizeSelection,
  promoteSelection,
  type ExprSelection,
} from "./selectionSemantics";
import { planMove, type MovePlan } from "./planMove";
import { applyMove, type MoveMode } from "./moveExpression/applyMove";
import type { RectLTRB } from "./rectMath";
import "./App.css";
MathfieldElement.fontsDirectory = "/fonts";

// let found2: any = null;
// let found3: any = null;

function getNodeIdsFromComposedPath(path: unknown[]): string[] {
  const ids: string[] = [];

  for (const p of path) {
    if (!(p instanceof HTMLElement)) continue;
    const id = p.dataset?.nodeId;
    if (id) ids.push(id);
  }

  return ids;
}

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

function setHighlightedText(mathDivEl: HTMLElement, nodeIds?: string[] | null) {
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

const iconButtonBaseStyle: CSSProperties = {
  width: 36,
  height: 36,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--dp-icon-border)",
  background: "var(--dp-icon-bg)",
  cursor: "pointer",
  color: "inherit",
  transition: "background-color 120ms ease, border-color 120ms ease, transform 120ms ease",
};

const iconButtonActiveStyle: CSSProperties = {
  borderColor: "var(--dp-active)",
  color: "var(--dp-active)",
  background: "rgba(124, 77, 255, 0.14)",
  boxShadow: "0 0 0 1px rgba(124, 77, 255, 0.3)",
};

const iconSpanStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "inherit",
};

type IconButtonProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  testId?: string;
};

function IconButton({ label, icon, onClick, active, testId }: IconButtonProps) {
  const btnStyle = {
    ...iconButtonBaseStyle,
    ...(active ? iconButtonActiveStyle : {}),
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      style={btnStyle}
    >
      <span style={iconSpanStyle} aria-hidden>
        {icon}
      </span>
    </button>
  );
}

export default function App() {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);

  // const [selectedId] = useState<string | null>(null);
  const [tree, setTree] = useState<ExpressionTree | null>(null);

  const [selection, setSelection] = useState<ExprSelection | null>(null);

  type DragState = null | {
    pointerId: number;
    selectedIds: string[];
  };

  const [drag, setDrag] = useState<DragState>(null);

  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
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
  const [moveMode, setMoveMode] = useState<MoveMode>("additive");
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
  const insertOverlayRef = useRef<HTMLDivElement | null>(null);
  const lastPlanRef = useRef<MovePlan | null>(null);
  const lastClickRef = useRef<{
    nodeId: string | null;
    ts: number;
    count: number;
  }>({ nodeId: null, ts: 0, count: 0 });

  // Example expressions for quick testing
  const examples = [
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

  const renderHeaderStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 4,
    flexWrap: "wrap",
  };

  const toolbarStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: 6,
    borderRadius: 12,
    border: "1px solid var(--dp-border)",
    background: "var(--dp-surface)",
    color: "var(--dp-toolbar-fg, #1f1f2a)",
  };

  useEffect(() => {
    const mf = inputRef.current;
    const latex = examples[exampleIdx] ?? examples[0];
    setExampleLatex(latex);
    if (mf) {
      mf.value = latex;
    }
  }, [exampleIdx]);

  function selectionContainsId(
    sel: ExprSelection,
    id: string,
    tree: ExpressionTree
  ) {
    if (sel.kind === "node") return sel.nodeId === id;
    const idx = tree.childIndexById[id];
    return (
      idx != null &&
      idx >= sel.start &&
      idx <= sel.end &&
      tree.parentById[id] === sel.parentId
    );
  }

  function rectForNodeId(nodeId: string): RectLTRB | null {
    const measureEl = measureRef.current;
    if (!measureEl) return null;
    const sr = getMathliveShadowRoot(measureEl);
    if (!sr) return null;

    const els = queryElementsByNodeIds(sr, [nodeId]);
    if (!els.length) return null;

    return unionBoundingClientRects(els);
  }

  function rectForVisual(nodeId: string): RectLTRB | null {
    const base = rectForNodeId(nodeId);
    const n = tree?.nodesById[nodeId];

    if (n?.op === "Negate") {
      const kids = tree?.childrenById[nodeId] ?? [];
      if (kids.length === 1) {
        const kidRect = rectForNodeId(kids[0]);
        if (kidRect) return kidRect;
      }
    }

    return base;
  }

  function describeMovePlan(plan: MovePlan | null): string {
    if (!plan) return "No move intent (planMove returned null)";

    switch (plan.kind) {
      case "ReorderAdd":
        return `Reorder ${plan.movedId} within Add ${plan.addId} from ${plan.fromIndex} to ${plan.toIndex}`;
      case "InsertIntoAdd":
        return `Insert ${plan.movedId} from Add ${plan.fromAddId}[${plan.fromIndex}] into Add ${plan.toAddId} at slot ${plan.toIndex}`;
      case "WrapIntoAddThenInsert":
        return [
          `Wrap ${plan.replaceId} (slot ${plan.replaceSlot}) under parent ${plan.replaceParentId}`,
          `then insert ${plan.movedId} from Add ${plan.fromAddId}[${
            plan.fromIndex
          }] ${plan.insertIndex === 0 ? "before" : "after"} it`,
        ].join(" — ");
      case "MoveAcrossEqual": {
        const sideLabel = (side: 0 | 1) => (side === 0 ? "LHS" : "RHS");
        if (plan.drop.kind === "intoAdd") {
          return `Move ${plan.movedId} across '=' ${sideLabel(
            plan.fromSide
          )} → ${sideLabel(plan.toSide)} into Add ${plan.drop.addId} at slot ${
            plan.drop.toIndex
          }`;
        }
        const posLabel = plan.drop.insertIndex === 0 ? "before" : "after";
        return `Move ${plan.movedId} across '=' ${sideLabel(
          plan.fromSide
        )} → ${sideLabel(plan.toSide)} by wrapping ${
          plan.drop.replaceId
        } and inserting ${posLabel}`;
      }
      default:
        return "Unknown plan";
    }
  }

  function insertXForAdd(addId: string, slot: number): number | null {
    if (!tree) return null;
    const childIds = tree.childrenById[addId] ?? [];
    if (!childIds.length) return null;

    const rects: Array<RectLTRB | null> = childIds.map((id) =>
      rectForVisual(id)
    );

    const n = childIds.length;
    const s = Math.max(0, Math.min(n, slot));

    const prevRect = (() => {
      for (let i = s - 1; i >= 0; i--) {
        if (rects[i]) return rects[i]!;
      }
      return null;
    })();

    const nextRect = (() => {
      for (let i = s; i < n; i++) {
        if (rects[i]) return rects[i]!;
      }
      return null;
    })();

    if (!prevRect && !nextRect) return null;
    if (!prevRect) return nextRect ? nextRect.left : null;
    if (!nextRect) return prevRect.right;

    // Use a midpoint between the nearest visible neighbors.
    return (prevRect.right + nextRect.left) / 2;
  }

  function computeInsertX(plan: MovePlan | null): number | null {
    if (!plan) return null;

    if (plan.kind === "ReorderAdd") {
      const childIds = tree ? tree.childrenById[plan.addId] ?? [] : [];
      const n = childIds.length;
      const slot =
        n > 0
          ? Math.max(
              0,
              Math.min(
                n,
                plan.toIndex + (plan.toIndex >= plan.fromIndex ? 1 : 0)
              )
            )
          : plan.toIndex;
      return insertXForAdd(plan.addId, slot);
    }
    if (plan.kind === "InsertIntoAdd") {
      return insertXForAdd(plan.toAddId, plan.toIndex);
    }
    if (plan.kind === "WrapIntoAddThenInsert") {
      const r = rectForNodeId(plan.replaceId);
      if (!r) return null;
      return plan.insertIndex === 0 ? r.left : r.right;
    }
    if (plan.kind === "MoveAcrossEqual") {
      if (plan.drop.kind === "intoAdd") {
        return insertXForAdd(plan.drop.addId, plan.drop.toIndex);
      }
      const r = rectForNodeId(plan.drop.replaceId);
      if (!r) return null;
      return plan.drop.insertIndex === 0 ? r.left : r.right;
    }

    return null;
  }

  function targetRectForPlan(plan: MovePlan | null): RectLTRB | null {
    if (!plan) return null;
    if (plan.kind === "ReorderAdd") return rectForNodeId(plan.addId);
    if (plan.kind === "InsertIntoAdd") return rectForNodeId(plan.toAddId);
    if (plan.kind === "WrapIntoAddThenInsert")
      return rectForNodeId(plan.replaceId);
    if (plan.kind === "MoveAcrossEqual") {
      if (plan.drop.kind === "intoAdd") return rectForNodeId(plan.drop.addId);
      return rectForNodeId(plan.drop.replaceId);
    }
    return null;
  }

  function renderInsertOverlay(plan: MovePlan | null) {
    const overlay = insertOverlayRef.current;
    const mathDivEl = displayRef.current;
    if (!overlay || !mathDivEl) return;

    overlay.replaceChildren();
    if (!plan) return;

    const hostRect = mathDivEl.getBoundingClientRect();
    const x = computeInsertX(plan);
    if (x == null) return;

    const targetRect = targetRectForPlan(plan) ?? hostRect;

    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.left = `${x - hostRect.left}px`;
    line.style.top = `${targetRect.top - hostRect.top}px`;
    line.style.width = "2px";
    line.style.height = `${targetRect.bottom - targetRect.top}px`;
    line.style.background = "rgba(124, 77, 255, 0.9)";
    line.style.pointerEvents = "none";

    overlay.appendChild(line);
  }

  function planToApplyMoveTarget(plan: MovePlan | null): {
    hoverId: string;
    targetSlot: number | null;
  } | null {
    if (!plan) return null;

    switch (plan.kind) {
      case "ReorderAdd":
        return { hoverId: plan.addId, targetSlot: plan.toIndex };
      case "InsertIntoAdd":
        return { hoverId: plan.toAddId, targetSlot: plan.toIndex };
      case "WrapIntoAddThenInsert":
        return { hoverId: plan.replaceId, targetSlot: plan.insertIndex };
      case "MoveAcrossEqual":
        if (plan.drop.kind === "intoAdd") {
          return { hoverId: plan.drop.addId, targetSlot: plan.drop.toIndex };
        }
        return {
          hoverId: plan.drop.replaceId,
          targetSlot: plan.drop.insertIndex,
        };
      default:
        return null;
    }
  }

  function clearSelection() {
    setSelection(null);
    const el = displayRef.current;
    if (el) setHighlightedText(el, []);
  }

  function applySelectionHighlight(sel: ExprSelection | null) {
    const el = displayRef.current;
    if (!el || !tree) return;

    if (!sel) {
      setHighlightedText(el, []);
      return;
    }

    if (sel.kind === "node") {
      setHighlightedText(el, getDescendantNodeIds(tree, [sel.nodeId]));
      return;
    }

    // span
    const kids = tree.childrenById[sel.parentId] ?? [];
    const ids = kids.slice(sel.start, sel.end + 1);
    setHighlightedText(el, getDescendantNodeIds(tree, ids));
  }

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

    displayRef.current.textContent = t.latexTagged;
    (displayRef.current as any).render?.();
    installShadowStyle(displayRef.current);

    const sel = opts?.selectionOverride ?? selection;
    applySelectionHighlight(sel);

    if (!opts?.preview) {
      measureRef.current.textContent = t.latexTagged;
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

  function setBaselineJson(json: MJ, opts?: { latex?: string }) {
    const t = ExpressionTree.create(json);
    setTree(t);
    renderTree(t, {
      preview: false,
      selectionOverride: null,
      clearHighlightAfterRender: true,
    });
    setInfoFromTree(t, opts?.latex);
  }

  function onAddEquation() {
    const mf = inputRef.current;
    // console.log(mf.value);
    const latex: string = mf.value;
    const expr = ce.parse(latex, { canonical: false });
    if (!expr) {
      setLatexText(latex);
      setExpressionJsonText("Parse failed. Check LaTeX input.");
      return;
    }

    const json = expr.json as MJ; // ✅ now typed
    setBaselineJson(json, { latex });
  }

  function getNodeIdsFromPointerEvent(e: React.PointerEvent): string[] {
    const ne = e.nativeEvent as PointerEvent;
    const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
    return getNodeIdsFromComposedPath(path);
  }

  function displayNodeInfo(nodeId: string | null): string {
    if (!nodeId) return "No id";
    if (!tree) return "No tree";
    if (!tree.nodesById[nodeId]) return `Node ${nodeId} not found`;
    const node = tree.nodesById[nodeId];
    return `${node.id} ${node.latex}`;
  }

  function onDisplayPointerDown(e: React.PointerEvent) {
    // debugger;
    const displayEl = displayRef.current;
    if (!displayEl) return;
    if (!tree) return;

    // Ignore clicks on the toolbar so selection is preserved
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
      return;
    }

    const ids = getNodeIdsFromPointerEvent(e);
    // Usually something like ML__mathit. Need to traverse the tree upward until we find a data-node
    const clickedId = chooseBestAllowedSelectedNode(ids, tree);

    if (!clickedId) {
      clearSelection();
      return;
    }

    // If we select b in "-b", choose the whole negation
    const normalizedId = normalizeSelection(tree, clickedId);

    // Multi-click promotion: synthesize click count manually because PointerEvent.detail
    // is often 0 in this environment. If current selection already covers the click,
    // reuse it (start drag) and do NOT reset the click counter; allow promotion on subsequent distinct clicks.
    const now = performance.now();
    const last = lastClickRef.current;
    const reuseExisting =
      selection && selectionContainsId(selection, normalizedId, tree);

    const withinWindow = last.nodeId === normalizedId && now - last.ts < 600;
    const clickCount = withinWindow ? last.count + 1 : 1;
    lastClickRef.current = { nodeId: normalizedId, ts: now, count: clickCount };

    const promotedId =
      clickCount > 1
        ? promoteSelection(tree, normalizedId, clickCount - 1)
        : normalizedId;

    // If we already have a span selection within an additive parent, honor it for drag
    let dragIds: string[] = reuseExisting
      ? selection?.kind === "span"
        ? (tree.childrenById[selection.parentId] ?? []).slice(
            selection.start,
            selection.end + 1
          )
        : [selection!.nodeId]
      : [promotedId];
    const existingSel = selection;
    let useExistingSpan = false;
    if (existingSel?.kind === "span") {
      const kids = tree.childrenById[existingSel.parentId] ?? [];
      const clickedIdx = tree.childIndexById[promotedId];
      if (
        clickedIdx != null &&
        clickedIdx >= existingSel.start &&
        clickedIdx <= existingSel.end &&
        tree.parentById[promotedId] === existingSel.parentId
      ) {
        dragIds = kids.slice(existingSel.start, existingSel.end + 1);
        useExistingSpan = true;
      }
    }

    // If the promoted node is a multiplicative container, treat the selection as its factors span.
    const promotedOp = tree.nodesById[promotedId]?.op;
    const isMulContainer =
      promotedOp === "InvisibleOperator" || promotedOp === "Multiply";
    let multiplicativeSpan: ExprSelection | null = null;
    if (
      !useExistingSpan &&
      isMulContainer &&
      tree.childrenById[promotedId]?.length
    ) {
      const kids = tree.childrenById[promotedId] ?? [];
      // Drag the whole product as a single unit (container id), while highlighting the factors.
      dragIds = [promotedId];
      multiplicativeSpan = {
        kind: "span",
        parentId: promotedId,
        op: promotedOp as "InvisibleOperator" | "Add",
        start: 0,
        end: kids.length - 1,
      };
    }

    // SHIFT+click → range selection within same Add parent
    if (e.shiftKey && selection && tree) {
      const targetParentId = tree.parentById[promotedId];
      const targetIdx = tree.childIndexById[promotedId];

      // Derive anchor from existing selection
      const anchorParentId =
        selection.kind === "node"
          ? tree.parentById[selection.nodeId]
          : selection.parentId;
      const anchorIdx =
        selection.kind === "node"
          ? tree.childIndexById[selection.nodeId]
          : selection.start;

      const parentOp = targetParentId
        ? tree.nodesById[targetParentId]?.op
        : undefined;
      const additive = parentOp === "Add" || parentOp === "InvisibleOperator";
      const sameParent =
        targetParentId && anchorParentId && targetParentId === anchorParentId;
      const valid =
        sameParent && targetIdx != null && anchorIdx != null && additive;

      if (valid) {
        const start = Math.min(anchorIdx!, targetIdx!);
        const end = Math.max(anchorIdx!, targetIdx!);
        const spanSel: ExprSelection = {
          kind: "span",
          parentId: targetParentId!,
          start,
          end,
          op: parentOp!,
        };
        setSelection(spanSel);
        applySelectionHighlight(spanSel);
        setSelectionDetailsForSpan(
          tree,
          spanSel as ExprSelection & { kind: "span" }
        );
        return;
      }
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDrag({
      pointerId: e.pointerId,
      selectedIds: dragIds,
    });
    lastPlanRef.current = null;
    setDragSlot("");

    if (useExistingSpan && existingSel?.kind === "span") {
      // Preserve the existing span selection when clicking inside it
      applySelectionHighlight(existingSel);
      setSelection(existingSel);
      setSelectionDetailsForSpan(
        tree,
        existingSel as ExprSelection & { kind: "span" }
      );
    } else if (multiplicativeSpan) {
      applySelectionHighlight(multiplicativeSpan);
      setSelection(multiplicativeSpan);
      setSelectionDetailsForSpan(
        tree,
        multiplicativeSpan as ExprSelection & { kind: "span" },
        "Multiplicative span"
      );
    } else {
      const nextSel: ExprSelection = { kind: "node", nodeId: promotedId };
      setSelection(nextSel);
      applySelectionHighlight(nextSel);
      setSelectionDetailsForNode(tree, promotedId, { clickedId });
    }

    // Logging
    const hit = tree.nodesById[normalizedId];
    if (!hit) {
      resetSelectionDetails(
        `clicked node-id: ${clickedId} (no NodeInfo found)`
      );
      return;
    }
    setDragStartInfo(`${clickedId}`);

    setSelectionDetailsForNode(tree, hit.id, {
      clickedId,
      normalizedId,
      shiftKey: e.shiftKey,
    });
  }

  function setSelectionDetailsForNode(
    tree: ExpressionTree,
    nodeId: string,
    opts?: { clickedId?: string; normalizedId?: string; shiftKey?: boolean }
  ) {
    const n = tree.nodesById[nodeId];
    setSelectionKind("node");
    setSelectionClickedId(opts?.clickedId ?? "");
    setSelectionSelectedId(n?.id ?? nodeId ?? "");
    setSelectionOp(n?.op ?? "");
    setSelectionLatexDetail(n?.latex ?? "");
    setSelectionJsonDetail(n ? JSON.stringify(n.json) : "");
    setSelectionParent(tree.parentById[nodeId] ?? "");
    setSelectionRange("");
    setSelectionChildIds("");
    setSelectionChildOps("");
    setSelectionChildLatex("");

    const notes: string[] = [];
    if (opts?.normalizedId && opts.normalizedId !== opts.clickedId) {
      notes.push(`drag-handle: ${opts.normalizedId}`);
    }
    if (opts?.shiftKey && opts.clickedId) {
      notes.push(`shift → parent ${opts.clickedId}`);
    }
    setSelectionNote(notes.join(" | "));
  }

  function setSelectionDetailsForSpan(
    tree: ExpressionTree,
    sel: ExprSelection & { kind: "span" },
    note?: string
  ) {
    const kids = tree.childrenById[sel.parentId] ?? [];
    const ids = kids.slice(sel.start, sel.end + 1);
    const ops = ids.map((id) => tree.nodesById[id]?.op ?? "?").join(", ");
    const latex = ids.map((id) => tree.nodesById[id]?.latex ?? "?").join(" | ");

    setSelectionKind("span");
    setSelectionClickedId("");
    setSelectionSelectedId("");
    setSelectionOp(sel.op ?? "");
    setSelectionLatexDetail("");
    setSelectionJsonDetail("");
    setSelectionParent(sel.parentId ?? "");
    setSelectionRange(`[${sel.start}..${sel.end}] of ${kids.length}`);
    setSelectionChildIds(ids.join(", "));
    setSelectionChildOps(ops);
    setSelectionChildLatex(latex);
    setSelectionNote(note ?? "");
  }

  function resetSelectionDetails(note?: string) {
    setSelectionKind("");
    setSelectionClickedId("");
    setSelectionSelectedId("");
    setSelectionOp("");
    setSelectionLatexDetail("");
    setSelectionJsonDetail("");
    setSelectionParent("");
    setSelectionRange("");
    setSelectionChildIds("");
    setSelectionChildOps("");
    setSelectionChildLatex("");
    setSelectionNote(note ?? "");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!displayRef.current) return;
    if (!selection) return;
    if (!tree) return;

    e.preventDefault();

    const dir = e.key === "ArrowLeft" ? "left" : "right";

    const r = expandSelection(tree, selection, dir);
    if (!r) {
      resetSelectionDetails(
        `shift+${e.key} → no expansion (not in Add/InvisibleOperator or no parent/kids)`
      );
      return;
    }

    setSelection(r.next);
    applySelectionHighlight(r.next);
    if (r.next.kind === "span") {
      setSelectionDetailsForSpan(tree, r.next, `shift+${e.key} → expanded`);
    } else {
      setSelectionDetailsForNode(tree, r.next.nodeId, {
        shiftKey: true,
      });
      setSelectionNote(`shift+${e.key} → expanded`);
    }
  }

  // Collapse multiplicative selection to container if all selected ids share the same Multiply/InvisibleOperator parent.
  function collapseMultiplicativeSelection(ids: string[]): string[] {
    if (moveMode !== "multiplicative" || ids.length <= 1 || !tree) return ids;
    const parents = ids.map((id) => tree.parentById[id]).filter(Boolean);
    const uniqueParents = Array.from(new Set(parents));
    if (uniqueParents.length === 1) {
      const parentId = uniqueParents[0]!;
      const pop = tree.nodesById[parentId]?.op;
      if (pop === "InvisibleOperator" || pop === "Multiply") {
        return [parentId];
      }
    }
    return ids;
  }

  function onDisplayPointerMove(e: React.PointerEvent) {
    if (!drag) {
      setDragStartInfo("Not dragging");
      renderInsertOverlay(null);
      return;
    }
    // console.log(drag);
    // debugger;

    if (e.pointerId !== drag.pointerId) return;
    if (!tree) return;
    const measureEl = measureRef.current;
    if (!measureEl) return;
    const hoverId = hitTestNodeIdInMathliveShadow(
      measureEl,
      e.clientX,
      e.clientY
    );

    const hover =
      hoverId && tree.nodesById[hoverId]?.op === "Equal"
        ? remapEqualHoverToSide(tree, measureEl, hoverId, e.clientX)
        : hoverId;

    setDragStartInfo(displayNodeInfo(drag.selectedIds[0] ?? null));
    setDragHoverInfo(hover ? displayNodeInfo(hover) : "No current hover");

    const effectiveSelectedIds = collapseMultiplicativeSelection(
      drag.selectedIds
    );

    const plan = planMove({
      tree,
      selectedIds: effectiveSelectedIds,
      hoverId: hover,
      pointer: { x: e.clientX, y: e.clientY },
      rectFor: rectForNodeId,
      mode: moveMode,
    });

    setMovePlanText(describeMovePlan(plan));
    setInfo3(plan ? JSON.stringify(plan, null, 2) : "planMove returned null");
    setInfoArgs(
      JSON.stringify(
        {
          selectedIds: effectiveSelectedIds,
          hoverId: hover,
          pointer: { x: e.clientX, y: e.clientY },
          mode: moveMode,
        },
        null,
        2
      )
    );
    setDragSlot(plan ? plan.kind : "");
    setParentAddId(hover ? hover : "");
    lastPlanRef.current = plan;
    renderInsertOverlay(plan);
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;

    const plan = lastPlanRef.current;
    const moveTarget = planToApplyMoveTarget(plan);

    // If the computed plan is additive-only (Reorder/Insert/Wrap into Add) AND
    // both source/target containers are actually Add nodes, allow additive fallback.
    // Otherwise, preserve the user-chosen moveMode (important for multiplicative moves).
    const planIsAdditiveKind =
      plan &&
      (plan.kind === "ReorderAdd" ||
        plan.kind === "InsertIntoAdd" ||
        plan.kind === "WrapIntoAddThenInsert");

    const containerIds: string[] = [];
    if (plan) {
      if (plan.kind === "ReorderAdd") containerIds.push(plan.addId);
      if (plan.kind === "InsertIntoAdd") {
        containerIds.push(plan.fromAddId, plan.toAddId);
      }
      if (plan.kind === "WrapIntoAddThenInsert") {
        containerIds.push(plan.replaceParentId, plan.fromAddId);
      }
      if (plan.kind === "MoveAcrossEqual" && plan.drop.kind === "intoAdd") {
        containerIds.push(plan.drop.addId);
      }
    }

    const containersAreAdd =
      planIsAdditiveKind &&
      containerIds.length > 0 &&
      containerIds.every((id) => tree?.nodesById[id]?.op === "Add");

    const selectionParentsAreAdd =
      planIsAdditiveKind &&
      drag.selectedIds.every((id) => {
        const pid = tree?.parentById[id];
        return pid ? tree?.nodesById[pid]?.op === "Add" : false;
      });

    const shouldFallbackToAdd =
      moveMode === "multiplicative" &&
      planIsAdditiveKind &&
      containersAreAdd &&
      selectionParentsAreAdd;

    const effectiveMode: MoveMode = shouldFallbackToAdd ? "additive" : moveMode;

    if (tree && plan && moveTarget) {
      const effectiveSelectedIds = collapseMultiplicativeSelection(
        drag.selectedIds
      );
      const next = applyMove({
        tree,
        selectedIds: effectiveSelectedIds,
        hoverId: moveTarget.hoverId,
        targetSlot: moveTarget.targetSlot,
        mode: effectiveMode,
      });
      if (next) {
        setTree(next);
        setSelection(null);
        renderTree(next, {
          preview: false,
          selectionOverride: null,
          clearHighlightAfterRender: true,
        });
        setInfoFromTree(next, next.latexPlain);
      } else {
        // Failed move -> keep current selection/highlight
        setInfo3(
          [
            "applyMove returned null",
            plan ? JSON.stringify(plan, null, 2) : "no plan",
          ].join("\n")
        );
        renderTree(tree, { preview: false });
      }
    } else if (tree) {
      // No plan -> keep current selection/highlight
      renderTree(tree, { preview: false });
    }

    renderInsertOverlay(null);
    setDrag(null);
    lastPlanRef.current = null;
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

      <div
        ref={renderBoxRef}
        style={{
          marginTop: 16,
          border: "1px solid var(--dp-border)",
          background: "var(--dp-surface)",
          padding: "8px 14px 14px",
          borderRadius: 10,
          cursor: drag ? "default" : "crosshair",
          userSelect: "none",
        }}
        onPointerDown={onDisplayPointerDown}
        onPointerMove={onDisplayPointerMove}
        onPointerUp={onDisplayPointerUp}
        onPointerCancel={onDisplayPointerUp}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div style={renderHeaderStyle}>
          <div aria-label="Rendered output" />
          <div style={toolbarStyle} ref={toolbarRef}>
            <IconButton
              label="Additive move mode"
              icon={
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M11 4a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"
                  />
                </svg>
              }
              onClick={() => setMoveMode("additive")}
              active={moveMode === "additive"}
              testId="mode-additive"
            />
            <IconButton
              label="Multiplicative move mode"
              icon={
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6z"
                  />
                </svg>
              }
              onClick={() => setMoveMode("multiplicative")}
              active={moveMode === "multiplicative"}
              testId="mode-multiplicative"
            />
          </div>
        </div>

        <div
          ref={mathWrapRef}
          style={{ position: "relative", display: "inline-block" }}
        >
          <MathDiv
            ref={measureRef}
            mode="displaystyle"
            className="math-measure"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              pointerEvents: "none",
              fontSize: "1.2rem",
            }}
          />
          <div style={{ position: "relative" }}>
            <MathDiv
              ref={displayRef}
              mode="displaystyle"
              className="math-display"
              data-testid="math-display"
              style={{ fontSize: "1.2rem" }}
            />
            {/* Insert marker overlay */}
            <div
              ref={insertOverlayRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
                zIndex: 9998,
              }}
            />
            {/* Debug overlay */}
            <div
              ref={debugOverlayRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
                zIndex: 9999,
              }}
            />
          </div>
        </div>
      </div>

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
            <input
              style={inputStyle}
              readOnly
              value={selectionKind || "—"}
            />
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
            <input
              style={inputStyle}
              readOnly
              value={selectionOp || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Parent</label>
            <input
              style={inputStyle}
              readOnly
              value={selectionParent || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Range / span</label>
            <input
              style={inputStyle}
              readOnly
              value={selectionRange || "—"}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child ids</label>
            <div style={readonlyBoxStyle}>
              {selectionChildIds || "—"}
            </div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child ops</label>
            <div style={readonlyBoxStyle}>
              {selectionChildOps || "—"}
            </div>
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Child latex</label>
            <div style={readonlyBoxStyle}>
              {selectionChildLatex || "—"}
            </div>
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
            <div style={readonlyBoxStyle}>
              {selectionJsonDetail || "—"}
            </div>
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
            <input
              style={inputStyle}
              readOnly
              value={dragStartInfo}
            />
          </div>
          <div style={fieldHalfStyle}>
            <label style={labelStyle}>Hover drag</label>
            <input
              style={inputStyle}
              readOnly
              value={dragHoverInfo}
            />
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
    </div>
  );
}
