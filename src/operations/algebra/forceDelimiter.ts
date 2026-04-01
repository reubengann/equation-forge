import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

function forceOrUnforceDelimiter(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return ["Delimiter", expr] as MJ;
  if (expr[0] === "Delimiter" || expr[0] === "List") {
    const inner = (expr[1] ?? null) as MJ | null;
    if (inner == null) return null;
    return inner;
  }
  return ["Delimiter", expr] as MJ;
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
    const nextRoot = setAtPath(tree.rootJson, path, next) as MJ;
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
  const nextRoot = setAtPath(tree.rootJson, parentPath, nextParent) as MJ;
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

