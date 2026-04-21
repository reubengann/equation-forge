import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

const FUNCTION_OPS_WITH_PAREN_ARGS = new Set([
  "Sin",
  "Cos",
  "Tan",
  "Arctan",
  "ArcTan",
  "Arcsin",
  "ArcSin",
  "Arccos",
  "ArcCos",
  "Exp",
  "Log",
  "Ln",
  "D",
]);

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

function toggleFunctionArgumentDelimiter(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return null;
  const op = String(expr[0]);
  if (!FUNCTION_OPS_WITH_PAREN_ARGS.has(op)) return null;
  if (expr.length !== 2) return null;

  const arg = expr[1] as MJ;
  if (Array.isArray(arg) && (arg[0] === "Delimiter" || arg[0] === "List")) {
    const toggled = toggleDelimiterNode(arg);
    if (!toggled) return null;
    return [op, toggled] as MJ;
  }

  // For canonical function calls like ["Exp", ["Add", ...]], materialize
  // explicit grouping first so users can toggle to square brackets.
  return [op, ["List", arg] as MJ] as MJ;
}

export function canToggleDelimiterStyle(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree || !selection || selection.kind !== "node") return false;
  const op = tree.nodesById[selection.nodeId]?.op;
  if (op === "Delimiter" || op === "List") return true;
  if (!op || !FUNCTION_OPS_WITH_PAREN_ARGS.has(op)) return false;

  const path = tree.pathById[selection.nodeId];
  if (!path) return false;
  const expr = getAtPath(tree.rootJson, path) as MJ;
  return Array.isArray(expr) && expr.length === 2;
}

export function toggleDelimiterStyle(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  if (!selection || selection.kind !== "node") return null;
  const path = tree.pathById[selection.nodeId];
  if (!path) return null;
  const node = getAtPath(tree.rootJson, path) as MJ;
  const next = toggleDelimiterNode(node) ?? toggleFunctionArgumentDelimiter(node);
  if (!next) return null;
  const nextRoot = setAtPath(tree.rootJson, path, next) as MJ;
  return ExpressionTree.create(nextRoot);
}

