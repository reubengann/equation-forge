import "@cortex-js/compute-engine";
import { ComputeEngine } from "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import { useMemo, useRef, useState } from "react";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { getChildRectsInShadow, getMathliveShadowRoot } from "./mathliveShadow";
import { computeDestinationIndex, reorderAddAtPath } from "./movePath";
import { pickInsertSlot } from "./rectMath";
import {
  chooseBestAllowedSelectedNode,
  expandSelection,
  getDescendantNodeIds,
  normalizeSelection,
  type ExprSelection,
} from "./selectionSemantics";

const ce = new ComputeEngine();
MathfieldElement.fontsDirectory = "/fonts";

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

export default function App() {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);

  // const [selectedId] = useState<string | null>(null);
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

  function renderTree(t: ExpressionTree, opts?: { preview: boolean }) {
    if (!displayRef.current) return;
    if (!measureRef.current) return;

    displayRef.current.textContent = t.latexTagged;
    (displayRef.current as any).render?.();
    installShadowStyle(displayRef.current);

    applySelectionHighlight(selection);

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

  function onDisplayPointerDown(e: React.PointerEvent) {
    const displayEl = displayRef.current;
    if (!displayEl) return;
    if (!tree) return;

    const ne = e.nativeEvent as PointerEvent;
    const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
    const ids = getNodeIdsFromComposedPath(path);
    const clickedId = chooseBestAllowedSelectedNode(ids, tree);

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

    const nextSelectedId = e.shiftKey
      ? tree.parentById[clickedId] ?? clickedId
      : draggedId;

    setSelection({ kind: "node", nodeId: nextSelectedId });

    const nextSel: ExprSelection = { kind: "node", nodeId: nextSelectedId };
    setSelection(nextSel);
    applySelectionHighlight(nextSel);

    const hit = tree.nodesById[nextSelectedId];
    if (!hit) {
      setInfo2(`\n\nclicked node-id: ${clickedId}\n(no NodeInfo found)`);
      return;
    }

    setInfo2(
      [
        "",
        `clicked node-id: ${clickedId}` +
          (draggedId !== clickedId ? ` (drag-handle: ${draggedId})` : "") +
          (e.shiftKey ? ` (shift → parent ${clickedId})` : ""),
        `selected node-id: ${hit.id}`,
        `node op: ${hit.op}`,
        `latex (this node): ${hit.latex}`,
        `mathjson (this node): ${JSON.stringify(hit.json)}`,
      ].join("\n")
    );
  }

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
    applySelectionHighlight(r.next);
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

          <MathDiv
            ref={displayRef}
            mode="displaystyle"
            className="math-display"
            style={{ fontSize: "1.2rem" }}
          />
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
