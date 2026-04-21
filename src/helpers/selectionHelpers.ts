import { ExpressionTree, type MJ } from "../ExpressionTree";
import type { ExprSelection } from "../selectionSemantics";
import { getDescendantNodeIds } from "../selectionSemantics";
import { setHighlightedText } from "../infra/mathlive/derivationPadHighlight";
import { getAtPath } from "../movePath";

export function expandAtomicSelectionNodeIds(
  tree: ExpressionTree,
  nodeIds: string[]
): string[] {
  // Delta-like quantities are now represented as dedicated atomic nodes
  // (e.g. ["DeltaOfQuantity", ...]) by the compute-engine layer.
  void tree;
  return nodeIds;
}

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
    const expanded = expandAtomicSelectionNodeIds(tree, [sel.nodeId]);
    setHighlightedText(displayEl, getDescendantNodeIds(tree, expanded));
    return;
  }

  if (sel.kind === "multi") {
    setHighlightedText(displayEl, getDescendantNodeIds(tree, sel.nodeIds));
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

export function getSelectionDetailsForMulti(
  tree: ExpressionTree,
  sel: ExprSelection & { kind: "multi" },
  note?: string
): SelectionDetails {
  const ids = sel.nodeIds;
  const ops = ids.map((id) => tree.nodesById[id]?.op ?? "?").join(", ");
  const latex = ids.map((id) => tree.nodesById[id]?.latex ?? "?").join(" | ");
  return {
    kind: "multi",
    clickedId: "",
    selectedId: "",
    op: "",
    latex: "",
    json: "",
    parent: "",
    range: `${ids.length} nodes`,
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

export function getLatexForSelectionCopy(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): string {
  if (!tree || !selection) return "";
  if (selection.kind === "node") {
    const path = tree.pathById[selection.nodeId];
    if (path !== undefined) {
      const expr = getAtPath(tree.rootJson, path) as MJ;
      try {
        return ExpressionTree.exportLatex(expr);
      } catch {
        // Fall back to display latex when export rendering fails.
      }
    }
    return tree.nodesById[selection.nodeId]?.latex ?? "";
  }

  if (selection.kind === "span") {
    const parentPath = tree.pathById[selection.parentId];
    if (parentPath === undefined) return "";
    const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
    if (!Array.isArray(parentExpr)) return "";
    const kids = parentExpr.slice(1) as MJ[];
    const chosen = kids.slice(selection.start, selection.end + 1);
    if (chosen.length === 0) return "";
    const selectedExpr =
      chosen.length === 1 ? chosen[0] : ([selection.op, ...chosen] as MJ);
    return ExpressionTree.exportLatex(selectedExpr);
  }

  const ids = Array.from(new Set(selection.nodeIds));
  if (ids.length === 0) return "";

  const childUnderAncestor = (ancestorId: string, nodeId: string): string | null => {
    let cur: string | null | undefined = nodeId;
    while (cur) {
      const parentId = tree.parentById[cur];
      if (!parentId) return null;
      if (parentId === ancestorId) return cur;
      cur = parentId;
    }
    return null;
  };

  type ContainerCandidate = {
    containerId: string;
    op: "Add" | "InvisibleOperator";
    start: number;
    end: number;
    uniqueCount: number;
    coverageCount: number;
    depth: number;
  };

  const collectContainerCandidates = (op: "Add" | "InvisibleOperator"): ContainerCandidate[] => {
    const containerIds = new Set<string>();
    for (const id of ids) {
      let cur: string | null | undefined = id;
      while (cur) {
        const parentId = tree.parentById[cur];
        if (!parentId) break;
        const parentOp = tree.nodesById[parentId]?.op;
        if (
          (op === "Add" && parentOp === "Add") ||
          (op === "InvisibleOperator" &&
            (parentOp === "InvisibleOperator" || parentOp === "Multiply"))
        ) {
          containerIds.add(parentId);
        }
        cur = parentId;
      }
    }

    const out: ContainerCandidate[] = [];
    for (const containerId of containerIds) {
      const children = tree.childrenById[containerId] ?? [];
      if (children.length < 2) continue;
      const childHits = ids
        .map((id) => childUnderAncestor(containerId, id))
        .filter((id): id is string => !!id);
      // Candidate must cover the full selection; otherwise we can drop selected
      // factors (e.g., 1/T) when a nested Add is also selected.
      if (childHits.length !== ids.length) continue;
      if (childHits.length < 2) continue;

      const uniqueHits = Array.from(new Set(childHits));
      const indices = uniqueHits
        .map((id) => children.indexOf(id))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);
      if (indices.length < 2) continue;
      const contiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
      if (!contiguous) continue;

      const containerPath = tree.pathById[containerId];
      out.push({
        containerId,
        op,
        start: indices[0],
        end: indices[indices.length - 1],
        uniqueCount: indices.length,
        coverageCount: childHits.length,
        depth: containerPath ? containerPath.length : 0,
      });
    }
    return out;
  };

  const buildLatexFromContainerCandidate = (cand: ContainerCandidate): string => {
    const parentPath = tree.pathById[cand.containerId];
    if (parentPath === undefined) return "";
    const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
    if (!Array.isArray(parentExpr)) return "";
    const kids = parentExpr.slice(1) as MJ[];
    const chosen = kids.slice(cand.start, cand.end + 1);
    if (chosen.length === 0) return "";
    const selectedExpr =
      chosen.length === 1 ? chosen[0] : ([cand.op, ...chosen] as MJ);

    if (cand.op === "Add" && cand.start === 0 && cand.end === kids.length - 1) {
      const wrapperId = tree.parentById[cand.containerId];
      if (wrapperId) {
        const wrapperOp = tree.nodesById[wrapperId]?.op;
        if (wrapperOp === "Delimiter" || wrapperOp === "List") {
          const wrapperPath = tree.pathById[wrapperId];
          if (wrapperPath !== undefined) {
            const wrapperExpr = getAtPath(tree.rootJson, wrapperPath) as MJ;
            try {
              return ExpressionTree.exportLatex(wrapperExpr);
            } catch {
              // Fall through to selectedExpr rendering.
            }
          }
        }
      }
    }
    return ExpressionTree.exportLatex(selectedExpr);
  };

  const pickBestCandidate = (candidates: ContainerCandidate[]): ContainerCandidate | null => {
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => {
      if (a.uniqueCount !== b.uniqueCount) return b.uniqueCount - a.uniqueCount;
      if (a.depth !== b.depth) return b.depth - a.depth;
      if (a.coverageCount !== b.coverageCount) return b.coverageCount - a.coverageCount;
      return a.containerId.localeCompare(b.containerId);
    })[0];
  };

  const bestAdd = pickBestCandidate(collectContainerCandidates("Add"));
  if (bestAdd) {
    const latex = buildLatexFromContainerCandidate(bestAdd);
    if (latex) return latex;
  }

  const bestMul = pickBestCandidate(collectContainerCandidates("InvisibleOperator"));
  if (bestMul) {
    const latex = buildLatexFromContainerCandidate(bestMul);
    if (latex) return latex;
  }

  const findAddTermAncestor = (
    nodeId: string
  ): { addId: string; termId: string } | null => {
    let cur: string | null | undefined = nodeId;
    while (cur) {
      const parentId = tree.parentById[cur];
      if (!parentId) return null;
      if (tree.nodesById[parentId]?.op === "Add") {
        return { addId: parentId, termId: cur };
      }
      cur = parentId;
    }
    return null;
  };

  const addHits = ids
    .map((id) => findAddTermAncestor(id))
    .filter((v): v is { addId: string; termId: string } => !!v);
  if (addHits.length >= 2) {
    const addId = addHits[0].addId;
    if (addHits.every((h) => h.addId === addId)) {
      const addPath = tree.pathById[addId];
      if (addPath !== undefined) {
        const addExpr = getAtPath(tree.rootJson, addPath) as MJ;
        const addKids = tree.childrenById[addId] ?? [];
        if (Array.isArray(addExpr) && addExpr[0] === "Add") {
          const termIds = Array.from(new Set(addHits.map((h) => h.termId)));
          const indices = termIds
            .map((termId) => addKids.indexOf(termId))
            .filter((idx) => idx >= 0)
            .sort((a, b) => a - b);
          const contiguous =
            indices.length === termIds.length &&
            indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
          if (contiguous && indices.length >= 2) {
            const addTerms = (addExpr as MJ[]).slice(1) as MJ[];
            const chosen = addTerms.slice(indices[0], indices[indices.length - 1] + 1);
            const selectedExpr =
              chosen.length === 1 ? chosen[0] : (["Add", ...chosen] as MJ);
            return ExpressionTree.exportLatex(selectedExpr);
          }
        }
      }
    }
  }

  const firstParent = tree.parentById[ids[0]];
  if (firstParent && ids.every((id) => tree.parentById[id] === firstParent)) {
    const parentOpRaw = tree.nodesById[firstParent]?.op;
    const op: "Add" | "InvisibleOperator" | null =
      parentOpRaw === "Add"
        ? "Add"
        : parentOpRaw === "InvisibleOperator" || parentOpRaw === "Multiply"
        ? "InvisibleOperator"
        : null;
    if (op) {
      const parentPath = tree.pathById[firstParent];
      if (parentPath !== undefined) {
        const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
        if (Array.isArray(parentExpr)) {
          const kids = parentExpr.slice(1) as MJ[];
          const indices = ids
            .map((id) => tree.childIndexById[id])
            .filter((idx): idx is number => idx !== undefined)
            .sort((a, b) => a - b);
          const contiguous =
            indices.length === ids.length &&
            indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
          if (contiguous && indices.length > 0) {
            const chosen = kids.slice(indices[0], indices[indices.length - 1] + 1);
            const selectedExpr =
              chosen.length === 1 ? chosen[0] : ([op, ...chosen] as MJ);
            return ExpressionTree.exportLatex(selectedExpr);
          }
        }
      }
    }
  }

  return ids
    .map((id) => tree.nodesById[id]?.latex ?? "")
    .filter((s) => s.length > 0)
    .join(" ");
}
