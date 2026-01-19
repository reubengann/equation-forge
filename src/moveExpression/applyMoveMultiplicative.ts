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

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; sideRootId: string; sideSlot: 0 | 1 } | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return null;
    if (tree.nodesById[parentId]?.op === "Equal") {
      const kids = tree.childrenById[parentId] ?? [];
      if (kids.length >= 2) {
        const lhsId = kids[0];
        const rhsId = kids[1];
        if (cur === lhsId)
          return { equalId: parentId, sideRootId: lhsId, sideSlot: 0 };
        if (cur === rhsId)
          return { equalId: parentId, sideRootId: rhsId, sideSlot: 1 };
      }
      return null;
    }
    cur = parentId;
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
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return false;
    const op = tree.nodesById[parentId]?.op;
    if (op === "Divide") {
      const idx = tree.childIndexById[cur];
      if (idx === 1) return true;
    }
    if (parentId === sideRootId) break;
    cur = parentId;
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
  if (!hover) return null;
  const hoverNodeId = hover;

  const isMulOp = (op?: string) =>
    op === "InvisibleOperator" || op === "Multiply";
  const isDotOp = (op?: string) => op === "DotProduct";

  // -------------------------
  // Reorder within the same multiplicative container
  // -------------------------
  const fromParentId = tree.parentById[movedId];
  if (!fromParentId) return null;
  const fromParentOp = tree.nodesById[fromParentId]?.op;
  const hoverOp = tree.nodesById[hoverNodeId]?.op;

  // -------------------------
  // Reorder within a DotProduct (commutative swap)
  // -------------------------
  if (
    isDotOp(fromParentOp) &&
    targetSlot != null &&
    (hoverNodeId === fromParentId ||
      tree.parentById[hoverNodeId] === fromParentId)
  ) {
    const dotPath = tree.pathById[fromParentId];
    if (!dotPath) return null;
    const dotExpr = getAtPath(tree.rootJson, dotPath) as MJNode;
    if (!Array.isArray(dotExpr) || dotExpr[0] !== "DotProduct") return null;
    const operands = dotExpr.slice(1);
    if (operands.length !== 2) return null;

    const siblings = tree.childrenById[fromParentId] ?? [];
    const fromIndex = siblings.indexOf(movedId);
    if (fromIndex < 0) return null;

    const slot = Math.max(0, Math.min(operands.length, targetSlot));
    let toIndex = slot <= fromIndex ? slot : slot - 1;
    toIndex = Math.max(0, Math.min(operands.length - 1, toIndex));
    if (toIndex === fromIndex) return null;

    const reordered = [...operands];
    const [movedOp] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, movedOp);
    const nextDot: MJNode = ["DotProduct", ...reordered];
    const nextRoot = setAtPath(tree.rootJson, dotPath, nextDot);
    return ExpressionTree.create(nextRoot);
  }

  let targetMulId: string | null = null;
  if (isMulOp(hoverOp)) {
    targetMulId = hover;
  } else {
    const hoverParentId = tree.parentById[hoverNodeId];
    if (hoverParentId && isMulOp(tree.nodesById[hoverParentId]?.op)) {
      targetMulId = hoverParentId;
    }
  }

  if (
    targetMulId &&
    fromParentId &&
    targetMulId === fromParentId &&
    isMulOp(fromParentOp) &&
    targetSlot != null
  ) {
    const mulPath = tree.pathById[fromParentId as string];
    if (!mulPath) return null;
    const mulExpr = getAtPath(tree.rootJson, mulPath) as MJNode;
    if (!Array.isArray(mulExpr)) return null;
    const [mulOp, ...factors] = mulExpr;
    if (!isMulOp(mulOp)) return null;
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

    const nextMul: MJNode = [mulOp, ...nextFactors];
    const nextRoot = setAtPath(tree.rootJson, mulPath, nextMul);
    return ExpressionTree.create(nextRoot);
  }

  // Merge a sibling factor into the numerator of a fraction within the same product.
  if (
    targetSlot === null &&
    tree.nodesById[hoverNodeId]?.op === "Divide" &&
    fromParentId &&
    tree.parentById[hoverNodeId] === fromParentId &&
    isMulOp(fromParentOp) &&
    hoverNodeId !== movedId
  ) {
    const parentPath = tree.pathById[fromParentId as string];
    const movedPath = tree.pathById[movedId];
    const dividePath = tree.pathById[hoverNodeId];
    if (!parentPath || !movedPath || !dividePath) return null;

    const parentExpr = getAtPath(tree.rootJson, parentPath) as MJNode;
    if (!Array.isArray(parentExpr)) return null;
    const [parentOp, ...factors] = parentExpr;
    if (!isMulOp(parentOp)) return null;
    if (factors.length < 2) return null;

    const siblings = tree.childrenById[fromParentId] ?? [];
    const movedIndex = siblings.indexOf(movedId);
    const divideIndex = siblings.indexOf(hoverNodeId);
    if (movedIndex < 0 || divideIndex < 0) return null;

    const divideExpr = getAtPath(tree.rootJson, dividePath) as MJNode;
    if (!Array.isArray(divideExpr) || divideExpr[0] !== "Divide") return null;
    const numeratorId = tree.childrenById[hoverNodeId]?.[0];
    const numeratorExpr =
      numeratorId && tree.pathById[numeratorId]
        ? (getAtPath(tree.rootJson, tree.pathById[numeratorId]!) as MJ)
        : (divideExpr[1] as MJ);
    const denominatorExpr = divideExpr[2] as MJ;

    const movedExpr = getAtPath(tree.rootJson, movedPath) as MJ;
    const mergedNumerator = normalizeMul([numeratorExpr, movedExpr]);
    const updatedDivide: MJNode = ["Divide", mergedNumerator, denominatorExpr];

    const nextFactors: MJ[] = [];
    for (let i = 0; i < factors.length; i += 1) {
      if (i === movedIndex) continue;
      if (i === divideIndex) {
        nextFactors.push(updatedDivide);
        continue;
      }
      nextFactors.push(factors[i]);
    }

    const normalizedParent = normalizeMul(nextFactors);
    const nextRoot = setAtPath(tree.rootJson, parentPath, normalizedParent);
    return ExpressionTree.create(nextRoot);
  }

  const route = routeBetween(tree, movedId, hoverNodeId);
  if (!route) return null;

  const equalId = route.lcaId;
  if (tree.nodesById[equalId]?.op !== "Equal") return null;

  const sideInfoFrom = findEqualSideRoot(tree, movedId);
  const sideInfoTo = findEqualSideRoot(tree, hoverNodeId);
  if (!sideInfoFrom || !sideInfoTo) return null;
  if (sideInfoFrom.sideSlot === sideInfoTo.sideSlot) return null;

  const movedPath = tree.pathById[movedId];
  if (!movedPath) return null;

  const movedExpr = getAtPath(tree.rootJson, movedPath) as MJ;
  const destRootId = sideInfoTo.sideRootId;
  const destRootPath = tree.pathById[destRootId];
  if (!destRootPath) return null;

  const movedWasDivisor = isUnderDenominatorOfSideRoot(
    tree,
    sideInfoFrom.sideRootId,
    movedId
  );

  const destHoverNode = tree.nodesById[hover];
  const isMultiplicativeContainer =
    destHoverNode?.op === "InvisibleOperator" ||
    destHoverNode?.op === "Multiply";

  // Remove the moved factor from its origin.
  let nextRoot: MJ = tree.rootJson;
  const movedParentId = tree.parentById[movedId];
  const movedParentOp = movedParentId
    ? tree.nodesById[movedParentId]?.op
    : null;
  const movedParentPath = movedParentId ? tree.pathById[movedParentId] : null;

  if (
    movedParentId &&
    movedParentPath &&
    (movedParentOp === "InvisibleOperator" || movedParentOp === "Multiply")
  ) {
    const mulExpr = getAtPath(nextRoot, movedParentPath) as MJNode;
    const [, ...factors] = mulExpr;
    const idx = (tree.childrenById[movedParentId] ?? []).indexOf(movedId);
    if (idx < 0) return null;
    const remaining = factors.filter((_, i) => i !== idx);
    const normalized = normalizeMul(remaining);
    nextRoot = setAtPath(nextRoot, movedParentPath, normalized);
  } else {
    // Fallback: replace with 1 if not under a multiplicative container.
    nextRoot = setAtPath(nextRoot, movedPath, 1);
  }

  // Check if hover is the destination side root
  const isHoveringSideRoot = hoverNodeId === destRootId;

  if (isMultiplicativeContainer && targetSlot != null) {
    // Inserting into a multiplicative container (product)
    const destPath = tree.pathById[hoverNodeId];
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

  // Handle side root drops: whole division vs edge insertion
  if (isHoveringSideRoot) {
    const destExpr = getAtPath(nextRoot, destRootPath) as MJ;
    let updatedDest: MJ;

    if (targetSlot === null) {
      // Whole division: divide the entire expression
      if (movedWasDivisor && destExpr) {
        // denom moved across → multiply dest by moved
        updatedDest = normalizeMul([destExpr, movedExpr]);
      } else {
        updatedDest = ["Divide", destExpr, movedExpr] as MJNode;
        // Normalize Divide(expr, 1) to expr
        if (
          Array.isArray(updatedDest) &&
          updatedDest[0] === "Divide" &&
          isOneTerm(updatedDest[2] as MJ)
        ) {
          updatedDest = updatedDest[1] as MJ;
        }
      }
    } else if (targetSlot === 0) {
      // Left edge: multiply by reciprocal before
      const reciprocal: MJ = movedWasDivisor
        ? movedExpr
        : (["Divide", 1, movedExpr] as MJNode);
      // Wrap destExpr in delimiter if it's an Add to preserve grouping
      const wrappedDest =
        Array.isArray(destExpr) && destExpr[0] === "Add"
          ? (["Delimiter", destExpr] as MJNode)
          : destExpr;
      updatedDest = normalizeMul([reciprocal, wrappedDest]);
    } else {
      // Right edge (targetSlot === 1): multiply by reciprocal after
      const reciprocal: MJ = movedWasDivisor
        ? movedExpr
        : (["Divide", 1, movedExpr] as MJNode);
      // Wrap destExpr in delimiter if it's an Add to preserve grouping
      const wrappedDest =
        Array.isArray(destExpr) && destExpr[0] === "Add"
          ? (["Delimiter", destExpr] as MJNode)
          : destExpr;
      updatedDest = normalizeMul([wrappedDest, reciprocal]);
    }
    nextRoot = setAtPath(nextRoot, destRootPath, updatedDest);
  } else {
    // Default: update the entire destination side (fallback for non-side-root hovers)
    const destExpr = getAtPath(nextRoot, destRootPath) as MJ;
    let updatedDest: MJ;
    if (movedWasDivisor && destExpr) {
      // denom moved across → multiply dest by moved
      updatedDest = normalizeMul([destExpr, movedExpr]);
    } else {
      updatedDest = ["Divide", destExpr, movedExpr] as MJNode;
      // Normalize Divide(expr, 1) to expr
      if (
        Array.isArray(updatedDest) &&
        updatedDest[0] === "Divide" &&
        isOneTerm(updatedDest[2] as MJ)
      ) {
        updatedDest = updatedDest[1] as MJ;
      }
    }
    nextRoot = setAtPath(nextRoot, destRootPath, updatedDest);
  }

  // If the source side root was a Divide and its denominator became 1, collapse it.
  const fromRootPath = tree.pathById[sideInfoFrom.sideRootId];
  if (fromRootPath) {
    const node = getAtPath(nextRoot, fromRootPath);
    if (
      Array.isArray(node) &&
      node[0] === "Divide" &&
      isOneTerm(node[2] as MJ)
    ) {
      nextRoot = setAtPath(nextRoot, fromRootPath, node[1] as MJ);
      // If the numerator is itself a Divide(...,1), collapse it too.
      const numerator = node[1] as MJ;
      if (
        Array.isArray(numerator) &&
        numerator[0] === "Divide" &&
        isOneTerm(numerator[2] as MJ)
      ) {
        nextRoot = setAtPath(nextRoot, fromRootPath, numerator[1] as MJ);
      }
    }
  }

  return ExpressionTree.create(nextRoot);
}
