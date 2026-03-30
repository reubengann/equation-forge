import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

function toggleDelimiterNode(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return null;
  if (expr[0] === "Delimiter") {
    const inner = (expr[1] ?? null) as MJ | null;
    if (inner == null) return null;
    return ["List", inner] as MJ;
  }
  if (expr[0] === "List") {
    const inner = (expr[1] ?? null) as MJ | null;
    if (inner == null) return null;
    return ["Delimiter", inner] as MJ;
  }
  return null;
}

export function canToggleDelimiterStyle(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree || !selection || selection.kind !== "node") return false;
  const op = tree.nodesById[selection.nodeId]?.op;
  return op === "Delimiter" || op === "List";
}

export function toggleDelimiterStyle(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  if (!selection || selection.kind !== "node") return null;
  const path = tree.pathById[selection.nodeId];
  if (!path) return null;
  const node = getAtPath(tree.rootJson, path) as MJ;
  const next = toggleDelimiterNode(node);
  if (!next) return null;
  const nextRoot = setAtPath(tree.rootJson, path, next) as MJ;
  return ExpressionTree.create(nextRoot);
}

