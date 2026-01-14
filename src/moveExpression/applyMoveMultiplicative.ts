import { ExpressionTree, type MJ, type MJNode } from "../ExpressionTree";
import { getAtPath, routeBetween, setAtPath } from "../movePath";
import { normalizeSelection } from "../selectionSemantics";
import type { ApplyMoveArgs } from "./applyMove";

function isOneTerm(mj: MJ): boolean {
  return mj === 1 || mj === "1";
}

function normalizeMul(factors: MJ[]): MJ {
  const filtered = factors.filter((f) => !isOneTerm(f));
  const use = filtered.length === 0 ? [1] : filtered;
  if (use.length === 1) return use[0];
  return ["InvisibleOperator", ...use] as MJNode;
}

function sideOfEqual(
  tree: ExpressionTree,
  equalId: string,
  nodeId: string
): 0 | 1 | null {
  const kids = tree.childrenById[equalId] ?? [];
  if (kids.length < 2) return null;
  if (nodeId === kids[0]) return 0;
  if (nodeId === kids[1]) return 1;
  return null;
}

function sideRootContaining(
  tree: ExpressionTree,
  equalId: string,
  nodeId: string
): { rootId: string; side: 0 | 1 } | null {
  const kids = tree.childrenById[equalId] ?? [];
  if (kids.length < 2) return null;
  const [lhsId, rhsId] = kids;
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === lhsId) return { rootId: lhsId, side: 0 };
    if (cur === rhsId) return { rootId: rhsId, side: 1 };
    cur = tree.parentById[cur] ?? null;
  }
  return null;
}

function isUnderDenominatorOfSideRoot(
  tree: ExpressionTree,
  sideRootId: string,
  nodeId: string
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    const parent = tree.parentById[cur];
    if (!parent) return false;
    const op = tree.nodesById[parent]?.op;
    if (op === "Divide") {
      const idx = tree.childIndexById[cur];
      if (idx === 1) return true;
    }
    if (parent === sideRootId) break;
    cur = parent;
  }
  return false;
}

/**
 * Minimal multiplicative move executor to support cross-equal root division.
 * Future steps will expand to full multiplicative semantics.
 */
export function applyMoveMultiplicative(
  args: ApplyMoveArgs
): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (selectedIds.length !== 1) return null;

  const movedId = normalizeSelection(tree, selectedIds[0]);
  const hover = hoverId;

  const isMulOp = (op?: string) =>
    op === "InvisibleOperator" || op === "Multiply";

  // -------------------------
  // Reorder within the same multiplicative container
  // -------------------------
  const fromParentId = tree.parentById[movedId];
  const fromParentOp = fromParentId ? tree.nodesById[fromParentId]?.op : null;
  const hoverOp = tree.nodesById[hover]?.op;

  let targetMulId: string | null = null;
  if (isMulOp(hoverOp)) {
    targetMulId = hover;
  } else {
    const hoverParent = tree.parentById[hover];
    if (hoverParent && isMulOp(tree.nodesById[hoverParent]?.op)) {
      targetMulId = hoverParent;
    }
  }

  if (
    targetMulId &&
    fromParentId &&
    targetMulId === fromParentId &&
    isMulOp(fromParentOp) &&
    targetSlot != null
  ) {
    const mulPath = tree.pathById[fromParentId];
    if (!mulPath) return null;
    const mulExpr = getAtPath(tree.rootJson, mulPath) as MJNode;
    if (!Array.isArray(mulExpr)) return null;
    const [op, ...factors] = mulExpr;
    if (!isMulOp(op)) return null;
    if (factors.length < 2) return null;

    const fromIndex = factors.findIndex((_, idx) => {
      const childId = tree.childrenById[fromParentId]?.[idx];
      return childId === movedId;
    });
    if (fromIndex < 0) return null;

    const slot = Math.max(0, Math.min(factors.length, targetSlot));
    let toIndex = slot <= fromIndex ? slot : slot - 1;
    toIndex = Math.max(0, Math.min(factors.length - 1, toIndex));
    if (toIndex === fromIndex) return null;

    const movedFactor = factors[fromIndex];
    const rest = factors.filter((_, i) => i !== fromIndex);
    const nextFactors = [
      ...rest.slice(0, toIndex),
      movedFactor,
      ...rest.slice(toIndex),
    ];

    const nextMul: MJNode = [op, ...nextFactors];
    const nextRoot = setAtPath(tree.rootJson, mulPath, nextMul);
    return ExpressionTree.create(nextRoot);
  }

  const route = routeBetween(tree, movedId, hover);
  if (!route) return null;

  const equalId = route.lcaId;
  if (tree.nodesById[equalId]?.op !== "Equal") return null;

  const sideInfoFrom = sideRootContaining(tree, equalId, movedId);
  const sideInfoTo = sideRootContaining(tree, equalId, hover);
  if (!sideInfoFrom || !sideInfoTo) return null;
  if (sideInfoFrom.side === sideInfoTo.side) return null;

  const movedPath = tree.pathById[movedId];
  if (!movedPath) return null;

  const movedExpr = getAtPath(tree.rootJson, movedPath) as MJ;
  const destRootId = sideInfoTo.rootId;
  const destRootPath = tree.pathById[destRootId];
  if (!destRootPath) return null;

  const movedWasDivisor = isUnderDenominatorOfSideRoot(
    tree,
    sideInfoFrom.rootId,
    movedId
  );

  const destHoverNode = tree.nodesById[hover];
  const isMultiplicativeContainer =
    destHoverNode?.op === "InvisibleOperator" ||
    destHoverNode?.op === "Multiply";

  // Replace moved side with multiplicative identity 1
  let nextRoot = setAtPath(tree.rootJson, movedPath, 1);

  if (isMultiplicativeContainer && targetSlot != null) {
    const destPath = tree.pathById[hover];
    if (!destPath) return null;
    const destExpr = getAtPath(nextRoot, destPath) as MJ;
    if (!Array.isArray(destExpr)) return null;
    const [op, ...factors] = destExpr;
    if (op !== "InvisibleOperator" && op !== "Multiply") return null;

    const slot = Math.max(0, Math.min(factors.length, targetSlot));
    const insertion: MJ = movedWasDivisor
      ? movedExpr
      : (["Divide", 1, movedExpr] as MJNode);
    const nextFactors = [
      ...factors.slice(0, slot),
      insertion,
      ...factors.slice(slot),
    ];
    const nextDest = normalizeMul(nextFactors);
    nextRoot = setAtPath(nextRoot, destPath, nextDest);
    return ExpressionTree.create(nextRoot);
  }

  // Default: update the entire destination side.
  const destExpr = getAtPath(nextRoot, destRootPath) as MJ;
  const updatedDest: MJ =
    movedWasDivisor && destExpr
      ? normalizeMul([destExpr, movedExpr])
      : (["Divide", destExpr, movedExpr] as MJNode);
  nextRoot = setAtPath(nextRoot, destRootPath, updatedDest);

  // If the source side root was a Divide and its denominator became 1, collapse it.
  const fromRootPath = tree.pathById[sideInfoFrom.rootId];
  if (fromRootPath) {
    const node = getAtPath(nextRoot, fromRootPath);
    if (
      Array.isArray(node) &&
      node[0] === "Divide" &&
      isOneTerm(node[2] as MJ)
    ) {
      nextRoot = setAtPath(nextRoot, fromRootPath, node[1] as MJ);
    }
  }

  return ExpressionTree.create(nextRoot);
}
