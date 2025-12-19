import { useMemo, useRef, useState } from "react";
import "mathlive";
import "@cortex-js/compute-engine";
import { MathfieldElement } from "mathlive";
MathfieldElement.fontsDirectory = "/fonts";

type MJ = any;

type NodeInfo = {
  id: string;
  op: string;          // "Symbol" | "Number" | "Add" | ...
  latex: string;       // LaTeX for exactly this subtree (UNtagged)
  json: MJ;            // MathJSON subtree
};

type TaggedRender = {
  latexTagged: string;
  nodes: Record<string, NodeInfo>;
  parentById: Record<string, string | null>;
  childrenById: Record<string, string[]>;        // for Add/Multiply nodes
  childIndexById: Record<string, number>;        // for any node that is a child of Add/Multiply
};

type AddPreview =
  | null
  | { addId: string; draggedChildId: string; fromIndex: number; toIndex: number };

function makeTaggedLatexFromMathJson(mj: MJ, addPreview?: AddPreview): TaggedRender {
  let nextId = 1;
  const newId = () => `n${nextId++}`;
  const childrenById: Record<string, string[]> = {};
  const childIndexById: Record<string, number> = {};

  const nodes: Record<string, NodeInfo> = {};
  const parentById: Record<string, string | null> = {};

  const wrap = (id: string, contentLatex: string) =>
    String.raw`\htmlData{node-id=${id}}{${contentLatex}}`;

  const prec: Record<string, number> = {
    Equal: 0,
    Add: 10,
    Multiply: 20,
    Negate: 30,
    Power: 40,
    Symbol: 100,
    Number: 100,
  };

  const opOf = (node: MJ): string => {
    if (Array.isArray(node)) return String(node[0]);
    if (typeof node === "string") return "Symbol";
    if (typeof node === "number") return "Number";
    return "Unknown";
  };

  const needsParens = (node: MJ, parentOp: string | null) => {
    if (!Array.isArray(node) || !parentOp) return false;
    const op = String(node[0]);
    return (prec[op] ?? 999) < (prec[parentOp] ?? 999);
  };

  // NOTE: parentId is the ID of the AST node containing this node
  const emit = (
    node: MJ,
    parentOp: string | null,
    parentId: string | null
  ): { id: string; latexTagged: string; latexPlain: string } => {
    // console.log("emit", node, parentOp, parentId);
    const id = newId();
    parentById[id] = parentId;

    const op = opOf(node);

    // Leaf: symbol
    if (typeof node === "string") {
      nodes[id] = { id, op, latex: node, json: node };
      return { id, latexTagged: wrap(id, node), latexPlain: node };
    }

    // Leaf: number
    if (typeof node === "number") {
      const plain = String(node);
      nodes[id] = { id, op, latex: plain, json: node };
      return { id, latexTagged: wrap(id, plain), latexPlain: plain };
    }

    // Composite
    if (Array.isArray(node)) {
      // console.log("isarray");
      const op = String(node[0]);

      if (op === "Equal") {
        // ✅ children get THIS node's id as their parent
        const L = emit(node[1], "Equal", id);
        const R = emit(node[2], "Equal", id);

        const plain = `${L.latexPlain} = ${R.latexPlain}`;
        const tagged = `${L.latexTagged} = ${R.latexTagged}`;

        nodes[id] = { id, op, latex: plain, json: node };
        return { id, latexTagged: wrap(id, tagged), latexPlain: plain };
      }

      if (op === "Add") {
        let children = node.slice(1).map((c: MJ) => emit(c, "Add", id)); // ✅ parent=id

        // record the order
        childrenById[id] = children.map(ch => ch.id);
        childrenById[id].forEach((cid, idx) => (childIndexById[cid] = idx));

        // let displayParts = children.map((c) => ({ id: c.id, latexTagged: c.latexTagged, latexPlain: c.latexPlain }));

        console.log(addPreview);
        if (addPreview && addPreview.addId === id) {
          const { fromIndex, toIndex } = addPreview;
          if (fromIndex !== toIndex && fromIndex >= 0 && fromIndex < children.length) {
            // console.log("reorder", fromIndex, toIndex);
            const moved = children[fromIndex];
            const rest = children.filter((_, i) => i !== fromIndex);

            const ins = Math.max(0, Math.min(rest.length, toIndex));
            const reordered = [...rest.slice(0, ins), moved, ...rest.slice(ins)];

            children = reordered;
          }
        }


        const plain = children.map((c) => c.latexPlain).join(" + ");
        const tagged = children.map((c) => c.latexTagged).join(String.raw` + `);

        const bodyPlain = needsParens(node, parentOp) ? String.raw`\left(${plain}\right)` : plain;
        const bodyTagged = needsParens(node, parentOp) ? String.raw`\left(${tagged}\right)` : tagged;

        nodes[id] = { id, op, latex: bodyPlain, json: node };
        return { id, latexTagged: wrap(id, bodyTagged), latexPlain: bodyPlain };
      }

      if (op === "Multiply") {
        const children = node.slice(1).map((c: MJ) => emit(c, "Multiply", id)); // ✅ parent=id
        // record the order
        childrenById[id] = children.map(ch => ch.id);
        childrenById[id].forEach((cid, idx) => (childIndexById[cid] = idx));

        const plain = children.map((c) => c.latexPlain).join(String.raw`\,`);
        const tagged = children.map((c) => c.latexTagged).join(String.raw`\,`);

        const bodyPlain = needsParens(node, parentOp) ? String.raw`\left(${plain}\right)` : plain;
        const bodyTagged = needsParens(node, parentOp) ? String.raw`\left(${tagged}\right)` : tagged;

        nodes[id] = { id, op, latex: bodyPlain, json: node };
        return { id, latexTagged: wrap(id, bodyTagged), latexPlain: bodyPlain };
      }

      if (op === "Negate") {
        const child = emit(node[1], "Negate", id); // ✅ parent=id

        const plain = `-${child.latexPlain}`;
        const tagged = `-${child.latexTagged}`;

        const bodyPlain = needsParens(node, parentOp) ? String.raw`\left(${plain}\right)` : plain;
        const bodyTagged = needsParens(node, parentOp) ? String.raw`\left(${tagged}\right)` : tagged;

        nodes[id] = { id, op, latex: bodyPlain, json: node };
        return { id, latexTagged: wrap(id, bodyTagged), latexPlain: bodyPlain };
      }

      // Fallback
      const plain = String.raw`\operatorname{${op}}\left(\dots\right)`;
      nodes[id] = { id, op, latex: plain, json: node };
      return { id, latexTagged: wrap(id, plain), latexPlain: plain };
    }

    const plain = String.raw`\text{?}`;
    nodes[id] = { id, op: "Unknown", latex: plain, json: node };
    return { id, latexTagged: wrap(id, plain), latexPlain: plain };
  };

  const top = emit(mj, null, null);
  return { latexTagged: top.latexTagged, nodes, parentById, childrenById, childIndexById };
}


// function findNodeIdFromComposedPath(path: unknown[]): string | null {
//   for (const p of path) {
//     if (!(p instanceof Element)) continue;
//     const h = p as HTMLElement;
//     const nodeId = h.dataset?.nodeId;
//     if (nodeId) return nodeId;
//   }
//   return null;
// }

function findBestNodeIdFromComposedPath(
  path: unknown[],
  nodesById: Record<string, NodeInfo>,
): string | null {
  // Operators we do NOT want to select by clicking on their glyphs.
  const disallowOnPlainClick = new Set(["Add", "Multiply", "Equal"]);

  // Walk from deepest to shallowest.
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


function installShadowStyle(mathDivEl: HTMLElement) {
  const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
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

function setShadowHighlight(mathDivEl: HTMLElement, nodeId: string | null) {
  const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
  if (!sr) return;

  sr.querySelectorAll(".dp-selected").forEach(el => el.classList.remove("dp-selected"));
  if (!nodeId) return;

  // Highlight all occurrences of the same node-id
  sr.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)
    .forEach(el => el.classList.add("dp-selected"));
}

export default function App() {
  const MathDiv = useMemo(() => "math-div" as any, []);
  const MathField = useMemo(() => "math-field" as any, []);
  const [parentById, setParentById] = useState<Record<string, string | null>>({});
  const [selectedId] = useState<string | null>(null);
  const [currentJson, setCurrentJson] = useState<MJ | null>(null);
  type ExprSelection =
    | { kind: "node"; nodeId: string }
    | { kind: "span"; parentId: string; op: "Add" | "Multiply"; start: number; end: number };

  const [selection, setSelection] = useState<ExprSelection | null>(null);

  type DragState =
    | null
    | {
      kind: "reorder-add";
      addParentId: string;
      draggedChildId: string;
      fromIndex: number;
      toIndex: number;
      pointerId: number;
      isActive: boolean;
    };


  const [drag, setDrag] = useState<DragState>(null);

  const [childrenById, setChildrenById] = useState<Record<string, string[]>>({});
  const [childIndexById, setChildIndexById] = useState<Record<string, number>>({});
  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);


  const [overlayRect, setOverlayRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const [nodesById, setNodesById] = useState<Record<string, NodeInfo>>({});
  const [info, setInfo] = useState<string>("Type an equation, click Add / Update. Then click parts of the rendered equation.");

  function clearSelection() {
    setSelection(null);
    setOverlayRect(null);
  }


  function renderFromMathJson(json: MJ, opts?: { preview: boolean, previewOverride?: { addId: string; draggedChildId: string; fromIndex: number; toIndex: number } }) {
    if (!displayRef.current) return;
    if (!measureRef.current) return;

    const preview: AddPreview =
      opts?.preview
        ? (opts.previewOverride ??
          (drag?.kind === "reorder-add" && drag.isActive
            ? { addId: drag.addParentId, draggedChildId: drag.draggedChildId, fromIndex: drag.fromIndex, toIndex: drag.toIndex }
            : null))
        : null;
    const rendered = makeTaggedLatexFromMathJson(json, preview);

    setNodesById(rendered.nodes);
    setParentById(rendered.parentById);
    setChildrenById(rendered.childrenById);
    setChildIndexById(rendered.childIndexById);

    // Always update the DISPLAY
    displayRef.current.textContent = rendered.latexTagged;
    (displayRef.current as any).render?.();
    installShadowStyle(displayRef.current);
    setShadowHighlight(displayRef.current, null);

    // Only update MEASURE when not previewing
    if (!opts?.preview) {
      measureRef.current.textContent = rendered.latexTagged;
      (measureRef.current as any).render?.();
      // no need for highlight CSS on measure
    }
  }

  function onAddEquation() {
    const mf = inputRef.current;
    const latex = String(mf?.value ?? "").trim();

    const json = mf?.expression?.json;
    if (!json) {
      setInfo(`No mf.expression.json (Compute Engine not loaded?). mf.value=${latex}`);
      return;
    }
    setCurrentJson(json);
    renderFromMathJson(json, { preview: false });

    setInfo(
      [
        `mf.value (LaTeX): ${latex}`,
        "",
        "mf.expression.json:",
        JSON.stringify(json, null, 2),
        "",
        "Now click the rendered equation below.",
      ].join("\n")
    );
  }

  function onDisplayPointerDown(e: React.PointerEvent) {
    const displayEl = displayRef.current;
    if (!displayEl) return;

    const ne = e.nativeEvent as PointerEvent;
    const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
    const clickedId = findBestNodeIdFromComposedPath(path, nodesById);

    if (!clickedId) {
      clearSelection();
      return;
    }

    const pId = parentById[clickedId];
    const pInfo = pId ? nodesById[pId] : null;
    const idx = childIndexById[clickedId];

    if (pId && pInfo?.op === "Add" && idx !== undefined) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      setDrag({
        kind: "reorder-add",
        addParentId: pId,
        draggedChildId: clickedId,
        fromIndex: idx,
        toIndex: idx,
        pointerId: e.pointerId,
        isActive: true,
      });
    }

    // If shift is held, expand from the *current* selection if there is one;
    // otherwise expand from the clicked node.
    const baseId = e.shiftKey && selectedId ? selectedId : clickedId;
    const nextSelectedId = e.shiftKey ? (parentById[baseId] ?? baseId) : clickedId;

    setSelection({ kind: "node", nodeId: nextSelectedId });
    setOverlayForNodeIds([nextSelectedId]);

    const hit = nodesById[nextSelectedId];
    if (!hit) {
      setInfo(prev => prev + `\n\nclicked node-id: ${selectedId}\n(no NodeInfo found)`);
      return;
    }

    setInfo(prev =>
      [
        prev,
        "",
        `clicked node-id: ${clickedId}` + (e.shiftKey ? ` (shift → parent ${selectedId})` : ""),
        `selected node-id: ${hit.id}`,
        `node op: ${hit.op}`,
        `latex (this node): ${hit.latex}`,
        `mathjson (this node): ${JSON.stringify(hit.json)}`,
      ].join("\n")
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!displayRef.current) return;
    if (!selection) return;

    e.preventDefault();

    // Turn a node selection into a span selection when appropriate
    if (selection.kind === "node") {
      const nodeId = selection.nodeId;
      const parentId = parentById[nodeId];
      if (!parentId) return;

      const parentInfo = nodesById[parentId];
      if (!parentInfo) return;

      const op = parentInfo.op;
      if (op !== "Add" && op !== "Multiply") return;

      const idx = childIndexById[nodeId];
      if (idx === undefined) return;

      const start = idx;
      const end = idx;

      // Now expand one step in the requested direction
      const kids = childrenById[parentId] ?? [];

      let newStart = start;
      let newEnd = end;

      if (e.key === "ArrowLeft") newStart = Math.max(0, start - 1);
      else newEnd = Math.min(kids.length - 1, end + 1);

      const span: ExprSelection = { kind: "span", parentId, op, start: newStart, end: newEnd };
      setSelection(span);

      const selectedChildIds = kids.slice(newStart, newEnd + 1);
      setOverlayForNodeIds(selectedChildIds);
      return;
    }

    // Expand an existing span
    if (selection.kind === "span") {
      const { parentId, op, start, end } = selection;
      const kids = childrenById[parentId] ?? [];
      if (kids.length === 0) return;

      let newStart = start;
      let newEnd = end;

      if (e.key === "ArrowLeft") newStart = Math.max(0, start - 1);
      else newEnd = Math.min(kids.length - 1, end + 1);

      const span: ExprSelection = { kind: "span", parentId, op, start: newStart, end: newEnd };
      setSelection(span);

      setOverlayForNodeIds(kids.slice(newStart, newEnd + 1));
    }
  }

  function getChildRectsInShadow(mathDivEl: HTMLElement, childIds: string[]) {
    const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
    if (!sr) return [];

    return childIds.map((id) => {
      // a child may appear multiple times (rare here). take union rect.
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      let found = 0;

      sr.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`).forEach((el) => {
        const r = el.getBoundingClientRect();
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
        found++;
      });

      if (!found) return null;
      return { id, rect: { left, right, top, bottom, midX: (left + right) / 2 } };
    }).filter(Boolean) as { id: string; rect: any }[];
  }

  type NodeRect = { id: string; rect: { left: number; right: number; midX: number } };

  
  function pickSlot(rects: NodeRect[], clientX: number): number {
    for (let i = 1; i < rects.length; i++) {
      const l = rects[i - 1];
      const r = rects[i];
      const midpoint = (r.rect.left + l.rect.right)/2;
      // debugger
      if (clientX <= midpoint) 
      {
        return i - 1;
      }
    }
    return rects.length;
  }

  function mapSlotToIndexWithoutDragged(slot: number, fromIndex: number) {
    // slot is 0..N in the original list
    // return is 0..N-1 for list without dragged
    return slot <= fromIndex ? slot : slot - 1;
  }

  function computeOverlayRectForNodeIds(
    mathDivEl: HTMLElement,
    nodeIds: string[],
    padX: number,
    padY: number,
    renderBoxEl: HTMLDivElement
  ) {
    const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
    if (!sr || nodeIds.length === 0) return null;

    const boxRect = renderBoxEl.getBoundingClientRect();

    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    let found = 0;

    for (const id of nodeIds) {
      sr.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`).forEach((el) => {
        const r = el.getBoundingClientRect();
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
        found++;
      });
    }

    if (!found) return null;

    left -= padX; right += padX; top -= padY; bottom += padY;

    return {
      left: left - boxRect.left,
      top: top - boxRect.top,
      width: right - left,
      height: bottom - top,
    };
  }

  function setOverlayForNodeIds(nodeIds: string[]) {
    const mathDivEl = displayRef.current;
    const boxEl = mathWrapRef.current;   // ✅ changed
    if (!mathDivEl || !boxEl) return;

    const padX = 8;
    const padY = 3;

    setOverlayRect(computeOverlayRectForNodeIds(mathDivEl, nodeIds, padX, padY, boxEl));
  }

  function onDisplayPointerMove(e: React.PointerEvent) {
    if (!drag?.isActive) return;
    if (e.pointerId !== drag.pointerId) return;
    if (!currentJson) return;

    const measureEl = measureRef.current;
    if (!measureEl) return;

    const kids = childrenById[drag.addParentId] ?? [];
    if (kids.length < 2) return;

    // Measure from the BASELINE renderer, not the preview renderer
    const rects = getChildRectsInShadow(measureEl, kids) as NodeRect[];
    if (rects.length === 0) return;

    // slot in full list (0..kids.length)
    const slot = pickSlot(rects, e.clientX);

    // map to insertion index in list with dragged removed (0..kids.length-1)
    let toIndex = mapSlotToIndexWithoutDragged(slot, drag.fromIndex);
    toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));

    if (toIndex === drag.toIndex) {
      if (toIndex !== drag.toIndex) {
        // debugPick(kids, rects, e.clientX, slot, toIndex, drag.fromIndex);
      }
      return;
    }

    const nextDrag = { ...drag, toIndex };
    setDrag(nextDrag);

    // show what it would be "if released now"
    renderFromMathJson(currentJson, {
      preview: true,
      previewOverride: {
        addId: drag.addParentId,
        draggedChildId: drag.draggedChildId,
        fromIndex: drag.fromIndex,
        toIndex, // <-- the newly computed one
      },
    });
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    if (!drag?.isActive) return;
    if (e.pointerId !== drag.pointerId) return;

    // TODO
    // Commit reorder in your underlying MathJSON (or “current state”)
    // For now: just rebuild the MathJSON by moving that child within the Add node.
    // commitReorderAdd(drag.addParentId, drag.fromIndex, drag.toIndex);

    setDrag(null);
    // if (currentJson) renderFromMathJson(currentJson, { preview: false });
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
            {String.raw`a+b+c=d`}
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

        <div ref={mathWrapRef} style={{ position: "relative", display: "inline-block" }}>
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
          <MathDiv ref={displayRef} mode="displaystyle" className="math-display" />

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
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
        }}
      />
    </div>
  );
}