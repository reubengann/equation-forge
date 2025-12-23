import type { ExpressionTree, MJ } from "./ExpressionTree";

export function ancestorsInclusive(
  tree: ExpressionTree,
  nodeId: string
): string[] {
  const out: string[] = [];
  let cur: string | undefined = nodeId;
  while (cur) {
    out.push(cur);
    cur = tree.parentById[cur] ?? undefined;
  }
  return out;
}

export function lowestCommonAncestor(
  tree: ExpressionTree,
  aId: string,
  bId: string
): string | null {
  const aAnc = ancestorsInclusive(tree, aId);
  const bSet = new Set(ancestorsInclusive(tree, bId));
  for (const id of aAnc) {
    if (bSet.has(id)) return id;
  }
  return null;
}

export type TreeRoute = {
  fromId: string;
  toId: string;
  lcaId: string;
  up: string[];
  down: string[];
};

export function routeCrossesOp(
  tree: ExpressionTree,
  r: TreeRoute,
  op: string
): boolean {
  const ids = [...r.up, r.lcaId, ...r.down];
  return ids.some((id) => tree.nodesById[id]?.op === op);
}

export function routeBetween(
  tree: ExpressionTree,
  fromId: string,
  toId: string
): TreeRoute | null {
  if (!tree.nodesById[fromId] || !tree.nodesById[toId]) return null;
  const lca = lowestCommonAncestor(tree, fromId, toId);
  if (!lca) return null;
  const fromAnc = ancestorsInclusive(tree, fromId);
  const toAnc = ancestorsInclusive(tree, toId);
  const up: string[] = [];
  for (const id of fromAnc) {
    if (id === lca) break;
    up.push(id);
  }

  // toAnc is [to ... root]; we want lca -> ... -> to
  const downRev: string[] = [];
  for (const id of toAnc) {
    downRev.push(id);
    if (id === lca) break;
  }
  // downRev is [to ... lca], reverse then drop lca
  const down = downRev.reverse().slice(1); // include toId, exclude lca

  return { fromId, toId, lcaId: lca, up, down };
}

export type StructuralBan = { reason: string; atNodeId?: string };

function isAddTerm(tree: ExpressionTree, nodeId: string): boolean {
  const p = tree.parentById[nodeId];
  if (!p) return false;
  return tree.nodesById[p]?.op === "Add";
}

function isUnderDenominator(
  tree: ExpressionTree,
  nodeId: string
): { divId: string } | null {
  let cur = nodeId;
  while (true) {
    const p = tree.parentById[cur];
    if (!p) return null;
    const pInfo = tree.nodesById[p];
    if (pInfo?.op === "Divide") {
      // Divide children order is [numerator, denominator]
      const idx = tree.childIndexById[cur];
      if (idx === 1) return { divId: p };
    }
    cur = p;
  }
}

function bubbleDragHandleId(tree: ExpressionTree, nodeId: string): string {
  // If user clicks inside a unary wrapper (like Negate), treat the wrapper as the draggable unit.
  let cur = nodeId;
  while (true) {
    const p = tree.parentById[cur];
    if (!p) return cur;

    const pop = tree.nodesById[p]?.op;
    if (pop === "Negate") {
      cur = p;
      continue;
    }
    return cur;
  }
}

export function isStructurallyValidMove(
  tree: ExpressionTree,
  fromIdRaw: string,
  toId: string
): StructuralBan | null {
  const fromId = bubbleDragHandleId(tree, fromIdRaw);
  if (isAddTerm(tree, fromId) && isUnderDenominator(tree, toId)) {
    return { reason: "Cannot move an additive term into a denominator." };
  }
  return null;
}

export function getAtPath(root: any, path: number[]) {
  let cur = root;
  for (const i of path) cur = cur[i];
  return cur;
}

export function setAtPath(root: any, path: number[], value: any): any {
  if (path.length === 0) return value;
  const [i, ...rest] = path;
  const copy = Array.isArray(root) ? root.slice() : { ...root };
  copy[i] = setAtPath(copy[i], rest, value);
  return copy;
}

export function reorderAddAtPath(
  root: MJ,
  addPath: number[],
  fromIndex: number,
  toIndex: number
): MJ {
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

export function computeDestinationIndex(
  hoveredExpressionPos: number,
  fromIndex: number
): number {
  return hoveredExpressionPos <= fromIndex
    ? hoveredExpressionPos
    : hoveredExpressionPos - 1;
}
