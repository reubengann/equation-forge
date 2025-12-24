import "@cortex-js/compute-engine";
import { ComputeEngine } from "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import { useMemo, useRef, useState } from "react";
import { ExpressionTree, type MJ, type NodeInfo } from "./ExpressionTree";
import {
  computeOverlayRectForNodeIds,
  getChildRectsInShadow,
  getMathliveShadowRoot,
} from "./mathliveShadow";
import { computeDestinationIndex, reorderAddAtPath } from "./movePath";
import { pickInsertSlot } from "./rectMath";
import {
  expandSelection,
  getDescendantNodeIds,
  normalizeSelection,
  type ExprSelection,
} from "./selectionSemantics";

const ce = new ComputeEngine();
MathfieldElement.fontsDirectory = "/fonts";

function findBestNodeIdFromComposedPath(
  path: unknown[],
  nodesById: Record<string, NodeInfo>
): string | null {
  // debugger;
  const disallowOnPlainClick = new Set(["Add", "Multiply", "Equal"]);

  // Walk up the mathjson tree from deepest to shallowest.
  // Prefer the first tagged node whose op is NOT disallowed.
  let firstTagged: string | null = null;

  for (const p of path) {
    if (!(p instanceof Element)) continue;
    const h = p as HTMLElement;
    const nodeId = h.dataset?.nodeId;
    if (!nodeId) continue;

    if (!firstTagged) firstTagged = nodeId;

    const info = nodesById[nodeId];
    if (!info) continue;

    if (!disallowOnPlainClick.has(info.op)) {
      return nodeId; // ✅ pick a term-like node
    }
  }

  // If the only thing we found was a container (like Add), treat it as "no selection"
  return null;
}

/**
 * Inject CSS into the shadowRoot of a MathLive <math-div>.
 *
 * MathLive renders into shadow DOM, so global CSS won't reach it.
 * We add a small style tag once per <math-div> instance to support:
 *   - .dp-selected  (selection outline)
 *   - .dp-faded     (preview fade)
 *   - .dp-dragging  (drag outline)
 *
 * Safe to call repeatedly; it no-ops if the style is already installed.
 *
 * @param mathDivEl The <math-div> element hosting MathLive's shadow DOM
 */
function installShadowStyle(mathDivEl: HTMLElement) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  // Avoid duplicating style
  if (sr.querySelector("style[data-derivation-pad]")) return;

  const style = document.createElement("style");
  style.setAttribute("data-derivation-pad", "1");
  style.textContent = `
    .dp-selected { outline: 2px solid #ff9800; outline-offset: 2px; border-radius: 3px; }
  .dp-faded { opacity: 0.25; }
  .dp-dragging { outline: 2px solid #7c4dff; outline-offset: 2px; border-radius: 3px; }
  `;
  sr.appendChild(style);
}

/**
 * Apply/remove selection highlighting inside a MathLive <math-div> shadowRoot.
 *
 * Because the same node-id can appear multiple times in the rendered DOM
 * (rare now, but possible later), we highlight *all* elements with the given
 * data-node-id.
 *
 * @param mathDivEl The display <math-div>
 * @param nodeId Node id to highlight, or null to clear highlight
 */
function setShadowHighlight(mathDivEl: HTMLElement, nodeId: string | null) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  sr.querySelectorAll(".dp-selected").forEach((el) =>
    el.classList.remove("dp-selected")
  );
  if (!nodeId) return;

  // Highlight all occurrences of the same node-id
  sr.querySelectorAll<HTMLElement>(
    `[data-node-id="${CSS.escape(nodeId)}"]`
  ).forEach((el) => el.classList.add("dp-selected"));
}

export default function App() {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);

  const [selectedId] = useState<string | null>(null);
  const [tree, setTree] = useState<ExpressionTree | null>(null);
  const [previewTree, setPreviewTree] = useState<ExpressionTree | null>(null);

  const [selection, setSelection] = useState<ExprSelection | null>(null);

  type DragState = null | {
    kind: "reorder-add";
    isActive: boolean;
    pointerId: number;
    addParentId: string;
    addPath: number[];
    baselineChildIds: string[];
    draggedChildId: string;
    fromIndex: number;
    toIndex: number;
  };

  const [drag, setDrag] = useState<DragState>(null);

  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);
  const [info, setInfo] = useState<string>(
    "Type an equation, click Add / Update. Then click parts of the rendered equation."
  );
  const [info2, setInfo2] = useState<string>("");

  const [overlayRect, setOverlayRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  function clearSelection() {
    setSelection(null);
    setOverlayRect(null);
  }

  function renderTree(t: ExpressionTree, opts?: { preview: boolean }) {
    if (!displayRef.current) return;
    if (!measureRef.current) return;

    // Always update DISPLAY
    displayRef.current.textContent = t.latexTagged;
    (displayRef.current as any).render?.();
    installShadowStyle(displayRef.current);
    setShadowHighlight(displayRef.current, null);

    // Only update MEASURE when not previewing
    if (!opts?.preview) {
      measureRef.current.textContent = t.latexTagged;
      (measureRef.current as any).render?.();
    }
  }

  function setBaselineJson(json: MJ) {
    const t = ExpressionTree.create(json);
    setTree(t);
    setPreviewTree(null);
    renderTree(t, { preview: false });
  }

  /**
   * Parse the current MathLive <math-field> input and render it into the display.
   *
   * Uses the Compute Engine parse() with `{ canonical: false }` so the term order
   * reflects the user's input (no canonical reordering of commutative Add).
   *
   * Side effects:
   * - Updates `currentJson` (the "source of truth" MathJSON)
   * - Calls renderFromMathJson(json, { preview:false })
   * - Updates the debug textarea with the LaTeX and MathJSON
   */
  function onAddEquation() {
    const mf = inputRef.current;
    console.log(mf.value);
    const latex: string = mf.value;
    const expr = ce.parse(latex, { canonical: false });
    if (!expr) {
      setInfo(`Parse failed. latex=${latex}`);
      return;
    }

    const json = expr.json as MJ; // ✅ now typed
    // debugger
    setInfo(
      [
        `mf.value (LaTeX): ${latex}`,
        "",
        "mf.expression.json:",
        JSON.stringify(json, null, 2),
      ].join("\n")
    );
    setBaselineJson(json);
  }

  /**
   * Pointer down handler on the rendered equation.
   *
   * Responsibilities:
   * 1) Hit-test the clicked DOM element (via composedPath + data-node-id tags)
   * 2) Update selection state + overlay rectangle
   * 3) If the click hits a child term inside an Add container, begin a drag-reorder
   *    gesture by setting DragState and capturing the pointer.
   *
   * Notes:
   * - Dragging is currently enabled only for terms whose parent op is "Add".
   * - Selection and dragging are currently started from the same pointerdown;
   *   you may later separate "click to select" vs "drag to reorder".
   */
  function onDisplayPointerDown(e: React.PointerEvent) {
    const displayEl = displayRef.current;
    if (!displayEl) return;
    if (!tree) return;

    const ne = e.nativeEvent as PointerEvent;
    const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
    const clickedId = findBestNodeIdFromComposedPath(path, tree.nodesById);

    if (!clickedId) {
      clearSelection();
      return;
    }

    const draggedId = normalizeSelection(tree, clickedId);

    const pId = tree.parentById[draggedId];
    if (!pId) return;
    const pInfo = pId ? tree.nodesById[pId] : null;
    const idx = tree.childIndexById[draggedId];
    const addPath = tree.pathById[pId]; // parentId is the Add node id
    if (!addPath) return;
    const baselineChildIds = tree.childrenById[pId] ?? [];
    if (baselineChildIds.length < 2) return;
    setPreviewTree(null);

    if (pId && pInfo?.op === "Add" && idx !== undefined) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      setDrag({
        kind: "reorder-add",
        isActive: true,
        pointerId: e.pointerId,

        addParentId: pId,
        addPath,
        baselineChildIds,

        draggedChildId: draggedId,
        fromIndex: idx,
        toIndex: idx,
      });
    }

    // If shift is held, expand from the *current* selection if there is one;
    // otherwise expand from the clicked node.
    const baseId = e.shiftKey && selectedId ? selectedId : draggedId;
    const nextSelectedId = e.shiftKey
      ? tree.parentById[baseId] ?? baseId
      : draggedId;

    setSelection({ kind: "node", nodeId: nextSelectedId });

    // Overlay the thing that is guaranteed to be rendered.
    // If nextSelectedId is a unary wrapper like Negate, overlay its child (e.g. "b").
    const overlayId =
      tree.nodesById[nextSelectedId]?.op === "Negate"
        ? tree.childrenById[nextSelectedId]?.[0] ?? nextSelectedId
        : nextSelectedId;

    setOverlayForNodeIds([overlayId]);

    const hit = tree.nodesById[nextSelectedId];
    if (!hit) {
      setInfo2(`\n\nclicked node-id: ${selectedId}\n(no NodeInfo found)`);
      return;
    }

    setInfo2(
      [
        "",
        `clicked node-id: ${clickedId}` +
          (draggedId !== clickedId ? ` (drag-handle: ${draggedId})` : "") +
          (e.shiftKey ? ` (shift → parent ${selectedId})` : ""),
        `selected node-id: ${hit.id}`,
        `node op: ${hit.op}`,
        `latex (this node): ${hit.latex}`,
        `mathjson (this node): ${JSON.stringify(hit.json)}`,
      ].join("\n")
    );
  }

  /**
   * Keyboard handler for span expansion.
   *
   * Current behavior:
   * - Holding SHIFT + ArrowLeft/ArrowRight expands selection inside an Add/Multiply
   *   container by extending the span boundaries.
   *
   * It supports two selection modes:
   * - { kind:"node" }  a single node-id
   * - { kind:"span" }  a contiguous range of child indices within a parent container
   *
   * Side effects:
   * - Updates `selection`
   * - Updates overlay rectangle to cover the selected child node IDs
   */

  function selectionDebugText(
    tree: ExpressionTree,
    sel: ExprSelection
  ): string {
    if (sel.kind === "node") {
      const n = tree.nodesById[sel.nodeId];
      if (!n) return `selection: node ${sel.nodeId} (missing NodeInfo)`;

      return [
        "KEYBOARD SELECTION",
        `kind: node`,
        `nodeId: ${sel.nodeId}`,
        `op: ${n.op}`,
        `latex: ${n.latex}`,
        `parent: ${tree.parentById[sel.nodeId] ?? "(none)"}`,
      ].join("\n");
    }

    const kids = tree.childrenById[sel.parentId] ?? [];
    const ids = kids.slice(sel.start, sel.end + 1);
    const ops = ids.map((id) => tree.nodesById[id]?.op ?? "?").join(", ");
    const latex = ids.map((id) => tree.nodesById[id]?.latex ?? "?").join(" | ");

    return [
      "KEYBOARD SELECTION",
      `kind: span`,
      `parentId: ${sel.parentId}`,
      `parentOp: ${sel.op}`,
      `range: [${sel.start}..${sel.end}] of ${kids.length}`,
      `childIds: ${ids.join(", ")}`,
      `childOps: ${ops}`,
      `childLatex: ${latex}`,
    ].join("\n");
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
      setInfo2(
        [
          "",
          "KEYBOARD SELECTION",
          `shift+${e.key} → no expansion (not in Add/InvisibleOperator or no parent/kids)`,
          selectionDebugText(tree, selection),
        ].join("\n")
      );
      return;
    }

    setSelection(r.next);
    setOverlayForNodeIds(r.nodeIdsToOverlay);
    setInfo2(
      [
        "",
        "KEYBOARD SELECTION",
        `shift+${e.key} → expanded`,
        "",
        "BEFORE:",
        selectionDebugText(tree, selection),
        "",
        "AFTER:",
        selectionDebugText(tree, r.next),
        "",
        `overlay nodeIds: ${r.nodeIdsToOverlay.join(", ")}`,
      ].join("\n")
    );
  }

  function setOverlayForNodeIds(nodeIds: string[]) {
    const mathDivEl = displayRef.current;
    const boxEl = mathWrapRef.current;
    if (!mathDivEl || !boxEl) return;
    if (!tree) return;

    const idsForMeasure = getDescendantNodeIds(tree, nodeIds);

    const r = computeOverlayRectForNodeIds({
      mathDivEl,
      containerEl: boxEl,
      nodeIds: idsForMeasure,
      padX: 8,
      padY: 3,
    });

    if (!r) return;
    setOverlayRect(r);
  }

  /*
    Dragging functionality: Here we determine if there is a valid reorder or move operation possible.
    Right now this is only within a sum.
    Then we determine if the cursor is over a valid slot to insert into that is different from
    where it originally was. Then we re-render the mathlive with the preview.
    Later, if the mouse is released, we will commit this change
 */
  function onDisplayPointerMove(e: React.PointerEvent) {
    if (!drag?.isActive) return;
    if (e.pointerId !== drag.pointerId) return;
    if (!tree) return;

    const measureEl = measureRef.current;
    if (!measureEl) return;

    const kids = tree.childrenById[drag.addParentId] ?? [];
    if (kids.length < 2) return;

    const rects = getChildRectsInShadow(measureEl, kids);
    if (rects.length === 0) return;

    const hoveredSlot = pickInsertSlot(
      rects.map((r) => r.rect), // RectLTRB[]
      e.clientX,
      20 // marginPx (use 5 if you want it tighter like your test)
    );

    if (hoveredSlot == null) {
      // "no target": don't update preview/toIndex
      return;
    }
    let toIndex = computeDestinationIndex(hoveredSlot, drag.fromIndex);
    toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));
    console.log(toIndex);
    if (toIndex === drag.toIndex) {
      return;
    }

    const nextDrag = { ...drag, toIndex };
    setDrag(nextDrag);

    const baselineJson = tree.rootJson;
    // ✅ build previewJson and render it
    const nextPreviewJson = reorderAddAtPath(
      baselineJson,
      drag.addPath,
      drag.fromIndex,
      toIndex
    );
    const pt = ExpressionTree.create(nextPreviewJson);
    setPreviewTree(pt);

    // preview=true means "don't update MEASURE"
    renderTree(pt, { preview: true });
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    if (!drag?.isActive) return;
    if (e.pointerId !== drag.pointerId) return;

    if (previewTree) {
      setTree(previewTree);
      setPreviewTree(null);
      renderTree(previewTree, { preview: false });
    } else if (tree) {
      renderTree(tree, { preview: false });
    }

    setDrag(null);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h2>Derivation Pad — Confirm Selection</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <MathField
            ref={inputRef}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            {String.raw`\frac{a+b}{2}+c+d=e+f`}
          </MathField>
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
        >
          Add / Update
        </button>
      </div>

      <div
        ref={renderBoxRef}
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          padding: 14,
          borderRadius: 10,
          cursor: "crosshair",
          userSelect: "none",
        }}
        onPointerDown={onDisplayPointerDown}
        onPointerMove={onDisplayPointerMove}
        onPointerUp={onDisplayPointerUp}
        onPointerCancel={onDisplayPointerUp}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.8 }}>
          Rendered (tagged from MathJSON) — click to inspect + highlight
        </div>

        <div
          ref={mathWrapRef}
          style={{ position: "relative", display: "inline-block" }}
        >
          {/* measurement math-div: invisible but still laid out */}
          <MathDiv
            ref={measureRef}
            mode="displaystyle"
            className="math-measure"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
          />

          {/* display math-div: what the user sees */}
          <MathDiv
            ref={displayRef}
            mode="displaystyle"
            className="math-display"
          />

          {overlayRect && (
            <div
              style={{
                position: "absolute",
                left: overlayRect.left,
                top: overlayRect.top,
                width: overlayRect.width,
                height: overlayRect.height,
                border: "2px solid #ff9800",
                borderRadius: 6,
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            />
          )}
        </div>
      </div>

      <textarea
        readOnly
        value={info}
        style={{
          marginTop: 16,
          width: "100%",
          height: 360,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
        }}
      />

      <textarea
        readOnly
        value={info2}
        style={{
          marginTop: 16,
          width: "100%",
          height: 360,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
        }}
      />
    </div>
  );
}
