import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { normalizeMathJson } from "../../computeEngine";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

function forceOrUnforceDelimiter(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return ["Delimiter", expr] as MJ;
  if (expr[0] === "Negate" && expr.length >= 2) {
    const inner = expr[1] as MJ;
    if (
      Array.isArray(inner) &&
      (inner[0] === "Delimiter" || inner[0] === "List") &&
      inner.length >= 2
    ) {
      return ["Negate", (inner[1] as MJ)] as MJ;
    }
  }
  if (expr[0] === "Delimiter" || expr[0] === "List") {
    const inner = (expr[1] ?? null) as MJ | null;
    if (inner == null) return null;
    return inner;
  }
  if (expr[0] === "Abs") {
    const inner = (expr[1] ?? null) as MJ | null;
    if (inner == null) return null;
    return inner;
  }
  return ["Delimiter", expr] as MJ;
}

function normalizedRoot(root: MJ): MJ {
  const normalized = (normalizeMathJson(root) ?? root) as MJ;
  const signNormalized = normalizeAddTermSignsRecursively(normalized);
  return simplifyUnaryNegates(signNormalized);
}

function simplifyUnaryNegates(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((k) => simplifyUnaryNegates(k as MJ));
  if (op === "Negate" && kids.length >= 1) {
    const inner = kids[0] as MJ;
    if (Array.isArray(inner) && inner[0] === "Negate" && inner.length >= 2) {
      return inner[1] as MJ;
    }
  }
  return [op, ...kids] as MJ;
}

function absoluteNumericMJ(value: MJ): MJ | null {
  if (typeof value === "number" && Number.isFinite(value) && value < 0) {
    return Math.abs(value);
  }
  if (typeof value === "string" && /^-\d+(?:\.\d+)?$/.test(value)) {
    return value.slice(1);
  }
  return null;
}

function normalizeNegativeAddTerm(expr: MJ): MJ {
  const extractLeadingNegatedFactor = (value: MJ): MJ | null => {
    if (Array.isArray(value) && value[0] === "Negate" && value.length >= 2) {
      return value[1] as MJ;
    }
    if (
      Array.isArray(value) &&
      (value[0] === "Delimiter" || value[0] === "List") &&
      value.length >= 2 &&
      Array.isArray(value[1]) &&
      (value[1] as MJ[])[0] === "Negate" &&
      (value[1] as MJ[]).length >= 2
    ) {
      const lifted = (value[1] as MJ[])[1] as MJ;
      if (
        Array.isArray(lifted) &&
        (lifted[0] === "Delimiter" || lifted[0] === "List") &&
        lifted.length >= 2
      ) {
        return lifted;
      }
      return [value[0], lifted] as MJ;
    }
    return null;
  };

  const absScalar = absoluteNumericMJ(expr);
  if (absScalar !== null) return ["Negate", absScalar] as MJ;

  const directNegated = extractLeadingNegatedFactor(expr);
  if (directNegated !== null) return ["Negate", directNegated] as MJ;

  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  if (op !== "InvisibleOperator" && op !== "Multiply") return expr;

  const factors = expr.slice(1) as MJ[];
  if (factors.length === 0) return expr;
  const firstAbs = absoluteNumericMJ(factors[0] as MJ);
  const firstNegatedFactor = extractLeadingNegatedFactor(factors[0] as MJ);
  if (firstAbs === null && firstNegatedFactor === null) return expr;
  const firstPositive = firstAbs !== null ? firstAbs : firstNegatedFactor;
  const rest = [firstPositive as MJ, ...factors.slice(1)] as MJ[];
  const product = rest.length === 1 ? rest[0] : ([op, ...rest] as MJ);
  return ["Negate", product] as MJ;
}

function normalizeNegativeTermsInAdd(expr: MJ): MJ {
  if (!Array.isArray(expr) || expr[0] !== "Add") return expr;
  const terms = (expr.slice(1) as MJ[]).map((term) => normalizeNegativeAddTerm(term));
  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0] as MJ;
  return ["Add", ...terms] as MJ;
}

function normalizeAddTermSignsRecursively(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((term) => normalizeAddTermSignsRecursively(term as MJ));
  const rebuilt = [op, ...kids] as MJ;
  if (op === "Add") return normalizeNegativeTermsInAdd(rebuilt);
  return rebuilt;
}

export function canForceDelimiter(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree || !selection) return false;
  if (selection.kind === "node") return true;
  if (selection.kind === "span") return true;
  return !!multiSelectionAsSpan(tree, selection);
}

export function forceDelimiter(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  if (!selection) return null;

  if (selection.kind === "node") {
    const path = tree.pathById[selection.nodeId];
    if (!path) return null;
    const node = getAtPath(tree.rootJson, path) as MJ;
    const next = forceOrUnforceDelimiter(node);
    if (!next) return null;
    const nextRoot = normalizedRoot(setAtPath(tree.rootJson, path, next) as MJ);
    return ExpressionTree.create(nextRoot);
  }

  const span =
    selection.kind === "span" ? selection : multiSelectionAsSpan(tree, selection);
  if (!span) return null;

  const parentPath = tree.pathById[span.parentId];
  if (!parentPath) return null;
  const parentExpr = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentExpr) || parentExpr.length < 2) return null;
  const parentOp = parentExpr[0] as MJ;
  const kids = parentExpr.slice(1) as MJ[];
  if (span.start < 0 || span.end >= kids.length || span.start > span.end) return null;

  const selected = kids.slice(span.start, span.end + 1);
  const grouped: MJ =
    selected.length === 1 ? selected[0] : ([span.op, ...selected] as MJ);
  const wrapped = forceOrUnforceDelimiter(grouped);
  if (!wrapped) return null;

  const nextKids = [
    ...kids.slice(0, span.start),
    wrapped,
    ...kids.slice(span.end + 1),
  ] as MJ[];
  const nextParent = [parentOp, ...nextKids] as MJ;
  const nextRoot = normalizedRoot(setAtPath(tree.rootJson, parentPath, nextParent) as MJ);
  return ExpressionTree.create(nextRoot);
}

function multiSelectionAsSpan(
  tree: ExpressionTree,
  selection: ExprSelection
): { parentId: string; op: "Add" | "InvisibleOperator"; start: number; end: number } | null {
  if (selection.kind !== "multi") return null;
  const ids = Array.from(new Set(selection.nodeIds));
  if (ids.length < 2) return null;

  const firstParent = tree.parentById[ids[0]];
  if (!firstParent) return null;
  if (!ids.every((id) => tree.parentById[id] === firstParent)) return null;

  const parentOpRaw = tree.nodesById[firstParent]?.op;
  if (parentOpRaw !== "Add" && parentOpRaw !== "InvisibleOperator" && parentOpRaw !== "Multiply") {
    return null;
  }
  const op: "Add" | "InvisibleOperator" =
    parentOpRaw === "Add" ? "Add" : "InvisibleOperator";

  const indices = ids
    .map((id) => tree.childIndexById[id])
    .filter((idx): idx is number => idx !== undefined)
    .sort((a, b) => a - b);
  if (indices.length !== ids.length) return null;
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) return null;
  }

  return {
    parentId: firstParent,
    op,
    start: indices[0],
    end: indices[indices.length - 1],
  };
}

