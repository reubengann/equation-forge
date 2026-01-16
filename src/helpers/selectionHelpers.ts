import type { ExpressionTree } from "../ExpressionTree";
import type { ExprSelection } from "../selectionSemantics";
import { getDescendantNodeIds } from "../selectionSemantics";
import { setHighlightedText } from "../App";

export function applySelectionHighlight(
  sel: ExprSelection | null,
  tree: ExpressionTree | null,
  displayEl: HTMLElement | null
) {
  if (!displayEl || !tree) {
    if (displayEl) setHighlightedText(displayEl, []);
    return;
  }

  if (!sel) {
    setHighlightedText(displayEl, []);
    return;
  }

  if (sel.kind === "node") {
    setHighlightedText(displayEl, getDescendantNodeIds(tree, [sel.nodeId]));
    return;
  }

  // span
  const kids = tree.childrenById[sel.parentId] ?? [];
  const ids = kids.slice(sel.start, sel.end + 1);
  setHighlightedText(displayEl, getDescendantNodeIds(tree, ids));
}

export type SelectionDetails = {
  kind: string;
  clickedId: string;
  selectedId: string;
  op: string;
  latex: string;
  json: string;
  parent: string;
  range: string;
  childIds: string;
  childOps: string;
  childLatex: string;
  note: string;
};

export function getSelectionDetailsForNode(
  tree: ExpressionTree,
  nodeId: string,
  opts?: { clickedId?: string; normalizedId?: string; shiftKey?: boolean }
): SelectionDetails {
  const n = tree.nodesById[nodeId];
  const notes: string[] = [];
  if (opts?.normalizedId && opts.normalizedId !== opts.clickedId) {
    notes.push(`drag-handle: ${opts.normalizedId}`);
  }
  if (opts?.shiftKey && opts.clickedId) {
    notes.push(`shift → parent ${opts.clickedId}`);
  }

  return {
    kind: "node",
    clickedId: opts?.clickedId ?? "",
    selectedId: n?.id ?? nodeId ?? "",
    op: n?.op ?? "",
    latex: n?.latex ?? "",
    json: n ? JSON.stringify(n.json) : "",
    parent: tree.parentById[nodeId] ?? "",
    range: "",
    childIds: "",
    childOps: "",
    childLatex: "",
    note: notes.join(" | "),
  };
}

export function getSelectionDetailsForSpan(
  tree: ExpressionTree,
  sel: ExprSelection & { kind: "span" },
  note?: string
): SelectionDetails {
  const kids = tree.childrenById[sel.parentId] ?? [];
  const ids = kids.slice(sel.start, sel.end + 1);
  const ops = ids.map((id) => tree.nodesById[id]?.op ?? "?").join(", ");
  const latex = ids.map((id) => tree.nodesById[id]?.latex ?? "?").join(" | ");

  return {
    kind: "span",
    clickedId: "",
    selectedId: "",
    op: sel.op ?? "",
    latex: "",
    json: "",
    parent: sel.parentId ?? "",
    range: `[${sel.start}..${sel.end}] of ${kids.length}`,
    childIds: ids.join(", "),
    childOps: ops,
    childLatex: latex,
    note: note ?? "",
  };
}

export function getResetSelectionDetails(note?: string): SelectionDetails {
  return {
    kind: "",
    clickedId: "",
    selectedId: "",
    op: "",
    latex: "",
    json: "",
    parent: "",
    range: "",
    childIds: "",
    childOps: "",
    childLatex: "",
    note: note ?? "",
  };
}
