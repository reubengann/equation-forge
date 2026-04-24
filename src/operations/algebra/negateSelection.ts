import { normalizeMathJson } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

function normalizeExpr(expr: MJ): MJ {
  return (normalizeMathJson(expr) as MJ | null) ?? expr;
}

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i] as MJ, b[i] as MJ)) return false;
    }
    return true;
  }
  return a === b;
}

function toggleNegate(expr: MJ): MJ {
  if (Array.isArray(expr) && expr[0] === "Negate" && expr.length >= 2) {
    return expr[1] as MJ;
  }
  return ["Negate", expr] as MJ;
}

function normalizeNegatedDivideNumerator(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Divide" || expr.length < 3) return null;
  const numerator = expr[1] as MJ;
  const denominator = expr[2] as MJ;
  if (!Array.isArray(numerator) || numerator[0] !== "Add" || numerator.length < 2) return null;

  const terms = numerator.slice(1) as MJ[];
  const liftedTerms: MJ[] = [];
  for (const term of terms) {
    if (Array.isArray(term) && term[0] === "Negate" && term.length >= 2) {
      liftedTerms.push(term[1] as MJ);
      continue;
    }
    if (typeof term === "number" && term < 0) {
      liftedTerms.push(Math.abs(term));
      continue;
    }
    return null;
  }

  const positiveNumerator =
    liftedTerms.length === 1 ? (liftedTerms[0] as MJ) : (["Add", ...liftedTerms] as MJ);
  return ["Negate", ["Divide", positiveNumerator, denominator] as MJ] as MJ;
}

function hasNegatedProductFactor(expr: MJ): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] !== "InvisibleOperator" && expr[0] !== "Multiply") return false;
  const factors = expr.slice(1) as MJ[];
  return factors.some(
    (factor) =>
      (Array.isArray(factor) && factor[0] === "Negate" && factor.length >= 2) ||
      (typeof factor === "number" && factor < 0)
  );
}

function negateAddTerms(expr: MJ): MJ {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length < 2) {
    return toggleNegate(expr);
  }
  const terms = (expr.slice(1) as MJ[]).map((term) => toggleNegate(term));
  return ["Add", ...terms] as MJ;
}

function transformSelectedExpr(expr: MJ): MJ {
  const normalizedNegatedDivide = normalizeNegatedDivideNumerator(expr);
  if (normalizedNegatedDivide) return normalizedNegatedDivide;
  if (Array.isArray(expr) && expr[0] === "Negate" && expr.length >= 2) {
    const inner = expr[1] as MJ;
    if (Array.isArray(inner) && inner[0] === "Delimiter" && inner.length >= 2) {
      const distributed = negateAddTerms(inner[1] as MJ);
      return ["Delimiter", distributed] as MJ;
    }
    if (Array.isArray(inner) && inner[0] === "Negate" && inner.length >= 2) {
      // Force-negating an explicit double-negative should collapse to positive.
      return inner[1] as MJ;
    }
    return inner;
  }
  if (
    Array.isArray(expr) &&
    (expr[0] === "Delimiter" || expr[0] === "List") &&
    expr.length >= 2 &&
    Array.isArray(expr[1]) &&
    (expr[1] as MJ[])[0] === "Negate"
  ) {
    // Already explicitly negated inside grouping: keep value unchanged.
    return expr;
  }
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    const inner = expr[1] as MJ;
    if (Array.isArray(inner) && inner[0] === "Add" && inner.length >= 2) {
      return ["Negate", ["Delimiter", negateAddTerms(inner)] as MJ] as MJ;
    }
  }
  if (hasNegatedProductFactor(expr)) return toggleNegate(expr);
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
  const parentId = tree.parentById[nodeId];
  const grandParentId = parentId ? tree.parentById[parentId] : undefined;
  if (
    Array.isArray(target) &&
    (target[0] === "Delimiter" || target[0] === "List") &&
    target.length >= 2 &&
    Array.isArray(target[1]) &&
    (target[1] as MJ[])[0] === "Negate" &&
    (target[1] as MJ[]).length >= 2 &&
    parentId &&
    grandParentId
  ) {
    const parentPath = tree.pathById[parentId];
    const grandParentPath = tree.pathById[grandParentId];
    const parentExpr = parentPath ? (getAtPath(tree.rootJson, parentPath) as MJ) : null;
    const grandParentExpr = grandParentPath
      ? (getAtPath(tree.rootJson, grandParentPath) as MJ)
      : null;
    if (
      parentExpr &&
      Array.isArray(parentExpr) &&
      (parentExpr[0] === "InvisibleOperator" || parentExpr[0] === "Multiply") &&
      grandParentExpr &&
      Array.isArray(grandParentExpr) &&
      grandParentExpr[0] === "Negate" &&
      tree.childrenById[grandParentId]?.[0] === parentId
    ) {
      const parentKids = (parentExpr.slice(1) as MJ[]).map((kid) =>
        deepEqualMJ(kid, target)
          ? ([target[0], (target[1] as MJ[])[1] as MJ] as MJ)
          : kid
      );
      const rebuiltParent = [parentExpr[0], ...parentKids] as MJ;
      return setAtPath(tree.rootJson, grandParentPath, rebuiltParent) as MJ;
    }
  }
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

