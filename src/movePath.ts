import type { ExpressionTree } from "./ExpressionTree";

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
