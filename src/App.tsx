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
};

function makeTaggedLatexFromMathJson(mj: MJ): TaggedRender {
  let nextId = 1;
  const newId = () => `n${nextId++}`;

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
        const children = node.slice(1).map((c: MJ) => emit(c, "Add", id)); // ✅ parent=id

        const plain = children.map((c) => c.latexPlain).join(" + ");
        const tagged = children.map((c) => c.latexTagged).join(String.raw` + `);

        const bodyPlain = needsParens(node, parentOp) ? String.raw`\left(${plain}\right)` : plain;
        const bodyTagged = needsParens(node, parentOp) ? String.raw`\left(${tagged}\right)` : tagged;

        nodes[id] = { id, op, latex: bodyPlain, json: node };
        return { id, latexTagged: wrap(id, bodyTagged), latexPlain: bodyPlain };
      }

      if (op === "Multiply") {
        const children = node.slice(1).map((c: MJ) => emit(c, "Multiply", id)); // ✅ parent=id

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
  return { latexTagged: top.latexTagged, nodes, parentById };
}


function findNodeIdFromComposedPath(path: unknown[]): string | null {
  for (const p of path) {
    if (!(p instanceof Element)) continue;
    const h = p as HTMLElement;
    const nodeId = h.dataset?.nodeId;
    if (nodeId) return nodeId;
  }
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
    .dp-selected {
      outline: 2px solid #ff9800;
      outline-offset: 2px;
      border-radius: 3px;
    }
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inputRef = useRef<any>(null);
  const displayRef = useRef<HTMLElement | null>(null);

  const [nodesById, setNodesById] = useState<Record<string, NodeInfo>>({});
  const [info, setInfo] = useState<string>("Type an equation, click Add / Update. Then click parts of the rendered equation.");

  function renderFromMathJson(json: MJ) {
    if (!displayRef.current) return;
    const rendered = makeTaggedLatexFromMathJson(json);
    console.log("nodesById", rendered.nodes);
    console.log("parentById", rendered.parentById);

    setNodesById(rendered.nodes);
    setParentById(rendered.parentById);

    displayRef.current.textContent = rendered.latexTagged;
    (displayRef.current as any).render?.();

    // Make sure our highlight CSS exists
    installShadowStyle(displayRef.current);
    // Clear any highlight
    setShadowHighlight(displayRef.current, null);
  }

  function onAddEquation() {
    const mf = inputRef.current;
    const latex = String(mf?.value ?? "").trim();

    const json = mf?.expression?.json;
    if (!json) {
      setInfo(`No mf.expression.json (Compute Engine not loaded?). mf.value=${latex}`);
      return;
    }

    renderFromMathJson(json);

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
    const clickedId = findNodeIdFromComposedPath(path);

    if (!clickedId) return;

    // If shift is held, expand from the *current* selection if there is one;
    // otherwise expand from the clicked node.
    const baseId = e.shiftKey && selectedId ? selectedId : clickedId;
    const nextSelectedId = e.shiftKey ? (parentById[baseId] ?? baseId) : clickedId;

    setSelectedId(nextSelectedId);
    setShadowHighlight(displayEl, nextSelectedId);

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
            {String.raw`a+b=c`}
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
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          padding: 14,
          borderRadius: 10,
          cursor: "crosshair",
          userSelect: "none",
        }}
        onPointerDown={onDisplayPointerDown}
      >
        <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.8 }}>
          Rendered (tagged from MathJSON) — click to inspect + highlight
        </div>
        <MathDiv ref={displayRef} mode="displaystyle" />
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