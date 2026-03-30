import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";

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

type SubstituteManyArgs = {
  tree: ExpressionTree;
  targetIds: string[];
  replacement: MJ;
  scope: SubstituteScope;
};

type SubstituteSpanArgs = {
  tree: ExpressionTree;
  parentId: string;
  start: number;
  end: number;
  replacement: MJ;
};

function replacementForPath(root: MJ, path: number[], replacement: MJ): MJ {
  if (path.length === 0) return replacement;
  if (Array.isArray(replacement) && replacement[0] === "Delimiter") return replacement;

  const parentPath = path.slice(0, -1);
  const parent = getAtPath(root, parentPath) as MJ;
  if (
    Array.isArray(parent) &&
    (parent[0] === "InvisibleOperator" || parent[0] === "Multiply") &&
    Array.isArray(replacement) &&
    replacement[0] === "Add"
  ) {
    return ["Delimiter", replacement] as MJ;
  }
  return replacement;
}

function comparePathsDeepestFirst(a: number[], b: number[]): number {
  if (a.length !== b.length) return b.length - a.length;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

function normalizeByParentOp(op: string, kids: MJ[]): MJ {
  if (kids.length === 1) return kids[0];
  if (op === "InvisibleOperator" || op === "Multiply") {
    return ["InvisibleOperator", ...kids] as MJ;
  }
  return ["Add", ...kids] as MJ;
}

export function substitute({
  tree,
  targetId,
  replacement,
  scope,
}: SubstituteArgs): ExpressionTree | null {
  const path = tree.pathById[targetId];
  if (path === undefined) return null;

  if (scope === "single") {
    const wrappedReplacement = replacementForPath(tree.rootJson, path, replacement);
    const nextRoot = setAtPath(tree.rootJson, path, wrappedReplacement) as MJ;
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
    const wrappedReplacement = replacementForPath(nextRoot, p, replacement);
    nextRoot = setAtPath(nextRoot, p, wrappedReplacement) as MJ;
  }

  return ExpressionTree.create(nextRoot);
}

export function substituteMany({
  tree,
  targetIds,
  replacement,
  scope,
}: SubstituteManyArgs): ExpressionTree | null {
  const ids = Array.from(new Set(targetIds));
  if (ids.length === 0) return null;

  const paths: number[][] = [];
  if (scope === "single") {
    for (const id of ids) {
      const p = tree.pathById[id];
      if (p === undefined) return null;
      paths.push(p);
    }
  } else {
    const targetJsons = ids
      .map((id) => tree.nodesById[id]?.json)
      .filter((mj): mj is MJ => mj !== undefined);
    if (targetJsons.length === 0) return null;
    for (const [id, info] of Object.entries(tree.nodesById)) {
      if (!targetJsons.some((targetJson) => deepEqualMJ(info.json, targetJson))) {
        continue;
      }
      const p = tree.pathById[id];
      if (p === undefined) return null;
      paths.push(p);
    }
  }

  const uniqueByPath = new Map<string, number[]>();
  for (const p of paths) uniqueByPath.set(p.join("."), p);
  const orderedPaths = Array.from(uniqueByPath.values()).sort(comparePathsDeepestFirst);

  let nextRoot = tree.rootJson;
  for (const p of orderedPaths) {
    const wrappedReplacement = replacementForPath(nextRoot, p, replacement);
    nextRoot = setAtPath(nextRoot, p, wrappedReplacement) as MJ;
  }
  return ExpressionTree.create(nextRoot);
}

export function substituteSpan({
  tree,
  parentId,
  start,
  end,
  replacement,
}: SubstituteSpanArgs): ExpressionTree | null {
  const parentPath = tree.pathById[parentId];
  if (parentPath === undefined) return null;
  const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentExpr)) return null;
  const parentOp = String(parentExpr[0]);
  if (parentOp !== "Add" && parentOp !== "InvisibleOperator" && parentOp !== "Multiply") {
    return null;
  }

  const kids = parentExpr.slice(1) as MJ[];
  if (start < 0 || end < 0 || start > end || end >= kids.length) return null;

  const replacementTerm = replacementForPath(tree.rootJson, [...parentPath, start + 1], replacement);
  const nextKids = [...kids.slice(0, start), replacementTerm, ...kids.slice(end + 1)];
  const nextParent = normalizeByParentOp(parentOp, nextKids);
  const nextRoot = setAtPath(tree.rootJson, parentPath, nextParent) as MJ;
  return ExpressionTree.create(nextRoot);
}
