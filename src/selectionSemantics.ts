import type { ExpressionTree } from "./ExpressionTree";

export function normalizeSelection(
  tree: ExpressionTree,
  nodeId: string
): string {
  let cur = nodeId;
  while (true) {
    const p = tree.parentById[cur];
    if (!p) return cur;
    const op = tree.nodesById[p]?.op;
    if (op === "Negate" || op === "Subscript" || op === "OverVector") {
      cur = p;
      continue;
    }
    return cur;
  }
}

export type ExprSelection =
  | { kind: "node"; nodeId: string }
  | {
      kind: "span";
      parentId: string;
      op: "Add" | "InvisibleOperator";
      start: number;
      end: number;
    };

/**
 * Promote a node selection upward by `steps`, stopping before reaching an Equal.
 * Useful for multi-click selection climbing: leaf -> Negate/Divide/etc -> Add -> (stop at Equal).
 */
export function promoteSelection(
  tree: ExpressionTree,
  nodeId: string,
  steps: number
): string {
  let cur: string | null = nodeId;
  let remaining = steps;
  while (cur && remaining > 0) {
    const parent: string | null | undefined = tree.parentById[cur];
    if (!parent) break;
    const op = tree.nodesById[parent]?.op;
    if (op === "Equal") break; // never select Equal
    cur = parent;
    remaining -= 1;
  }
  return cur ?? nodeId;
}

export function expandSelection(
  tree: ExpressionTree,
  sel: ExprSelection,
  dir: "left" | "right"
): { next: ExprSelection; nodeIdsToOverlay: string[] } | null {
  // Node -> Span
  if (sel.kind === "node") {
    const nodeId = sel.nodeId;
    const parentId = tree.parentById[nodeId];
    if (!parentId) return null;

    const parentOp = tree.nodesById[parentId]?.op;
    if (parentOp !== "Add" && parentOp !== "InvisibleOperator") return null;

    const idx = tree.childIndexById[nodeId];
    if (idx === undefined) return null;

    const kids = tree.childrenById[parentId] ?? [];
    if (kids.length === 0) return null;

    let start = idx;
    let end = idx;
    if (dir === "left") start = Math.max(0, start - 1);
    else end = Math.min(kids.length - 1, end + 1);

    const next: ExprSelection = {
      kind: "span",
      parentId,
      op: parentOp,
      start,
      end,
    };
    return { next, nodeIdsToOverlay: kids.slice(start, end + 1) };
  }

  // Span -> Expanded Span
  const { parentId, op, start, end } = sel;
  const kids = tree.childrenById[parentId] ?? [];
  if (kids.length === 0) return null;

  let newStart = start;
  let newEnd = end;
  if (dir === "left") newStart = Math.max(0, newStart - 1);
  else newEnd = Math.min(kids.length - 1, newEnd + 1);

  const next: ExprSelection = {
    kind: "span",
    parentId,
    op,
    start: newStart,
    end: newEnd,
  };
  return { next, nodeIdsToOverlay: kids.slice(newStart, newEnd + 1) };
}

export function getDescendantNodeIds(
  tree: ExpressionTree,
  rootIds: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);

    const kids = tree.childrenById[id] ?? [];
    for (const k of kids) visit(k);
  };

  for (const id of rootIds) visit(id);
  return out;
}

export function chooseBestAllowedSelectedNode(
  nodeIds: string[],
  tree: ExpressionTree
): string | null {
  const disallow = new Set(["Add", "Equal", "InvisibleOperator"]);

  for (const id of nodeIds) {
    const info = tree.nodesById[id];
    if (!info) continue;

    if (!disallow.has(info.op)) return id;
  }

  return null;
}
