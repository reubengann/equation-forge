import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { normalizeMathJson } from "../../computeEngine";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

type DeclareFunctionCandidate = {
  productId: string;
  path: number[];
  fnExpr: MJ;
  argExpr: MJ;
};

function isSingleAtom(expr: MJ): boolean {
  return !Array.isArray(expr);
}

function asDeclareCandidate(
  tree: ExpressionTree,
  productId: string
): DeclareFunctionCandidate | null {
  if (tree.nodesById[productId]?.op !== "InvisibleOperator") return null;
  const childIds = tree.childrenById[productId] ?? [];
  if (childIds.length !== 2) return null;

  const path = tree.pathById[productId];
  if (!path) return null;
  const productExpr = getAtPath(tree.rootJson, path) as MJ;
  if (!Array.isArray(productExpr) || productExpr[0] !== "InvisibleOperator") {
    return null;
  }

  const fnExpr = productExpr[1] as MJ;
  const argGroup = productExpr[2] as MJ;
  if (!isSingleAtom(fnExpr)) return null;
  if (!Array.isArray(argGroup) || argGroup[0] !== "Delimiter") return null;
  const argExpr = (argGroup[1] ?? null) as MJ | null;
  if (argExpr == null || !isSingleAtom(argExpr)) return null;

  return { productId, path, fnExpr, argExpr };
}

function selectionToProductId(
  tree: ExpressionTree,
  selection: ExprSelection | null
): string | null {
  if (!selection) return null;

  if (selection.kind === "node") {
    return selection.nodeId;
  }

  if (selection.kind === "span") {
    if (selection.op !== "InvisibleOperator") return null;
    if (selection.end - selection.start !== 1) return null;
    const siblings = tree.childrenById[selection.parentId] ?? [];
    if (siblings.length !== 2) return null;
    if (selection.start !== 0 || selection.end !== 1) return null;
    return selection.parentId;
  }

  const ids = Array.from(new Set(selection.nodeIds));
  if (ids.length !== 2) return null;
  const parentId = tree.parentById[ids[0]];
  if (!parentId) return null;
  if (!ids.every((id) => tree.parentById[id] === parentId)) return null;
  if (tree.nodesById[parentId]?.op !== "InvisibleOperator") return null;

  const siblings = tree.childrenById[parentId] ?? [];
  if (siblings.length !== 2) return null;

  const indices = ids
    .map((id) => tree.childIndexById[id])
    .filter((idx): idx is number => idx !== undefined)
    .sort((a, b) => a - b);
  if (indices.length !== 2) return null;
  if (indices[0] !== 0 || indices[1] !== 1) return null;

  return parentId;
}

function getDeclareFunctionCandidate(
  tree: ExpressionTree,
  selection: ExprSelection | null
): DeclareFunctionCandidate | null {
  const productId = selectionToProductId(tree, selection);
  if (!productId) return null;
  return asDeclareCandidate(tree, productId);
}

export function canDeclareFunction(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree) return false;
  return getDeclareFunctionCandidate(tree, selection) !== null;
}

export function declareFunction(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  const candidate = getDeclareFunctionCandidate(tree, selection);
  if (!candidate) return null;

  const nextExpr: MJ = ["Apply", candidate.fnExpr, candidate.argExpr];
  const nextRoot = setAtPath(tree.rootJson, candidate.path, nextExpr) as MJ;
  const normalized = (normalizeMathJson(nextRoot) ?? nextRoot) as MJ;
  return ExpressionTree.create(normalized);
}

