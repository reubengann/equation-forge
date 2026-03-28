import { ExpressionTree, type MJ, type MJNode } from "../ExpressionTree";
import { getAtPath, routeBetween, setAtPath } from "../movePath";
import { normalizeSelection } from "../selectionSemantics";
import type { ApplyMoveArgs } from "./applyMove";

function isOneTerm(mj: MJ): boolean {
  return mj === 1 || mj === "1";
}

function isAncestorOrSelf(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string | null | undefined
): boolean {
  let cur: string | null | undefined = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function findIntegrateAncestor(
  tree: ExpressionTree,
  nodeId: string | null
): string | null {
  let cur: string | null = nodeId;
  while (cur) {
    const op = tree.nodesById[cur]?.op;
    if (op === "Integrate") return cur;
    cur = tree.parentById[cur] ?? null;
  }
  return null;
}

function normalizeMul(factors: MJ[]): MJ {
  const flattened: MJ[] = [];
  for (const f of factors) {
    if (
      Array.isArray(f) &&
      (f[0] === "InvisibleOperator" || f[0] === "Multiply")
    ) {
      flattened.push(...(f.slice(1) as MJ[]));
    } else {
      flattened.push(f);
    }
  }

  const filtered = flattened.filter((f) => !isOneTerm(f));
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
  if (selectedIds.length < 1) return null;
  const normalizedSelectedIds = Array.from(
    new Set(selectedIds.map((id) => normalizeSelection(tree, id)))
  );
  if (normalizedSelectedIds.length < 1) return null;

  const movedId = normalizedSelectedIds[0];
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
  const movedIdsInFromParent = normalizedSelectedIds.filter(
    (id) => tree.parentById[id] === fromParentId
  );

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
    targetSlot != null &&
    !(
      tree.nodesById[hoverNodeId]?.op === "Divide" &&
      tree.parentById[hoverNodeId] === fromParentId &&
      hoverNodeId !== movedId
    ) &&
    !(
      tree.nodesById[hoverNodeId]?.op === "Delimiter" &&
      tree.parentById[hoverNodeId] === fromParentId &&
      hoverNodeId !== movedId
    )
  ) {
    const mulPath = tree.pathById[fromParentId as string];
    if (!mulPath) return null;
    const mulExpr = getAtPath(tree.rootJson, mulPath) as MJNode;
    if (!Array.isArray(mulExpr)) return null;
    const [mulOp, ...factors] = mulExpr;
    if (!isMulOp(mulOp)) return null;
    if (factors.length < 2) return null;

    const siblings = tree.childrenById[fromParentId] ?? [];
    const movedIds =
      movedIdsInFromParent.length > 0 ? movedIdsInFromParent : [movedId];
    const movedIndices = movedIds
      .map((id) => siblings.indexOf(id))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b);
    if (movedIndices.length === 0) return null;

    const slot = Math.max(0, Math.min(factors.length, targetSlot));
    const movedIndexSet = new Set<number>(movedIndices);
    const movedCountBeforeSlot = movedIndices.filter((i) => i < slot).length;
    const insertionIndex = Math.max(0, slot - movedCountBeforeSlot);

    const movedFactorExpr = normalizeMul(
      movedIndices.map((i) => factors[i]).filter((f): f is MJ => f !== undefined)
    );
    const rest = factors.filter((_, i) => !movedIndexSet.has(i));
    const nextFactors = [
      ...rest.slice(0, insertionIndex),
      movedFactorExpr,
      ...rest.slice(insertionIndex),
    ];

    const nextMul = normalizeMul(nextFactors);
    const nextRoot = setAtPath(tree.rootJson, mulPath, nextMul);
    return ExpressionTree.create(nextRoot);
  }

  // Pull selected factors out of a parenthesized product into its outer product.
  if (targetSlot != null && isMulOp(fromParentOp)) {
    const delimiterId = tree.parentById[fromParentId];
    const delimiterOp = delimiterId ? tree.nodesById[delimiterId]?.op : null;
    const outerMulId = delimiterId ? tree.parentById[delimiterId] : null;
    const outerMulOp = outerMulId ? tree.nodesById[outerMulId]?.op : null;
    const hoverInOuterMul =
      !!outerMulId &&
      (hoverNodeId === outerMulId || tree.parentById[hoverNodeId] === outerMulId);

    if (
      delimiterId &&
      delimiterOp === "Delimiter" &&
      outerMulId &&
      isMulOp(outerMulOp) &&
      hoverInOuterMul
    ) {
      const fromMulPath = tree.pathById[fromParentId];
      const outerMulPath = tree.pathById[outerMulId];
      if (!fromMulPath || !outerMulPath) return null;

      const fromMulExpr = getAtPath(tree.rootJson, fromMulPath) as MJNode;
      if (!Array.isArray(fromMulExpr)) return null;
      const [fromOp, ...fromFactors] = fromMulExpr;
      if (!isMulOp(fromOp)) return null;

      const fromKids = tree.childrenById[fromParentId] ?? [];
      const selectedIndices = movedIdsInFromParent
        .map((id) => fromKids.indexOf(id))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);
      if (selectedIndices.length === 0) return null;

      const selectedSet = new Set<number>(selectedIndices);
      const movedExpr = normalizeMul(
        selectedIndices
          .map((idx) => fromFactors[idx])
          .filter((f): f is MJ => f !== undefined)
      );
      const remainingInner = normalizeMul(
        fromFactors.filter((_, i) => !selectedSet.has(i))
      );

      let nextRoot = setAtPath(tree.rootJson, fromMulPath, remainingInner);

      const outerExpr = getAtPath(nextRoot, outerMulPath) as MJNode;
      if (!Array.isArray(outerExpr)) return null;
      const [outerOp, ...outerFactors] = outerExpr;
      if (!isMulOp(outerOp)) return null;

      const slot = Math.max(0, Math.min(outerFactors.length, targetSlot));
      const nextOuterFactors = [
        ...outerFactors.slice(0, slot),
        movedExpr,
        ...outerFactors.slice(slot),
      ];
      nextRoot = setAtPath(nextRoot, outerMulPath, normalizeMul(nextOuterFactors));
      return ExpressionTree.create(nextRoot);
    }
  }

  // Factor a term out of an integral’s integrand (before/after the integral).
  if (targetSlot != null) {
    const directIntegrate =
      tree.nodesById[hoverNodeId]?.op === "Integrate" ? hoverNodeId : null;
    const integrateId =
      directIntegrate ?? findIntegrateAncestor(tree, hoverNodeId);

    if (integrateId) {
      const integrandId = tree.childrenById[integrateId]?.[0];
      if (integrandId && isAncestorOrSelf(tree, integrandId, movedId)) {
        // Find multiplicative ancestor within integrand; if none, treat integrand itself as the container.
        let mulId: string | null = tree.parentById[movedId] ?? null;
        while (
          mulId &&
          !isMulOp(tree.nodesById[mulId]?.op) &&
          isAncestorOrSelf(tree, integrandId, mulId)
        ) {
          mulId = tree.parentById[mulId] ?? null;
        }

        const containerId =
          mulId &&
          isMulOp(tree.nodesById[mulId]?.op) &&
          isAncestorOrSelf(tree, integrandId, mulId)
            ? mulId
            : integrandId;

        const movedPath = tree.pathById[movedId];
        const containerPath = tree.pathById[containerId];
        const integratePath = tree.pathById[integrateId];
        const integrandPath = tree.pathById[integrandId];
        if (!movedPath || !containerPath || !integratePath || !integrandPath)
          return null;

        const movedExpr = getAtPath(tree.rootJson, movedPath) as MJ;

        let nextRoot: MJ = tree.rootJson;
        let updatedIntegrand: MJ;

        const containerOp = tree.nodesById[containerId]?.op;
        if (isMulOp(containerOp)) {
          const mulExpr = getAtPath(nextRoot, containerPath) as MJNode;
          if (!Array.isArray(mulExpr)) return null;
          const [, ...factors] = mulExpr;
          const siblings = tree.childrenById[containerId] ?? [];
          const fromIndex = siblings.indexOf(movedId);
          if (fromIndex < 0 || fromIndex >= factors.length) return null;

          const remainingFactors = factors.filter((_, i) => i !== fromIndex);
          const normalizedMul = normalizeMul(remainingFactors as MJ[]);
          nextRoot = setAtPath(nextRoot, containerPath, normalizedMul);

          updatedIntegrand = getAtPath(nextRoot, integrandPath) as MJ;
        } else {
          // Container is the integrand root and not a multiplicative op: removing the single term leaves 1.
          updatedIntegrand = 1;
          nextRoot = setAtPath(nextRoot, integrandPath, updatedIntegrand);
        }

        const integrateExpr = getAtPath(nextRoot, integratePath) as MJNode;
        if (!Array.isArray(integrateExpr) || integrateExpr[0] !== "Integrate")
          return null;

        const updatedIntegrate: MJNode = [
          "Integrate",
          updatedIntegrand,
          ...integrateExpr.slice(2),
        ];

        const wrapped = normalizeMul(
          targetSlot === 0
            ? ([movedExpr, updatedIntegrate] as MJ[])
            : ([updatedIntegrate, movedExpr] as MJ[])
        );

        nextRoot = setAtPath(nextRoot, integratePath, wrapped);

        // Normalize the parent multiplicative container (if any) to flatten nested products.
        const integrateParentId = tree.parentById[integrateId];
        if (integrateParentId) {
          const parentOp = tree.nodesById[integrateParentId]?.op;
          if (isMulOp(parentOp)) {
            const parentPath = tree.pathById[integrateParentId];
            if (parentPath) {
              const parentExpr = getAtPath(nextRoot, parentPath) as MJNode;
              if (Array.isArray(parentExpr)) {
                const [, ...parentFactors] = parentExpr;
                const normalizedParent = normalizeMul(parentFactors as MJ[]);
                nextRoot = setAtPath(nextRoot, parentPath, normalizedParent);
              }
            }
          }
        }

        return ExpressionTree.create(nextRoot);
      }
    }
  }

  // Merge a sibling factor into the numerator of a fraction within the same product.
  if (
    (targetSlot === null || targetSlot === 0 || targetSlot === 1) &&
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
    const movedIds =
      movedIdsInFromParent.length > 0 ? movedIdsInFromParent : [movedId];
    const movedIndices = movedIds
      .map((id) => siblings.indexOf(id))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b);
    const movedIndex = movedIndices[0] ?? -1;
    const divideIndex = siblings.indexOf(hoverNodeId);
    if (movedIndex < 0 || divideIndex < 0 || movedIndices.length === 0) return null;

    const divideExpr = getAtPath(tree.rootJson, dividePath) as MJNode;
    if (!Array.isArray(divideExpr) || divideExpr[0] !== "Divide") return null;
    const numeratorId = tree.childrenById[hoverNodeId]?.[0];
    const numeratorExpr =
      numeratorId && tree.pathById[numeratorId]
        ? (getAtPath(tree.rootJson, tree.pathById[numeratorId]!) as MJ)
        : (divideExpr[1] as MJ);
    const denominatorExpr = divideExpr[2] as MJ;

    const movedExpr =
      movedIndices.length === 1
        ? ((getAtPath(tree.rootJson, movedPath) as MJ) ?? factors[movedIndex])
        : normalizeMul(
            movedIndices
              .map((idx) => factors[idx])
              .filter((f): f is MJ => f !== undefined)
          );
    const mergedNumerator =
      targetSlot === 0
        ? normalizeMul([movedExpr, numeratorExpr])
        : normalizeMul([numeratorExpr, movedExpr]);
    const updatedDivide: MJNode = ["Divide", mergedNumerator, denominatorExpr];

    const nextFactors: MJ[] = [];
    const movedIndexSet = new Set<number>(movedIndices);
    for (let i = 0; i < factors.length; i += 1) {
      if (movedIndexSet.has(i)) continue;
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

  // Merge a sibling factor into a parenthesized product within the same product.
  if (
    (targetSlot === 0 || targetSlot === 1) &&
    tree.nodesById[hoverNodeId]?.op === "Delimiter" &&
    fromParentId &&
    tree.parentById[hoverNodeId] === fromParentId &&
    isMulOp(fromParentOp) &&
    hoverNodeId !== movedId
  ) {
    const parentPath = tree.pathById[fromParentId as string];
    const movedPath = tree.pathById[movedId];
    const delimiterPath = tree.pathById[hoverNodeId];
    if (!parentPath || !movedPath || !delimiterPath) return null;

    const parentExpr = getAtPath(tree.rootJson, parentPath) as MJNode;
    if (!Array.isArray(parentExpr)) return null;
    const [parentOp, ...factors] = parentExpr;
    if (!isMulOp(parentOp)) return null;
    if (factors.length < 2) return null;

    const siblings = tree.childrenById[fromParentId] ?? [];
    const movedIndex = siblings.indexOf(movedId);
    const delimiterIndex = siblings.indexOf(hoverNodeId);
    if (movedIndex < 0 || delimiterIndex < 0 || movedIndex === delimiterIndex) {
      return null;
    }

    const delimiterExpr = getAtPath(tree.rootJson, delimiterPath) as MJNode;
    if (!Array.isArray(delimiterExpr) || delimiterExpr[0] !== "Delimiter") {
      return null;
    }
    const innerExpr = (delimiterExpr[1] ?? 1) as MJ;
    const movedExpr = (getAtPath(tree.rootJson, movedPath) as MJ) ?? factors[movedIndex];
    const mergedInner =
      targetSlot === 0
        ? normalizeMul([movedExpr, innerExpr])
        : normalizeMul([innerExpr, movedExpr]);
    const updatedDelimiter: MJNode = ["Delimiter", mergedInner];

    const nextFactors: MJ[] = [];
    for (let i = 0; i < factors.length; i += 1) {
      if (i === movedIndex) continue;
      if (i === delimiterIndex) {
        nextFactors.push(updatedDelimiter);
        continue;
      }
      nextFactors.push(factors[i]);
    }

    const normalizedParent = normalizeMul(nextFactors);
    const nextRoot = setAtPath(tree.rootJson, parentPath, normalizedParent);
    return ExpressionTree.create(nextRoot);
  }

  // Pull a factor out of a fraction numerator to the left/right of the fraction.
  // Example: a = (b d)/c  ->  a = b (d/c)  (slot 0), or a = (d/c) b (slot 1)
  if (
    (targetSlot === 0 || targetSlot === 1) &&
    tree.nodesById[hoverNodeId]?.op === "Divide" &&
    isAncestorOrSelf(tree, hoverNodeId, movedId)
  ) {
    const divideId = hoverNodeId;
    const dividePath = tree.pathById[divideId];
    if (!dividePath) return null;
    const divideExpr = getAtPath(tree.rootJson, dividePath) as MJNode;
    if (!Array.isArray(divideExpr) || divideExpr[0] !== "Divide") return null;

    const kids = tree.childrenById[divideId] ?? [];
    if (kids.length !== 2) return null;
    const [numeratorId, denominatorId] = kids;
    if (!isAncestorOrSelf(tree, numeratorId, movedId)) return null;
    if (isAncestorOrSelf(tree, denominatorId, movedId)) return null;

    const movedIds = [movedId];

    const numeratorExpr = getAtPath(tree.rootJson, tree.pathById[numeratorId]!) as MJ;
    const denominatorExpr = getAtPath(tree.rootJson, tree.pathById[denominatorId]!) as MJ;
    let extractedExpr: MJ | null = null;
    let nextNumerator: MJ | null = null;

    if (
      Array.isArray(numeratorExpr) &&
      (numeratorExpr[0] === "InvisibleOperator" || numeratorExpr[0] === "Multiply")
    ) {
      const numeratorKids = tree.childrenById[numeratorId] ?? [];
      const indices = movedIds
        .map((id) => numeratorKids.indexOf(id))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);
      if (indices.length === 0) return null;
      const factors = numeratorExpr.slice(1) as MJ[];
      const idxSet = new Set(indices);
      const extractedFactors = factors.filter((_, i) => idxSet.has(i));
      const remainingFactors = factors.filter((_, i) => !idxSet.has(i));
      extractedExpr = normalizeMul(extractedFactors);
      nextNumerator = normalizeMul(remainingFactors);
    } else if (movedId === numeratorId) {
      extractedExpr = numeratorExpr;
      nextNumerator = 1;
    } else {
      return null;
    }

    if (!extractedExpr || nextNumerator == null) return null;

    const updatedDivide: MJ = ["Divide", nextNumerator, denominatorExpr];
    const wrappedDivide: MJ =
      nextNumerator === 1 ? (["Divide", 1, denominatorExpr] as MJ) : updatedDivide;

    const nextExpr =
      targetSlot === 0
        ? normalizeMul([extractedExpr, wrappedDivide])
        : normalizeMul([wrappedDivide, extractedExpr]);
    const nextRoot = setAtPath(tree.rootJson, dividePath, nextExpr);
    return ExpressionTree.create(nextRoot);
  }

  // Pull a factor out of a parenthesized multiplicative expression.
  // Example: c = (a b) -> c = b (a)  (slot 0), or c = (a) b (slot 1)
  if (
    (targetSlot === 0 || targetSlot === 1) &&
    tree.nodesById[hoverNodeId]?.op === "Delimiter" &&
    hoverNodeId !== movedId
  ) {
    const delimiterId = hoverNodeId;
    const delimiterPath = tree.pathById[delimiterId];
    if (!delimiterPath) return null;

    const delimKids = tree.childrenById[delimiterId] ?? [];
    if (delimKids.length < 1) return null;
    const innerId = delimKids[0];
    if (!isAncestorOrSelf(tree, innerId, movedId)) return null;

    // Find multiplicative container inside the delimiter that owns movedId.
    let mulId: string | null = tree.parentById[movedId] ?? null;
    while (
      mulId &&
      !isMulOp(tree.nodesById[mulId]?.op) &&
      isAncestorOrSelf(tree, innerId, mulId)
    ) {
      mulId = tree.parentById[mulId] ?? null;
    }
    if (!mulId || !isMulOp(tree.nodesById[mulId]?.op)) return null;

    const mulPath = tree.pathById[mulId];
    if (!mulPath) return null;
    const mulExpr = getAtPath(tree.rootJson, mulPath) as MJNode;
    if (
      !Array.isArray(mulExpr) ||
      (mulExpr[0] !== "InvisibleOperator" && mulExpr[0] !== "Multiply")
    ) {
      return null;
    }

    const mulKids = tree.childrenById[mulId] ?? [];
    const movedIndex = mulKids.indexOf(movedId);
    if (movedIndex < 0) return null;

    const factors = mulExpr.slice(1) as MJ[];
    const movedExpr = factors[movedIndex];
    if (movedExpr === undefined) return null;

    const remainingFactors = factors.filter((_, i) => i !== movedIndex);
    const nextInner = normalizeMul(remainingFactors);
    let nextRoot = setAtPath(tree.rootJson, mulPath, nextInner);

    const updatedDelimiterExpr = getAtPath(nextRoot, delimiterPath) as MJ;
    const nextExpr =
      targetSlot === 0
        ? normalizeMul([movedExpr, updatedDelimiterExpr])
        : normalizeMul([updatedDelimiterExpr, movedExpr]);

    nextRoot = setAtPath(nextRoot, delimiterPath, nextExpr);
    return ExpressionTree.create(nextRoot);
  }

  // Lift a scalar out of a DotProduct operand onto the dot (before/after) on the same side.
  if (
    tree.nodesById[hoverNodeId]?.op === "DotProduct" &&
    targetSlot != null &&
    hoverNodeId !== movedId
  ) {
    const dotId = hoverNodeId;
    const dotChildren = tree.childrenById[dotId] ?? [];
    if (dotChildren.length === 2) {
      const operandIndex = dotChildren.findIndex((id) =>
        isAncestorOrSelf(tree, id, movedId)
      );
      const fromSide = findEqualSideRoot(tree, movedId);
      const toSide = findEqualSideRoot(tree, dotId);
      const sameSideOrNoEqual =
        !fromSide ||
        !toSide ||
        fromSide.equalId !== toSide.equalId ||
        fromSide.sideSlot === toSide.sideSlot;

      if ((operandIndex === 0 || operandIndex === 1) && sameSideOrNoEqual) {
        const operandId = dotChildren[operandIndex];
        const operandPath = tree.pathById[operandId];
        const dotPath = tree.pathById[dotId];
        const movedPath = tree.pathById[movedId];
        if (!operandPath || !dotPath || !movedPath) return null;

        const operandExpr = getAtPath(tree.rootJson, operandPath) as MJ;
        const movedExpr = getAtPath(tree.rootJson, movedPath) as MJ;
        const operandChildren = tree.childrenById[operandId] ?? [];

        let remainingOperand: MJ | null = null;
        if (
          Array.isArray(operandExpr) &&
          (operandExpr[0] === "InvisibleOperator" || operandExpr[0] === "Multiply")
        ) {
          const factors = operandExpr.slice(1) as MJ[];
          const movedIndex = operandChildren.indexOf(movedId);
          if (movedIndex < 0 || movedIndex >= factors.length) return null;
          const kept = factors.filter((_, i) => i !== movedIndex);
          remainingOperand = normalizeMul(kept);
        } else {
          // Only lift when the operand is a product container we can safely modify.
          return null;
        }

        const dotExpr = getAtPath(tree.rootJson, dotPath) as MJNode;
        if (!Array.isArray(dotExpr) || dotExpr[0] !== "DotProduct") return null;
        const nextDotKids = [...dotExpr.slice(1)] as MJ[];
        nextDotKids[operandIndex] = remainingOperand;
        const nextDot: MJNode = ["DotProduct", ...nextDotKids];

        const dotParentId = tree.parentById[dotId];
        const dotParentOp = dotParentId
          ? tree.nodesById[dotParentId]?.op
          : null;
        const dotParentPath = dotParentId ? tree.pathById[dotParentId] : null;

        let nextRoot: MJ = tree.rootJson;
        if (
          dotParentId &&
          dotParentPath &&
          (dotParentOp === "InvisibleOperator" || dotParentOp === "Multiply")
        ) {
          const parentExpr = getAtPath(tree.rootJson, dotParentPath) as MJNode;
          const [, ...factors] = parentExpr;
          const siblings = tree.childrenById[dotParentId] ?? [];
          const dotIndex = siblings.indexOf(dotId);
          if (dotIndex < 0) return null;

          const nextFactors = [...factors];
          nextFactors[dotIndex] = nextDot;

          const insertionIndex =
            targetSlot === 0 ? dotIndex : Math.min(nextFactors.length, dotIndex + 1);
          nextFactors.splice(insertionIndex, 0, movedExpr);

          const normalizedParent = normalizeMul(nextFactors as MJ[]);
          nextRoot = setAtPath(nextRoot, dotParentPath, normalizedParent);
        } else {
          // Dot is a side root or standalone expression; wrap into a product.
          const product = normalizeMul(
            targetSlot === 0 ? [movedExpr, nextDot] : [nextDot, movedExpr]
          );
          nextRoot = setAtPath(nextRoot, dotPath, product);
        }

        return ExpressionTree.create(nextRoot);
      }
    }
  }

  // Determine the Equal LCA (with a fallback when routeBetween fails for edge cases)
  const route = routeBetween(tree, movedId, hoverNodeId);
  const equalId =
    route?.lcaId ??
    findEqualSideRoot(tree, hoverNodeId)?.equalId ??
    findEqualSideRoot(tree, movedId)?.equalId ??
    null;
  if (!equalId) return null;
  if (tree.nodesById[equalId]?.op !== "Equal") return null;

  const sideInfoFrom = findEqualSideRoot(tree, movedId);
  const sideInfoTo = findEqualSideRoot(tree, hoverNodeId);
  if (!sideInfoFrom || !sideInfoTo) return null;
  if (sideInfoFrom.sideSlot === sideInfoTo.sideSlot) return null;

  const movedPath = tree.pathById[movedId];
  if (!movedPath) return null;
  const fromParentPathForExpr = tree.pathById[fromParentId];
  const movedExpr =
    isMulOp(fromParentOp) &&
    fromParentPathForExpr &&
    movedIdsInFromParent.length > 1
      ? (() => {
          const mulExpr = getAtPath(tree.rootJson, fromParentPathForExpr) as MJNode;
          if (!Array.isArray(mulExpr)) return null;
          const [, ...factors] = mulExpr;
          const kids = tree.childrenById[fromParentId] ?? [];
          const indices = movedIdsInFromParent
            .map((id) => kids.indexOf(id))
            .filter((idx) => idx >= 0)
            .sort((a, b) => a - b);
          if (indices.length === 0) return null;
          return normalizeMul(
            indices
              .map((idx) => factors[idx])
              .filter((f): f is MJ => f !== undefined)
          );
        })()
      : (getAtPath(tree.rootJson, movedPath) as MJ);
  if (movedExpr == null) return null;
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
  const movedParentOp = movedParentId ? tree.nodesById[movedParentId]?.op : null;
  const movedParentPath = movedParentId ? tree.pathById[movedParentId] : null;

  if (
    movedParentId &&
    movedParentPath &&
    (movedParentOp === "InvisibleOperator" || movedParentOp === "Multiply")
  ) {
    const mulExpr = getAtPath(nextRoot, movedParentPath) as MJNode;
    const [, ...factors] = mulExpr;
    const siblings = tree.childrenById[movedParentId] ?? [];
    const indices = movedIdsInFromParent
      .map((id) => siblings.indexOf(id))
      .filter((idx) => idx >= 0);
    if (indices.length === 0) return null;
    const idxSet = new Set(indices);
    const remaining = factors.filter((_, i) => !idxSet.has(i));
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
