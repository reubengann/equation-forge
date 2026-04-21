import { normalizeMathJson } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

function normalizeExpr(expr: MJ): MJ {
  return (normalizeMathJson(expr) as MJ | null) ?? expr;
}

function toggleNegate(expr: MJ): MJ {
  if (Array.isArray(expr) && expr[0] === "Negate" && expr.length >= 2) {
    return expr[1] as MJ;
  }
  return ["Negate", expr] as MJ;
}

function negateAddTerms(expr: MJ): MJ {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length < 2) {
    return toggleNegate(expr);
  }
  const terms = (expr.slice(1) as MJ[]).map((term) => toggleNegate(term));
  return ["Add", ...terms] as MJ;
}

function transformSelectedExpr(expr: MJ): MJ {
  if (Array.isArray(expr) && expr[0] === "Negate" && expr.length >= 2) {
    const inner = expr[1] as MJ;
    if (Array.isArray(inner) && inner[0] === "Delimiter" && inner.length >= 2) {
      const distributed = negateAddTerms(inner[1] as MJ);
      return ["Delimiter", distributed] as MJ;
    }
  }
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    const inner = expr[1] as MJ;
    if (Array.isArray(inner) && inner[0] === "Add" && inner.length >= 2) {
      return ["Negate", ["Delimiter", negateAddTerms(inner)] as MJ] as MJ;
    }
  }
  return toggleNegate(expr);
}

function negateWholeRoot(root: MJ): MJ {
  if (Array.isArray(root) && root[0] === "Equal" && root.length >= 3) {
    const lhs = toggleNegate(root[1] as MJ);
    const rhs = toggleNegate(root[2] as MJ);
    return ["Equal", lhs, rhs] as MJ;
  }
  return toggleNegate(root);
}

function negateSpan(tree: ExpressionTree, selection: Extract<ExprSelection, { kind: "span" }>): MJ | null {
  const parentPath = tree.pathById[selection.parentId];
  if (parentPath === undefined) return null;
  const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentExpr)) return null;
  const parentOp = String(parentExpr[0]);
  if (parentOp !== "Add" && parentOp !== "InvisibleOperator" && parentOp !== "Multiply") {
    return null;
  }
  const kids = parentExpr.slice(1) as MJ[];
  const { start, end } = selection;
  if (start < 0 || end < start || end >= kids.length) return null;
  const selectedKids = kids.slice(start, end + 1);
  const selectedExpr =
    selectedKids.length === 1
      ? selectedKids[0]
      : ([parentOp === "Add" ? "Add" : "InvisibleOperator", ...selectedKids] as MJ);
  const replacement = transformSelectedExpr(selectedExpr);
  const nextKids = [...kids.slice(0, start), replacement, ...kids.slice(end + 1)];
  const nextParent =
    nextKids.length === 1
      ? nextKids[0]
      : ([parentOp === "Add" ? "Add" : "InvisibleOperator", ...nextKids] as MJ);
  return setAtPath(tree.rootJson, parentPath, nextParent) as MJ;
}

function negateNode(tree: ExpressionTree, nodeId: string): MJ | null {
  const path = tree.pathById[nodeId];
  if (path === undefined) return null;
  const target = getAtPath(tree.rootJson, path) as MJ;
  const replacement = transformSelectedExpr(target);
  return setAtPath(tree.rootJson, path, replacement) as MJ;
}

function computeNegatedRoot(tree: ExpressionTree, selection: ExprSelection | null): MJ | null {
  if (!selection) return negateWholeRoot(tree.rootJson);
  if (selection.kind === "node") return negateNode(tree, selection.nodeId);
  if (selection.kind === "span") return negateSpan(tree, selection);
  if (selection.nodeIds.length === 0) return null;
  return negateNode(tree, selection.nodeIds[0]);
}

export function negateSelection(
  tree: ExpressionTree,
  selection: ExprSelection | null,
): ExpressionTree | null {
  const nextRoot = computeNegatedRoot(tree, selection);
  if (!nextRoot) return null;
  return ExpressionTree.create(normalizeExpr(nextRoot));
}

export function canNegateSelection(
  tree: ExpressionTree | null,
  selection: ExprSelection | null,
): boolean {
  if (!tree) return false;
  return computeNegatedRoot(tree, selection) !== null;
}

