import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { setAtPath } from "../../movePath";

export type SubstituteScope = "single" | "all";

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

type SubstituteArgs = {
  tree: ExpressionTree;
  targetId: string;
  replacement: MJ;
  scope: SubstituteScope;
};

export function substitute({
  tree,
  targetId,
  replacement,
  scope,
}: SubstituteArgs): ExpressionTree | null {
  const path = tree.pathById[targetId];
  if (path === undefined) return null;

  if (scope === "single") {
    const nextRoot = setAtPath(tree.rootJson, path, replacement) as MJ;
    return ExpressionTree.create(nextRoot);
  }

  const targetNode = tree.nodesById[targetId];
  if (!targetNode) return null;
  const targetJson = targetNode.json;

  const paths: number[][] = [];
  for (const [id, info] of Object.entries(tree.nodesById)) {
    if (deepEqualMJ(info.json, targetJson)) {
      const p = tree.pathById[id];
      if (p === undefined) return null;
      paths.push(p);
    }
  }

  // Replace deepest paths first so earlier changes do not affect later indices.
  paths.sort((a, b) => b.length - a.length);

  let nextRoot = tree.rootJson;
  for (const p of paths) {
    nextRoot = setAtPath(nextRoot, p, replacement) as MJ;
  }

  return ExpressionTree.create(nextRoot);
}
