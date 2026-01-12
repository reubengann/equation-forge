import "@cortex-js/compute-engine";
import { ComputeEngine } from "@cortex-js/compute-engine";
import "mathlive";
import { MathfieldElement } from "mathlive";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExpressionTree, type MJ } from "./ExpressionTree";
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
  type ExprSelection,
} from "./selectionSemantics";
import { planMove, type MovePlan } from "./planMove";
import type { RectLTRB } from "./rectMath";

const ce = new ComputeEngine();
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
  const [info, setInfo] = useState<string>(
    "Type an equation, click Add / Update. Then click parts of the rendered equation."
  );
  const [info2, setInfo2] = useState<string>("");

  const [dragStartInfo, setDragStartInfo] = useState<string>("");
  const [dragHoverInfo, setDragHoverInfo] = useState<string>("");
  const [dragSlot, setDragSlot] = useState<string>("");
  const [parentAddId, setParentAddId] = useState<string>("");
  const [debugBoxes, setDebugBoxes] = useState(false);
  const insertOverlayRef = useRef<HTMLDivElement | null>(null);

  function rectForNodeId(nodeId: string): RectLTRB | null {
    const measureEl = measureRef.current;
    if (!measureEl) return null;
    const sr = getMathliveShadowRoot(measureEl);
    if (!sr) return null;

    const els = queryElementsByNodeIds(sr, [nodeId]);
    if (!els.length) return null;

    return unionBoundingClientRects(els);
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
      rectForNodeId(id)
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
      return insertXForAdd(plan.addId, plan.toIndex);
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
    renderTree(t, { preview: false });
  }

  function onAddEquation() {
    const mf = inputRef.current;
    // console.log(mf.value);
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

    const ids = getNodeIdsFromPointerEvent(e);
    // Usually something like ML__mathit. Need to traverse the tree upward until we find a data-node
    const clickedId = chooseBestAllowedSelectedNode(ids, tree);

    if (!clickedId) {
      clearSelection();
      return;
    }

    // If we select b in "-b", choose the whole negation
    const normalizedId = normalizeSelection(tree, clickedId);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDrag({
      pointerId: e.pointerId,
      selectedIds: [normalizedId],
    });
    setDragSlot("");

    const nextSel: ExprSelection = { kind: "node", nodeId: normalizedId };
    setSelection(nextSel);
    applySelectionHighlight(nextSel);

    // Logging
    const hit = tree.nodesById[normalizedId];
    if (!hit) {
      setInfo2(`\n\nclicked node-id: ${clickedId}\n(no NodeInfo found)`);
      return;
    }
    setDragStartInfo(`${clickedId}`);

    setInfo2(
      [
        "",
        `clicked node-id: ${clickedId}` +
          (normalizedId !== clickedId
            ? ` (drag-handle: ${normalizedId})`
            : "") +
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

    const plan = planMove({
      tree,
      selectedIds: drag.selectedIds,
      hoverId: hover,
      pointer: { x: e.clientX, y: e.clientY },
      rectFor: rectForNodeId,
    });

    setInfo2(describeMovePlan(plan));
    setDragSlot(plan ? plan.kind : "");
    setParentAddId(hover ? hover : "");
    renderInsertOverlay(plan);
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;

    if (tree) renderTree(tree, { preview: false });
    renderInsertOverlay(null);
    setDrag(null);
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

  const defaultString = String.raw`\frac{a+b}{2}+c+d=e-f`;
  // const defaultString = String.raw`a=b`;

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
            {defaultString}
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
              fontSize: "1.2rem",
            }}
          />
          <div style={{ position: "relative" }}>
            <MathDiv
              ref={displayRef}
              mode="displaystyle"
              className="math-display"
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

      <textarea
        readOnly
        value={info}
        style={{
          marginTop: 16,
          width: "100%",
          height: 300,
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
          height: 200,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
        }}
      />

      <p>Previous hover target: {dragStartInfo}</p>
      <p>Hover Drag: {dragHoverInfo}</p>
      <p>Drag slot: {dragSlot}</p>
      <p>Parent Add: {parentAddId}</p>
    </div>
  );
}
