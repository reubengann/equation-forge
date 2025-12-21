import { useMemo, useRef, useState } from "react";
import "mathlive";
import "@cortex-js/compute-engine";
import { MathfieldElement } from "mathlive";
import { ComputeEngine } from "@cortex-js/compute-engine";

const ce = new ComputeEngine();
MathfieldElement.fontsDirectory = "/fonts";

/*
  The main idea here is to interface with Mathlive. However, it only accepts Latex. We don't like this; we actually want to maintain a tree (specifically it's a MathJSON tree). 
  So we need to convert between the two for anything we want to do with the MathJSON tree in order for it to be rendered. As we do this, we also add a node-id tag into the latex
  via \htmlData{node-id="${id}"}. This allows us to hit test the rendered mathlive and find out which node was clicked.
*/

type MJ = any;

type NodeInfo = {
  id: string;
  op: string;          // "Symbol" | "Number" | "Add" | ...
  latex: string;       // LaTeX for exactly this subtree (UNtagged)
  json: MJ;            // MathJSON subtree
};

type PathKey = string;

type TaggedRender = {
  latexTagged: string;
  nodes: Record<string, NodeInfo>;
  parentById: Record<string, string | null>;
  childrenById: Record<string, string[]>;        // for Add/Multiply nodes
  childIndexById: Record<string, number>;        // for any node that is a child of Add/Multiply
  pathById: Record<string, number[]>;     // "n17" -> [1,2]
  idByPath: Record<PathKey, string>;      // "1.2" -> "n17"
};

/*
  Here we take a MathJson tree and convert it into a tagged LaTeX string. The tags are used for hit testing.
*/
function makeTaggedLatexFromMathJson(mj: MJ): TaggedRender {

  // Node ID generator
  let nextId = 1;
  const newId = () => `n${nextId++}`;

  // Bookkeeping tables
  const childrenById: Record<string, string[]> = {};
  const childIndexById: Record<string, number> = {};
  const nodes: Record<string, NodeInfo> = {};
  const parentById: Record<string, string | null> = {};
  const pathById: Record<string, number[]> = {};
  const idByPath: Record<string, string> = {};

  const pathKey = (p: number[]) => p.join(".");

  const wrap = (id: string, contentLatex: string) => String.raw`\htmlData{node-id="${id}"}{${contentLatex}}`;

  /**
 * Recursively emit LaTeX for a MathJSON node, tagging each subtree with a unique node-id.
 *
 * Returns both:
 * - latexPlain: untagged LaTeX for the subtree
 * - latexTagged: LaTeX with \htmlData{node-id=...}{...} wrappers, used for hit-testing
 *
 * Also populates:
 * - parentById: render-tree parent links
 * - childrenById / childIndexById for container operators (Add, Multiply, Divide)
 */
  const emit = (
    node: MJ,
    parentId: string | null,
    path: number[]
  ): { id: string; latexTagged: string; latexPlain: string } => {
    // console.log("emit", node, parentOp, parentId);
    const id = newId();
    pathById[id] = path;
    idByPath[pathKey(path)] = id;
    parentById[id] = parentId;

    // Composite
    if (Array.isArray(node)) {

      if (Array.isArray(node) && node[0] === "Divide") {
        // MathJSON: ["Divide", numerator, denominator]
        const num = emit(node[1], id, [...path, 1]);
        const den = emit(node[2], id, [...path, 1]);
        childrenById[id] = [num.id, den.id];
        childIndexById[num.id] = 0;
        childIndexById[den.id] = 1;
        const latexPlain = String.raw`\frac{${num.latexPlain}}{${den.latexPlain}}`;
        const latexTaggedInner = String.raw`\frac{${num.latexTagged}}{${den.latexTagged}}`;

        // wrap the whole Divide node with its own id (so the fraction itself is selectable)
        const latexTagged = wrap(id, latexTaggedInner); // whatever you use for Add/vars
        return { id, latexPlain, latexTagged };
      }

      const op = String(node[0]);

      if (op === "Equal") {
        const L = emit(node[1], id, [...path, 1]);
        const R = emit(node[2], id, [...path, 2]);

        const plain = `${L.latexPlain} = ${R.latexPlain}`;
        const tagged = `${L.latexTagged} = ${R.latexTagged}`;

        nodes[id] = { id, op, latex: plain, json: node };
        return { id, latexTagged: wrap(id, tagged), latexPlain: plain };
      }

      if (op === "Add") {
        let children = node.slice(1).map((c, i) => emit(c, id, [...path, 1 + i]));

        // record the order
        childrenById[id] = children.map(ch => ch.id);
        childrenById[id].forEach((cid, idx) => (childIndexById[cid] = idx));

        // let displayParts = children.map((c) => ({ id: c.id, latexTagged: c.latexTagged, latexPlain: c.latexPlain }));

        const plain = children.map((c) => c.latexPlain).join(" + ");
        const tagged = children.map((c) => c.latexTagged).join(String.raw` + `);

        nodes[id] = { id, op, latex: plain, json: node };
        return { id, latexTagged: wrap(id, tagged), latexPlain: plain };
      }

      const plain = String.raw`\operatorname{${op}}\left(\dots\right)`;
      nodes[id] = { id, op, latex: plain, json: node };
      return { id, latexTagged: wrap(id, plain), latexPlain: plain };
    }

    // This hack prevents e as being interpreted as \exponentialE
    if (typeof node === "string" && /^[A-Za-z]$/.test(node)) {
      const plain = node; // italic by default in math mode
      nodes[id] = { id, op: "Symbol", latex: plain, json: node };
      return { id, latexTagged: wrap(id, plain), latexPlain: plain };
    }

    const plain = ce.box(node).latex;
    nodes[id] = { id, op: "Unknown", latex: plain, json: node };
    return { id, latexTagged: wrap(id, plain), latexPlain: plain };
  };

  const top = emit(mj, null, []);
  return { latexTagged: top.latexTagged, nodes, parentById, childrenById, childIndexById, pathById, idByPath };
}

/**
 * Given a PointerEvent composedPath() (DOM ancestry including shadow DOM),
 * choose the "best" node-id to treat as clicked.
 *
 * This function walks from deepest element upward and looks for an element
 * with `data-node-id="nX"` (inserted by makeTaggedLatexFromMathJson).
 *
 * It deliberately *avoids* selecting container operators on a plain click
 * (e.g. Add / Multiply / Equal), because users usually mean "a term"
 * rather than "the whole sum" when clicking once.
 *
 * @param path Result of event.composedPath()
 * @param nodesById Current node registry from the latest render
 * @returns nodeId of the clicked term-like node, or null if nothing usable was clicked
 */
function findBestNodeIdFromComposedPath(
  path: unknown[],
  nodesById: Record<string, NodeInfo>,
): string | null {
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
  const [previewJson, setPreviewJson] = useState<MJ | null>(null);
  const [pathById, setPathById] = useState<Record<string, number[]>>({});

  type ExprSelection =
    | { kind: "node"; nodeId: string }
    | { kind: "span"; parentId: string; op: "Add" | "Multiply"; start: number; end: number };

  const [selection, setSelection] = useState<ExprSelection | null>(null);

  type DragState =
    | null
    | {
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

  const [childrenById, setChildrenById] = useState<Record<string, string[]>>({});
  const [childIndexById, setChildIndexById] = useState<Record<string, number>>({});
  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const renderBoxRef = useRef<HTMLDivElement | null>(null);
  const mathWrapRef = useRef<HTMLDivElement | null>(null);
  const [nodesById, setNodesById] = useState<Record<string, NodeInfo>>({});
  const [info, setInfo] = useState<string>("Type an equation, click Add / Update. Then click parts of the rendered equation.");

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

  /**
 * Render a MathJSON expression into the MathLive display <math-div>.
 *
 * This is the only function that should write into `displayRef.current.textContent`
 * and call MathLive's `.render()` to update the visible equation.
 *
 * It also keeps a hidden "measure" <math-div> in sync with the *baseline* expression
 * (non-preview) so we can measure stable child rectangles while dragging:
 * - DISPLAY <math-div>: shows preview during drag
 * - MEASURE <math-div>: stays on baseline so rects don't jump mid-drag
 *
 * The `preview` flag is a display-only behavior:
 * - If preview=false: both DISPLAY and MEASURE update to the same equation
 * - If preview=true:  DISPLAY updates with preview ordering, MEASURE does not
 *
 * @param json The MathJSON to render
 * @param opts.preview If true, render a preview (currently only Add reorder preview)
 * @param opts.previewOverride If provided, uses this preview state instead of current `drag`
 */
  function renderFromMathJson(json: MJ, opts?: { preview: boolean, previewOverride?: { addId: string; draggedChildId: string; fromIndex: number; toIndex: number } }) {
    if (!displayRef.current) return;
    if (!measureRef.current) return;

    const rendered = makeTaggedLatexFromMathJson(json);
    console.log(rendered);

    setNodesById(rendered.nodes);
    setParentById(rendered.parentById);
    setChildrenById(rendered.childrenById);
    setChildIndexById(rendered.childIndexById);
    setPathById(rendered.pathById);

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
    console.log(mf.value)
    const latex: string = mf.value;
    const expr = ce.parse(latex, { canonical: false });
    if (!expr) {
      setInfo(`Parse failed. latex=${latex}`);
      return;
    }

    const json = expr.json; // ✅ now typed
    // debugger
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
    setCurrentJson(json);
    renderFromMathJson(json, { preview: false });
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

    const ne = e.nativeEvent as PointerEvent;
    const path = typeof ne.composedPath === "function" ? ne.composedPath() : [];
    const clickedId = findBestNodeIdFromComposedPath(path, nodesById);

    if (!clickedId) {
      clearSelection();
      return;
    }

    const pId = parentById[clickedId];
    if (!pId) return;
    const pInfo = pId ? nodesById[pId] : null;
    const idx = childIndexById[clickedId];
    const addPath = pathById[pId];              // parentId is the Add node id
    if (!addPath) return;
    const baselineChildIds = childrenById[pId] ?? [];
    if (baselineChildIds.length < 2) return;
    setPreviewJson(null);

    if (pId && pInfo?.op === "Add" && idx !== undefined) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      setDrag({
        kind: "reorder-add",
        isActive: true,
        pointerId: e.pointerId,

        addParentId: pId,
        addPath,
        baselineChildIds,

        draggedChildId: clickedId,
        fromIndex: idx,
        toIndex: idx,
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

  /*
  For an array of child nodes (e.g. children of an Add/Multiply), compute their bounding rects
 */
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


  /*
  Compute the best destination rect given the list.
  In gaps, the midpoint between the left and right of the two slots is used as a boundary.
 */
  function pickSlot(rects: NodeRect[], clientX: number): number {
    for (let i = 1; i < rects.length; i++) {
      const l = rects[i - 1];
      const r = rects[i];
      const midpoint = (r.rect.left + l.rect.right) / 2;
      // debugger
      if (clientX <= midpoint) {
        return i - 1;
      }
    }
    return rects.length;
  }

  /*
  If the dragged item will be removed, the destination index is one less than the slot index.
 */
  function computeDestinationIndex(hoveredExpressionPos: number, fromIndex: number): number {
    return hoveredExpressionPos <= fromIndex ? hoveredExpressionPos : hoveredExpressionPos - 1;
  }

  /*
    When selecting elements, we want to show an overlay box around them.
    We do this by finding the bounding box of _all_ the elements with the same node-id.
    Then we add padding around that box and set the position of the overlay div to match.
  */
  function setOverlayForNodeIds(nodeIds: string[]) {
    const mathDivEl = displayRef.current;
    const boxEl = mathWrapRef.current;   // ✅ changed
    if (!mathDivEl || !boxEl) return;

    const padX = 8;
    const padY = 3;

    const sr = (mathDivEl as any).shadowRoot as ShadowRoot | null;
    if (!sr || nodeIds.length === 0) return null;

    const boxRect = boxEl.getBoundingClientRect();

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

    setOverlayRect({
      left: left - boxRect.left,
      top: top - boxRect.top,
      width: right - left,
      height: bottom - top,
    });
  }

  function getAtPath(root: any, path: number[]) {
    let cur = root;
    for (const i of path) cur = cur[i];
    return cur;
  }

  function setAtPath(root: any, path: number[], value: any): any {
    if (path.length === 0) return value;
    const [i, ...rest] = path;
    const copy = Array.isArray(root) ? root.slice() : { ...root };
    copy[i] = setAtPath(copy[i], rest, value);
    return copy;
  }

  function reorderAddAtPath(root: MJ, addPath: number[], fromIndex: number, toIndex: number): MJ {
    const addNode = getAtPath(root, addPath);
    if (!Array.isArray(addNode) || addNode[0] !== "Add") return root;

    const kids = addNode.slice(1);
    if (kids.length < 2) return root;
    if (fromIndex === toIndex) return root;
    if (fromIndex < 0 || fromIndex >= kids.length) return root;

    const moved = kids[fromIndex];
    const rest = kids.filter((_, i) => i !== fromIndex);

    const ins = Math.max(0, Math.min(rest.length, toIndex));
    const nextKids = [...rest.slice(0, ins), moved, ...rest.slice(ins)];

    const nextAdd: MJ = ["Add", ...nextKids];
    return setAtPath(root, addPath, nextAdd);
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
    if (!currentJson) return;

    const measureEl = measureRef.current;
    if (!measureEl) return;

    const kids = childrenById[drag.addParentId] ?? [];
    if (kids.length < 2) return;

    const rects = getChildRectsInShadow(measureEl, kids) as NodeRect[];
    if (rects.length === 0) return;

    const hoveredExpressionPosition = pickSlot(rects, e.clientX);

    let toIndex = computeDestinationIndex(hoveredExpressionPosition, drag.fromIndex);
    toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));

    if (toIndex === drag.toIndex) {
      return;
    }

    const nextDrag = { ...drag, toIndex };
    setDrag(nextDrag);

    // ✅ build previewJson and render it
    const nextPreview = reorderAddAtPath(currentJson, drag.addPath, drag.fromIndex, toIndex);
    setPreviewJson(nextPreview);

    // preview=true means "don't update MEASURE"
    renderFromMathJson(nextPreview);
  }

  function onDisplayPointerUp(e: React.PointerEvent) {
    if (!drag?.isActive) return;
    if (e.pointerId !== drag.pointerId) return;

    if (previewJson) {
      setCurrentJson(previewJson);
      renderFromMathJson(previewJson, { preview: false });
      setPreviewJson(null);
    } else if (currentJson) {
      renderFromMathJson(currentJson, { preview: false });
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