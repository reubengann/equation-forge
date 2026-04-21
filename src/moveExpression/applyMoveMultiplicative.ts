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
  nodeId: string | null | undefined,
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
  nodeId: string | null,
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

function isQuotientOp(op: unknown): op is "Divide" | "FractionDerivative" {
  return op === "Divide" || op === "FractionDerivative";
}

function reciprocalDenominator(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return null;
  if (expr[0] !== "Divide") return null;
  if (!isOneTerm(expr[1] as MJ)) return null;
  return (expr[2] as MJ) ?? null;
}

function isReciprocalDivideExpr(expr: MJ): boolean {
  return (
    Array.isArray(expr) &&
    expr[0] === "Divide" &&
    expr.length >= 3 &&
    isOneTerm(expr[1] as MJ)
  );
}

function unwrapDelimiter(expr: MJ): MJ {
  if (
    Array.isArray(expr) &&
    (expr[0] === "Delimiter" || expr[0] === "List") &&
    expr.length >= 2
  ) {
    return expr[1] as MJ;
  }
  return expr;
}

function wrapForMultiplicativeInsertion(expr: MJ): MJ {
  if (
    Array.isArray(expr) &&
    (expr[0] === "Add" || expr[0] === "Negate")
  ) {
    return ["Delimiter", expr] as MJNode;
  }
  return expr;
}

function delimiterWrapsAdd(tree: ExpressionTree, delimiterId: string): boolean {
  if (tree.nodesById[delimiterId]?.op !== "Delimiter") return false;
  const innerId = tree.childrenById[delimiterId]?.[0];
  if (!innerId) return false;
  return tree.nodesById[innerId]?.op === "Add";
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

function divideTermByFactor(term: MJ, factor: MJ): MJ {
  if (Array.isArray(term) && term[0] === "Negate" && term.length >= 2) {
    return ["Negate", divideTermByFactor(term[1] as MJ, factor)] as MJNode;
  }

  const bareTerm = unwrapDelimiter(term);
  const bareFactor = unwrapDelimiter(factor);
  if (deepEqualMJ(bareTerm, bareFactor)) return 1;

  if (
    Array.isArray(bareTerm) &&
    (bareTerm[0] === "InvisibleOperator" || bareTerm[0] === "Multiply")
  ) {
    const factors = (bareTerm.slice(1) as MJ[]).map(unwrapDelimiter);
    const originalFactors = bareTerm.slice(1) as MJ[];
    const idx = factors.findIndex((f) => deepEqualMJ(f, bareFactor));
    if (idx >= 0) {
      const remaining = originalFactors.filter((_, i) => i !== idx);
      return normalizeMul(remaining);
    }

    // Try canceling through one nested factor (e.g. Divide(...), Power(...), etc)
    // before falling back to wrapping the whole term in Divide(term, factor).
    for (let i = 0; i < originalFactors.length; i += 1) {
      const curFactor = originalFactors[i] as MJ;
      const reduced = divideTermByFactor(curFactor, bareFactor);
      const fallbackForFactor = ["Divide", curFactor, bareFactor] as MJNode;
      if (!deepEqualMJ(reduced, fallbackForFactor)) {
        const nextFactors = [...originalFactors];
        nextFactors[i] = reduced;
        return normalizeMul(nextFactors);
      }
    }
  }

  if (Array.isArray(bareTerm) && isQuotientOp(bareTerm[0]) && bareTerm.length >= 3) {
    const quotientOp = bareTerm[0] as "Divide" | "FractionDerivative";
    const numerator = unwrapDelimiter(bareTerm[1] as MJ);
    const denominator = unwrapDelimiter(bareTerm[2] as MJ);

    if (deepEqualMJ(denominator, bareFactor)) {
      return numerator;
    }

    if (
      Array.isArray(denominator) &&
      (denominator[0] === "InvisibleOperator" || denominator[0] === "Multiply")
    ) {
      const denFactors = (denominator.slice(1) as MJ[]).map(unwrapDelimiter);
      const idx = denFactors.findIndex((f) => deepEqualMJ(f, bareFactor));
      if (idx >= 0) {
        const originalDenFactors = denominator.slice(1) as MJ[];
        const nextDenominator = normalizeMul(
          originalDenFactors.filter((_, i) => i !== idx)
        );
        return isOneTerm(nextDenominator)
          ? numerator
          : ([quotientOp, numerator, nextDenominator] as MJNode);
      }
    }

    if (deepEqualMJ(numerator, bareFactor)) {
      return isOneTerm(denominator) ? 1 : ([quotientOp, 1, denominator] as MJNode);
    }

    if (
      Array.isArray(numerator) &&
      (numerator[0] === "InvisibleOperator" || numerator[0] === "Multiply")
    ) {
      const numFactors = (numerator.slice(1) as MJ[]).map(unwrapDelimiter);
      const idx = numFactors.findIndex((f) => deepEqualMJ(f, bareFactor));
      if (idx >= 0) {
        const originalNumFactors = numerator.slice(1) as MJ[];
        const nextNumerator = normalizeMul(
          originalNumFactors.filter((_, i) => i !== idx)
        );
        return isOneTerm(denominator)
          ? nextNumerator
          : ([quotientOp, nextNumerator, denominator] as MJNode);
      }
    }
  }

  return ["Divide", term, factor] as MJNode;
}

function divideSideByFactor(sideExpr: MJ, factor: MJ): MJ {
  if (Array.isArray(sideExpr) && sideExpr[0] === "Add") {
    const terms = sideExpr.slice(1) as MJ[];
    return ["Add", ...terms.map((term) => divideTermByFactor(term, factor))] as MJNode;
  }
  return divideTermByFactor(sideExpr, factor);
}

function foldReciprocalIntoTail(baseExpr: MJ, reciprocal: MJ): MJ {
  const denom = reciprocalDenominator(reciprocal);
  if (!denom) return normalizeMul([baseExpr, reciprocal]);
  if (
    Array.isArray(baseExpr) &&
    (baseExpr[0] === "InvisibleOperator" || baseExpr[0] === "Multiply")
  ) {
    const factors = baseExpr.slice(1) as MJ[];
    if (factors.length === 0) return ["Divide", 1, denom] as MJNode;
    const nextFactors = [...factors];
    const tail = nextFactors[nextFactors.length - 1] as MJ;
    nextFactors[nextFactors.length - 1] = ["Divide", tail, denom] as MJNode;
    return normalizeMul(nextFactors);
  }
  return ["Divide", baseExpr, denom] as MJNode;
}

function childUnderAncestor(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string,
): string | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null = tree.parentById[cur] ?? null;
    if (!parentId) return null;
    if (parentId === ancestorId) return cur;
    cur = parentId;
  }
  return null;
}

function canAbsorbReciprocalDenominatorFactor(factorExpr: MJ, denom: MJ): boolean {
  const bareFactor = unwrapDelimiter(factorExpr);
  const bareDenom = unwrapDelimiter(denom);
  if (deepEqualMJ(bareFactor, bareDenom)) return true;
  if (
    Array.isArray(bareFactor) &&
    bareFactor[0] === "Negate" &&
    bareFactor.length >= 2
  ) {
    return deepEqualMJ(unwrapDelimiter(bareFactor[1] as MJ), bareDenom);
  }
  return false;
}

function divideByAdditionalFactor(expr: MJ, extraDenom: MJ): MJ {
  if (Array.isArray(expr) && isQuotientOp(expr[0]) && expr.length >= 3) {
    const quotientOp = expr[0] as "Divide" | "FractionDerivative";
    const numerator = expr[1] as MJ;
    const denominator = expr[2] as MJ;
    return [quotientOp, numerator, normalizeMul([denominator, extraDenom])] as MJNode;
  }
  return ["Divide", expr, extraDenom] as MJNode;
}

function pullFactorOutOfDivide(args: {
  tree: ExpressionTree;
  divideId: string;
  movedId: string;
  targetSlot: 0 | 1;
}): ExpressionTree | null {
  const { tree, divideId, movedId, targetSlot } = args;
  const dividePath = tree.pathById[divideId];
  if (!dividePath) return null;
  const extraction = extractFromDivide(tree, divideId, movedId);
  if (!extraction) return null;
  const { extractedExpr, updatedDivide } = extraction;

  const nextExpr =
    targetSlot === 0
      ? normalizeMul([extractedExpr, updatedDivide])
      : normalizeMul([updatedDivide, extractedExpr]);
  const nextRoot = setAtPath(tree.rootJson, dividePath, nextExpr);
  const nextTree = ExpressionTree.create(nextRoot);
  return nextTree;
}

function extractFromDivide(
  tree: ExpressionTree,
  divideId: string,
  movedId: string,
): { extractedExpr: MJ; updatedDivide: MJ } | null {
  const dividePath = tree.pathById[divideId];
  if (!dividePath) return null;
  const divideExpr = getAtPath(tree.rootJson, dividePath) as MJNode;
  if (!Array.isArray(divideExpr) || !isQuotientOp(divideExpr[0])) return null;
  const quotientOp = divideExpr[0] as "Divide" | "FractionDerivative";

  const kids = tree.childrenById[divideId] ?? [];
  if (kids.length !== 2) return null;
  const [numeratorId, denominatorId] = kids;
  const inNumerator = isAncestorOrSelf(tree, numeratorId, movedId);
  const inDenominator = isAncestorOrSelf(tree, denominatorId, movedId);
  if (inNumerator === inDenominator) return null;

  const numeratorExpr = getAtPath(
    tree.rootJson,
    tree.pathById[numeratorId]!,
  ) as MJ;
  const denominatorExpr = getAtPath(
    tree.rootJson,
    tree.pathById[denominatorId]!,
  ) as MJ;

  let extractedExpr: MJ | null = null;
  let nextNumerator: MJ = numeratorExpr;
  let nextDenominator: MJ = denominatorExpr;

  if (inNumerator) {
    if (movedId === numeratorId) {
      extractedExpr = numeratorExpr;
      nextNumerator = 1;
    } else if (Array.isArray(numeratorExpr) && numeratorExpr[0] === "Add") {
      const numeratorKids = tree.childrenById[numeratorId] ?? [];
      if (numeratorKids.length !== 1) return null;
      const onlyId = numeratorKids[0];
      if (!isAncestorOrSelf(tree, onlyId, movedId)) return null;
      const onlyPath = tree.pathById[onlyId];
      if (!onlyPath) return null;
      const onlyExpr = getAtPath(tree.rootJson, onlyPath) as MJ;

      if (movedId === onlyId) {
        extractedExpr = onlyExpr;
        nextNumerator = 1;
      } else if (
        Array.isArray(onlyExpr) &&
        (onlyExpr[0] === "InvisibleOperator" || onlyExpr[0] === "Multiply")
      ) {
        const onlyKids = tree.childrenById[onlyId] ?? [];
        const factorId = childUnderAncestor(tree, onlyId, movedId) ?? movedId;
        const idx = onlyKids.indexOf(factorId);
        if (idx < 0) return null;
        const factors = onlyExpr.slice(1) as MJ[];
        extractedExpr = factors[idx] as MJ;
        nextNumerator = normalizeMul(factors.filter((_, i) => i !== idx));
      } else {
        return null;
      }
    } else if (
      Array.isArray(numeratorExpr) &&
      (numeratorExpr[0] === "InvisibleOperator" ||
        numeratorExpr[0] === "Multiply")
    ) {
      const numeratorKids = tree.childrenById[numeratorId] ?? [];
      const factorId =
        childUnderAncestor(tree, numeratorId, movedId) ?? movedId;
      const idx = numeratorKids.indexOf(factorId);
      if (idx < 0) return null;
      const factors = numeratorExpr.slice(1) as MJ[];
      extractedExpr = factors[idx] as MJ;
      nextNumerator = normalizeMul(factors.filter((_, i) => i !== idx));
    } else {
      return null;
    }
  } else {
    if (movedId === denominatorId) {
      extractedExpr = ["Divide", 1, denominatorExpr] as MJNode;
      nextDenominator = 1;
    } else if (Array.isArray(denominatorExpr) && denominatorExpr[0] === "Add") {
      const denominatorKids = tree.childrenById[denominatorId] ?? [];
      if (denominatorKids.length !== 1) return null;
      const onlyId = denominatorKids[0];
      if (!isAncestorOrSelf(tree, onlyId, movedId)) return null;
      const onlyPath = tree.pathById[onlyId];
      if (!onlyPath) return null;
      const onlyExpr = getAtPath(tree.rootJson, onlyPath) as MJ;

      if (movedId === onlyId) {
        extractedExpr = ["Divide", 1, onlyExpr] as MJNode;
        nextDenominator = 1;
      } else if (
        Array.isArray(onlyExpr) &&
        (onlyExpr[0] === "InvisibleOperator" || onlyExpr[0] === "Multiply")
      ) {
        const onlyKids = tree.childrenById[onlyId] ?? [];
        const factorId = childUnderAncestor(tree, onlyId, movedId) ?? movedId;
        const idx = onlyKids.indexOf(factorId);
        if (idx < 0) return null;
        const factors = onlyExpr.slice(1) as MJ[];
        const extractedDenFactor = factors[idx] as MJ;
        extractedExpr = ["Divide", 1, extractedDenFactor] as MJNode;
        nextDenominator = normalizeMul(factors.filter((_, i) => i !== idx));
      } else {
        return null;
      }
    } else if (
      Array.isArray(denominatorExpr) &&
      (denominatorExpr[0] === "InvisibleOperator" ||
        denominatorExpr[0] === "Multiply")
    ) {
      const denominatorKids = tree.childrenById[denominatorId] ?? [];
      const factorId =
        childUnderAncestor(tree, denominatorId, movedId) ?? movedId;
      const idx = denominatorKids.indexOf(factorId);
      if (idx < 0) return null;
      const factors = denominatorExpr.slice(1) as MJ[];
      const extractedDenFactor = factors[idx] as MJ;
      extractedExpr = ["Divide", 1, extractedDenFactor] as MJNode;
      nextDenominator = normalizeMul(factors.filter((_, i) => i !== idx));
    } else {
      return null;
    }
  }

  if (!extractedExpr) return null;
  const updatedDivide: MJ = isOneTerm(nextDenominator)
    ? nextNumerator
    : ([quotientOp, nextNumerator, nextDenominator] as MJNode);
  return { extractedExpr, updatedDivide };
}

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string,
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
  nodeId: string,
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

function isUnderDenominatorOfFractionSideRoot(
  tree: ExpressionTree,
  sideRootId: string,
  nodeId: string,
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null = tree.parentById[cur] ?? null;
    if (!parentId) return false;
    const op = tree.nodesById[parentId]?.op;
    if (op === "FractionDerivative") {
      const idx = tree.childIndexById[cur];
      if (idx === 1) return true;
    }
    if (parentId === sideRootId) break;
    cur = parentId;
  }
  return false;
}

function shouldBlockCrossEqualDenominatorMoveFromAddSide(
  tree: ExpressionTree,
  movedId: string,
  sourceSideRootId: string,
): boolean {
  if (tree.nodesById[sourceSideRootId]?.op !== "Add") return false;
  const movedUnderSourceDenominator =
    isUnderDenominatorOfSideRoot(tree, sourceSideRootId, movedId) ||
    isUnderDenominatorOfFractionSideRoot(tree, sourceSideRootId, movedId);
  return movedUnderSourceDenominator && movedId !== sourceSideRootId;
}

/**
 * Minimal multiplicative move executor to support cross-equal root division.
 * Future steps will expand to full multiplicative semantics.
 */
export function applyMoveMultiplicative(
  args: ApplyMoveArgs,
): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (selectedIds.length < 1) return null;
  const normalizeSelectedForMove = (id: string): string => {
    let normalized = normalizeSelection(tree, id);
    const powerParent = tree.parentById[normalized];
    if (
      powerParent &&
      tree.nodesById[powerParent]?.op === "Power" &&
      tree.childrenById[powerParent]?.[0] === normalized
    ) {
      // Moving the base of a power should move the atomic power factor.
      normalized = powerParent;
    }
    const normalizedOp = tree.nodesById[normalized]?.op;
    if (normalizedOp === "FractionDerivative") {
      const numeratorId = tree.childrenById[normalized]?.[0];
      const denominatorId = tree.childrenById[normalized]?.[1];
      if (numeratorId && isAncestorOrSelf(tree, numeratorId, id)) {
        // Preserve numerator-level intent so factors can be extracted.
        return id;
      }
      if (denominatorId && isAncestorOrSelf(tree, denominatorId, id)) {
        // Preserve denominator-level move intent (issue 37) even though
        // generic selection normalization may bubble to the whole fraction.
        return id;
      }
    }
    return normalized;
  };
  const normalizedSelectedIds = Array.from(
    new Set(selectedIds.map((id) => normalizeSelectedForMove(id))),
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
    (id) => tree.parentById[id] === fromParentId,
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

  // Pull a factor out of a fraction when the hover target is the Add that owns
  // that fraction term (common for edge-drops in multiplicative mode).
  if (targetSlot != null && tree.nodesById[hoverNodeId]?.op === "Add") {
    const divideAncestor = (() => {
      let cur: string | null = movedId ?? null;
      while (cur) {
        const p: string | null = tree.parentById[cur] ?? null;
        if (!p) return null;
        if (isQuotientOp(tree.nodesById[p]?.op)) return p;
        cur = p;
      }
      return null;
    })();
    if (divideAncestor && tree.parentById[divideAncestor] === hoverNodeId) {
      const addKids = tree.childrenById[hoverNodeId] ?? [];
      const divideIndex = addKids.indexOf(divideAncestor);
      if (divideIndex >= 0) {
        // targetSlot can be either:
        // - full Add insertion slot space [0..kids.length] (manual/tests), or
        // - compressed side-root slot space {0,1} from planner replace intents.
        const edgeSlot =
          addKids.length === 2 && (targetSlot === 0 || targetSlot === 1)
            ? (targetSlot as 0 | 1)
            : targetSlot === divideIndex
              ? 0
              : targetSlot === divideIndex + 1
                ? 1
                : targetSlot === 0
                  ? 0
                  : targetSlot === 1
                    ? 1
                    : null;
        if (edgeSlot != null) {
          const pulled = pullFactorOutOfDivide({
            tree,
            divideId: divideAncestor,
            movedId,
            targetSlot: edgeSlot as 0 | 1,
          });
          if (pulled) return pulled;
        }
      }
    }
  }

  // Pull out of fraction when hovering a sibling factor in the same product.
  if (targetSlot != null && isQuotientOp(tree.nodesById[fromParentId]?.op)) {
    const divideId = fromParentId;
    const parentMulId = tree.parentById[divideId];
    const parentMulOp = parentMulId ? tree.nodesById[parentMulId]?.op : null;
    const hoverParentId = tree.parentById[hoverNodeId];
    const hoverInSameMul =
      !!parentMulId &&
      isMulOp(parentMulOp ?? undefined) &&
      (hoverNodeId === parentMulId || hoverParentId === parentMulId);
    if (hoverInSameMul) {
      const mulKids = tree.childrenById[parentMulId!] ?? [];
      const divideIndex = mulKids.indexOf(divideId);
      const hoverIndex = mulKids.indexOf(hoverNodeId);
      if (hoverIndex >= 0 && divideIndex >= 0 && hoverNodeId !== parentMulId) {
        const extraction = extractFromDivide(tree, divideId, movedId);
        if (!extraction) return null;
        const { extractedExpr, updatedDivide } = extraction;
        const parentPath = tree.pathById[parentMulId!];
        if (!parentPath) return null;
        const parentExpr = getAtPath(tree.rootJson, parentPath) as MJNode;
        if (!Array.isArray(parentExpr)) return null;
        const [, ...factors] = parentExpr;
        const replaced = [...factors];
        replaced[divideIndex] = updatedDivide;
        const insertAfterHover = targetSlot === 1;
        const denom = reciprocalDenominator(extractedExpr);

        // When pulling a denominator factor onto a sibling factor (e.g., e onto f),
        // interpret "after hover" as division of that hovered factor: f -> f/e.
        if (insertAfterHover && denom) {
          const hoveredExpr = replaced[hoverIndex] as MJ;
          if (Array.isArray(hoveredExpr) && isQuotientOp(hoveredExpr[0])) {
            replaced[hoverIndex] = divideByAdditionalFactor(hoveredExpr, denom);
            const nextParent = normalizeMul(replaced as MJ[]);
            const nextRoot = setAtPath(tree.rootJson, parentPath, nextParent);
            return ExpressionTree.create(nextRoot);
          }
          // Prefer folding onto a sibling that matches the denominator factor
          // (e.g. moving denominator beta onto an existing beta factor), even
          // if the geometric hover landed on a different sibling.
          const preferredFoldIndex = replaced.findIndex(
            (expr, idx) =>
              idx !== divideIndex &&
              canAbsorbReciprocalDenominatorFactor(expr as MJ, denom)
          );
          const foldIndex = preferredFoldIndex >= 0 ? preferredFoldIndex : hoverIndex;
          const hoverExpr = replaced[foldIndex] as MJ;
          replaced[foldIndex] = ["Divide", hoverExpr, denom] as MJNode;
          const nextParent = normalizeMul(replaced as MJ[]);
          const nextRoot = setAtPath(tree.rootJson, parentPath, nextParent);
          return ExpressionTree.create(nextRoot);
        }

        const insertionIndex = hoverIndex + (insertAfterHover ? 1 : 0);
        const nextFactors = [
          ...replaced.slice(0, insertionIndex),
          extractedExpr,
          ...replaced.slice(insertionIndex),
        ];
        const nextParent = normalizeMul(nextFactors as MJ[]);
        const nextRoot = setAtPath(tree.rootJson, parentPath, nextParent);
        return ExpressionTree.create(nextRoot);
      } else {
        const edgeSlot: 0 | 1 =
          hoverIndex >= 0 && divideIndex >= 0
            ? hoverIndex < divideIndex
              ? 0
              : 1
            : targetSlot === 0
              ? 0
              : 1;
        const pulled = pullFactorOutOfDivide({
          tree,
          divideId,
          movedId,
          targetSlot: edgeSlot,
        });
        if (pulled) return pulled;
      }
    }
  }

  let targetMulId: string | null = null;
  if (isMulOp(hoverOp)) {
    targetMulId = hover;
  } else {
    const hoverParentId = tree.parentById[hoverNodeId];
    if (hoverParentId && isMulOp(tree.nodesById[hoverParentId]?.op)) {
      targetMulId = hoverParentId;
    } else if (isAncestorOrSelf(tree, fromParentId, hoverNodeId)) {
      // Hover can be deep inside a grouped sibling (e.g. inside a List/Delimiter);
      // still treat this as reordering within the source multiplicative container.
      targetMulId = fromParentId;
    }
  }
  if (targetMulId && targetMulId !== fromParentId && isAncestorOrSelf(tree, fromParentId, targetMulId)) {
    targetMulId = fromParentId;
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
      !delimiterWrapsAdd(tree, hoverNodeId) &&
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

    const hoverFactorId = childUnderAncestor(tree, fromParentId, hoverNodeId) ?? hoverNodeId;
    const hoverIndex = siblings.indexOf(hoverFactorId);
    const slotFromHover =
      (targetSlot === 0 || targetSlot === 1) &&
      hoverIndex >= 0 &&
      hoverNodeId !== fromParentId
        ? hoverIndex + (targetSlot === 1 ? 1 : 0)
        : targetSlot;
    const slot = Math.max(0, Math.min(factors.length, slotFromHover));
    const movedIndexSet = new Set<number>(movedIndices);
    const movedCountBeforeSlot = movedIndices.filter((i) => i < slot).length;
    const insertionIndex = Math.max(0, slot - movedCountBeforeSlot);

    const movedFactorExpr = normalizeMul(
      movedIndices
        .map((i) => factors[i])
        .filter((f): f is MJ => f !== undefined),
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

  // Pull selected factors from a nested product into its outer product when
  // hovering the outer product container itself.
  if (targetSlot != null && isMulOp(fromParentOp)) {
    const outerMulId = tree.parentById[fromParentId];
    const outerMulOp = outerMulId ? tree.nodesById[outerMulId]?.op : null;
    const hoverInOuterMul = !!outerMulId && hoverNodeId === outerMulId;
    if (outerMulId && isMulOp(outerMulOp ?? undefined) && hoverInOuterMul) {
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
          .filter((f): f is MJ => f !== undefined),
      );
      const remainingInner = normalizeMul(
        fromFactors.filter((_, i) => !selectedSet.has(i)),
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
      nextRoot = setAtPath(
        nextRoot,
        outerMulPath,
        normalizeMul(nextOuterFactors),
      );
      return ExpressionTree.create(nextRoot);
    }
  }

  // Pull selected factors out of a parenthesized product into its outer product.
  if (targetSlot != null && isMulOp(fromParentOp)) {
    const delimiterId = tree.parentById[fromParentId];
    const delimiterOp = delimiterId ? tree.nodesById[delimiterId]?.op : null;
    const outerMulId = delimiterId ? tree.parentById[delimiterId] : null;
    const outerMulOp = outerMulId ? tree.nodesById[outerMulId]?.op : null;
    const hoverInOuterMul =
      !!outerMulId &&
      (hoverNodeId === outerMulId ||
        tree.parentById[hoverNodeId] === outerMulId);

    if (
      delimiterId &&
      delimiterOp === "Delimiter" &&
      outerMulId &&
      isMulOp(outerMulOp ?? undefined) &&
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
          .filter((f): f is MJ => f !== undefined),
      );
      const remainingInner = normalizeMul(
        fromFactors.filter((_, i) => !selectedSet.has(i)),
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
      nextRoot = setAtPath(
        nextRoot,
        outerMulPath,
        normalizeMul(nextOuterFactors),
      );
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
        const movedFromIntegrandDenominator =
          isUnderDenominatorOfSideRoot(tree, integrandId, movedId) ||
          isUnderDenominatorOfFractionSideRoot(tree, integrandId, movedId);
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
          const selectedInContainer = normalizedSelectedIds.filter(
            (id) => tree.parentById[id] === containerId,
          );
          const selectedIndices = selectedInContainer
            .map((id) => siblings.indexOf(id))
            .filter((idx) => idx >= 0 && idx < factors.length)
            .sort((a, b) => a - b);
          const effectiveSelectedIndices =
            selectedIndices.length > 0
              ? selectedIndices
              : (() => {
                  const idx = siblings.indexOf(movedId);
                  return idx >= 0 && idx < factors.length ? [idx] : [];
                })();
          if (effectiveSelectedIndices.length === 0) return null;

          const selectedIndexSet = new Set<number>(effectiveSelectedIndices);
          const movedFromContainerExpr = normalizeMul(
            effectiveSelectedIndices
              .map((idx) => factors[idx])
              .filter((f): f is MJ => f !== undefined),
          );
          const remainingFactors = factors.filter((_, i) => !selectedIndexSet.has(i));
          const normalizedMul = normalizeMul(remainingFactors as MJ[]);
          nextRoot = setAtPath(nextRoot, containerPath, normalizedMul);

          updatedIntegrand = getAtPath(nextRoot, integrandPath) as MJ;
          // Use grouped moved payload for outside placement.
          const movedOutsideExpr: MJ = movedFromIntegrandDenominator
            ? (["Divide", 1, movedFromContainerExpr] as MJNode)
            : movedFromContainerExpr;
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
              ? ([movedOutsideExpr, updatedIntegrate] as MJ[])
              : ([updatedIntegrate, movedOutsideExpr] as MJ[]),
          );
          nextRoot = setAtPath(nextRoot, integratePath, wrapped);
        } else {
          // Container is the integrand root and not a multiplicative op.
          // Remove the moved factor from the integrand when it appears
          // multiplicatively (e.g., K/v^gamma -> 1/v^gamma).
          const currentIntegrand = getAtPath(nextRoot, integrandPath) as MJ;
          const reducedIntegrand = divideTermByFactor(currentIntegrand, movedExpr);
          const fallback = ["Divide", currentIntegrand, movedExpr] as MJNode;
          if (deepEqualMJ(reducedIntegrand, fallback)) return null;
          updatedIntegrand = reducedIntegrand;
          nextRoot = setAtPath(nextRoot, integrandPath, updatedIntegrand);
          const integrateExpr = getAtPath(nextRoot, integratePath) as MJNode;
          if (!Array.isArray(integrateExpr) || integrateExpr[0] !== "Integrate")
            return null;

          const updatedIntegrate: MJNode = [
            "Integrate",
            updatedIntegrand,
            ...integrateExpr.slice(2),
          ];

          const movedOutsideExpr: MJ = movedFromIntegrandDenominator
            ? (["Divide", 1, movedExpr] as MJNode)
            : movedExpr;
          const wrapped = normalizeMul(
            targetSlot === 0
              ? ([movedOutsideExpr, updatedIntegrate] as MJ[])
              : ([updatedIntegrate, movedOutsideExpr] as MJ[]),
          );
          nextRoot = setAtPath(nextRoot, integratePath, wrapped);
        }

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
    if (movedIndex < 0 || divideIndex < 0 || movedIndices.length === 0)
      return null;

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
              .filter((f): f is MJ => f !== undefined),
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
    !delimiterWrapsAdd(tree, hoverNodeId) &&
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
    const movedExpr =
      (getAtPath(tree.rootJson, movedPath) as MJ) ?? factors[movedIndex];
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
    const parentMulId = tree.parentById[divideId];
    const parentMulOp = parentMulId ? tree.nodesById[parentMulId]?.op : null;

    // If this fraction sits inside a product and has an adjacent sibling factor,
    // fold denominator pull-out directly onto that sibling (f -> f/e) so the
    // drag intent is visible and stable in UI output.
    if (parentMulId && isMulOp(parentMulOp ?? undefined)) {
      const parentPath = tree.pathById[parentMulId];
      const kids = tree.childrenById[parentMulId] ?? [];
      const divideIndex = kids.indexOf(divideId);
      const siblingIndex = targetSlot === 0 ? divideIndex - 1 : divideIndex + 1;
      if (
        parentPath &&
        divideIndex >= 0 &&
        siblingIndex >= 0 &&
        siblingIndex < kids.length
      ) {
        const extraction = extractFromDivide(tree, divideId, movedId);
        if (extraction) {
          const { extractedExpr, updatedDivide } = extraction;
          const denom = reciprocalDenominator(extractedExpr);
          if (denom) {
            const parentExpr = getAtPath(tree.rootJson, parentPath) as MJNode;
            if (Array.isArray(parentExpr)) {
              const [, ...factors] = parentExpr;
              const nextFactors = [...factors] as MJ[];
              nextFactors[divideIndex] = updatedDivide;
              const preferredFoldIndex = nextFactors.findIndex(
                (expr, idx) =>
                  idx !== divideIndex &&
                  canAbsorbReciprocalDenominatorFactor(expr as MJ, denom)
              );
              const foldIndex =
                preferredFoldIndex >= 0 ? preferredFoldIndex : siblingIndex;
              const foldExpr = nextFactors[foldIndex] as MJ;
              nextFactors[foldIndex] = [
                "Divide",
                foldExpr,
                denom,
              ] as MJNode;
              const normalizedParent = normalizeMul(nextFactors);
              const nextRoot = setAtPath(
                tree.rootJson,
                parentPath,
                normalizedParent,
              );
              return ExpressionTree.create(nextRoot);
            }
          }
        }
      }
    }

    return pullFactorOutOfDivide({
      tree,
      divideId,
      movedId,
      targetSlot,
    });
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

    // Pull a factor out of an inner fraction inside the delimiter.
    const divideAncestorWithinDelimiter = (() => {
      let cur: string | null = movedId;
      while (cur && cur !== delimiterId) {
        const parentId = tree.parentById[cur] ?? null;
        if (!parentId || parentId === delimiterId) return null;
        if (tree.nodesById[parentId]?.op === "Divide") return parentId;
        cur = parentId;
      }
      return null;
    })();
    if (divideAncestorWithinDelimiter) {
      const delimiterPath = tree.pathById[delimiterId];
      const dividePath = tree.pathById[divideAncestorWithinDelimiter];
      if (!delimiterPath || !dividePath) return null;

      const extraction = extractFromDivide(tree, divideAncestorWithinDelimiter, movedId);
      if (!extraction) return null;
      const { extractedExpr, updatedDivide } = extraction;

      let nextRoot = setAtPath(tree.rootJson, dividePath, updatedDivide);
      const updatedDelimiterExpr = getAtPath(nextRoot, delimiterPath) as MJ;
      const nextExpr =
        targetSlot === 0
          ? normalizeMul([extractedExpr, updatedDelimiterExpr])
          : normalizeMul([updatedDelimiterExpr, extractedExpr]);
      nextRoot = setAtPath(nextRoot, delimiterPath, nextExpr);
      return ExpressionTree.create(nextRoot);
    }

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
        isAncestorOrSelf(tree, id, movedId),
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
          (operandExpr[0] === "InvisibleOperator" ||
            operandExpr[0] === "Multiply")
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
            targetSlot === 0
              ? dotIndex
              : Math.min(nextFactors.length, dotIndex + 1);
          nextFactors.splice(insertionIndex, 0, movedExpr);

          const normalizedParent = normalizeMul(nextFactors as MJ[]);
          nextRoot = setAtPath(nextRoot, dotParentPath, normalizedParent);
        } else {
          // Dot is a side root or standalone expression; wrap into a product.
          const product = normalizeMul(
            targetSlot === 0 ? [movedExpr, nextDot] : [nextDot, movedExpr],
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
  if (
    shouldBlockCrossEqualDenominatorMoveFromAddSide(
      tree,
      movedId,
      sideInfoFrom.sideRootId,
    )
  ) {
    return null;
  }

  const movedPath = tree.pathById[movedId];
  if (!movedPath) return null;
  const fromParentPathForExpr = tree.pathById[fromParentId];
  const movedExpr =
    isMulOp(fromParentOp) &&
    fromParentPathForExpr &&
    movedIdsInFromParent.length > 1
      ? (() => {
          const mulExpr = getAtPath(
            tree.rootJson,
            fromParentPathForExpr,
          ) as MJNode;
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
              .filter((f): f is MJ => f !== undefined),
          );
        })()
      : (getAtPath(tree.rootJson, movedPath) as MJ);
  if (movedExpr == null) return null;
  const destinationSideIsAdd =
    tree.nodesById[sideInfoTo.sideRootId]?.op === "Add";
  const destRootId = sideInfoTo.sideRootId;
  const destRootPath = tree.pathById[destRootId];
  if (!destRootPath) return null;
  const movedParentId = tree.parentById[movedId];
  const movedParentOp = movedParentId
    ? tree.nodesById[movedParentId]?.op
    : null;
  const movedParentPath = movedParentId ? tree.pathById[movedParentId] : null;

  const movedWasDivisor = isUnderDenominatorOfSideRoot(
    tree,
    sideInfoFrom.sideRootId,
    movedId,
  ) || isUnderDenominatorOfFractionSideRoot(tree, sideInfoFrom.sideRootId, movedId);
  const movedFromDenominatorProductSubset =
    movedWasDivisor &&
    movedParentId != null &&
    movedParentOp != null &&
    (movedParentOp === "InvisibleOperator" || movedParentOp === "Multiply") &&
    (() => {
      const parentOfMovedParent = tree.parentById[movedParentId];
      if (!parentOfMovedParent) return false;
      if (tree.nodesById[parentOfMovedParent]?.op !== "Divide") return false;
      if (tree.childIndexById[movedParentId] !== 1) return false;
      const siblings = tree.childrenById[movedParentId] ?? [];
      if (!(siblings.length > 1 && movedIdsInFromParent.length < siblings.length)) {
        return false;
      }
      // When the divide numerator is 1 (e.g., -1/(A B)), moving one denominator
      // factor across '=' should multiply the destination side by that factor.
      const divideChildren = tree.childrenById[parentOfMovedParent] ?? [];
      const numeratorId = divideChildren[0];
      const numeratorPath = numeratorId ? tree.pathById[numeratorId] : null;
      const numeratorExpr = numeratorPath ? (getAtPath(tree.rootJson, numeratorPath) as MJ) : null;
      return !(numeratorExpr != null && isOneTerm(numeratorExpr));
    })();

  const destHoverNode = tree.nodesById[hover];
  const isMultiplicativeContainer =
    destHoverNode?.op === "InvisibleOperator" ||
    destHoverNode?.op === "Multiply";

  // Remove/divide out the moved factor from its origin side.
  let nextRoot: MJ = tree.rootJson;

  if (!movedWasDivisor) {
    const fromRootPath = tree.pathById[sideInfoFrom.sideRootId];
    if (!fromRootPath) return null;
    const fromExpr = getAtPath(nextRoot, fromRootPath) as MJ;
    const updatedFrom = divideSideByFactor(fromExpr, movedExpr);
    nextRoot = setAtPath(nextRoot, fromRootPath, updatedFrom);
  } else if (
    movedParentId &&
    movedParentPath &&
    movedParentOp === "Divide"
  ) {
    const extraction = extractFromDivide(tree, movedParentId, movedId);
    if (!extraction) return null;
    nextRoot = setAtPath(nextRoot, movedParentPath, extraction.updatedDivide);
  } else if (
    movedParentId &&
    movedParentPath &&
    movedParentOp === "FractionDerivative"
  ) {
    const kids = tree.childrenById[movedParentId] ?? [];
    if (kids.length !== 2) return null;
    const [numId, denId] = kids;
    if (!isAncestorOrSelf(tree, denId, movedId)) return null;
    const numPath = tree.pathById[numId];
    if (!numPath) return null;
    const numExpr = getAtPath(nextRoot, numPath) as MJ;
    nextRoot = setAtPath(nextRoot, movedParentPath, numExpr);
  } else if (
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

  if (!isHoveringSideRoot && targetSlot != null) {
    // Cross-equal multiplicative moves onto an additive destination side must
    // not target a single term/factor.
    if (destinationSideIsAdd) return null;
    const hoverParentId = tree.parentById[hoverNodeId];
    const hoverParentOp = hoverParentId ? tree.nodesById[hoverParentId]?.op : null;
    const hoverParentPath = hoverParentId ? tree.pathById[hoverParentId] : null;
    const hoverPath = tree.pathById[hoverNodeId];
    const isDestFactorHover =
      !!hoverParentId &&
      !!hoverParentPath &&
      !!hoverPath &&
      (hoverParentOp === "InvisibleOperator" || hoverParentOp === "Multiply") &&
      hoverPath.length > destRootPath.length &&
      hoverPath.slice(0, destRootPath.length).every((v, i) => v === destRootPath[i]);

    if (isDestFactorHover) {
      const parentExpr = getAtPath(nextRoot, hoverParentPath) as MJ;
      if (!Array.isArray(parentExpr)) return null;
      const [parentOpExpr, ...factors] = parentExpr;
      if (parentOpExpr !== "InvisibleOperator" && parentOpExpr !== "Multiply") return null;

      const siblings = tree.childrenById[hoverParentId] ?? [];
      const hoverIndex = siblings.indexOf(hoverNodeId);
      if (hoverIndex < 0) return null;

      const nextFactors = [...factors] as MJ[];
      if (targetSlot === 1) {
        const hoveredFactor = nextFactors[hoverIndex] as MJ;
        if (!movedWasDivisor) {
          nextFactors[hoverIndex] = ["Divide", hoveredFactor, movedExpr] as MJNode;
        } else {
          nextFactors[hoverIndex] = [
            "Divide",
            hoveredFactor,
            wrapForMultiplicativeInsertion(movedExpr),
          ] as MJNode;
        }
      } else {
        const insertion: MJ = movedWasDivisor
          ? movedExpr
          : (["Divide", 1, movedExpr] as MJNode);
        const slot = targetSlot === 0 ? hoverIndex : hoverIndex + 1;
        nextFactors.splice(slot, 0, insertion);
      }

      const nextParent = normalizeMul(nextFactors);
      nextRoot = setAtPath(nextRoot, hoverParentPath, nextParent);
      return ExpressionTree.create(nextRoot);
    }
  }

  // Handle side root drops: whole division vs edge insertion
  if (isHoveringSideRoot) {
    const destExpr = getAtPath(nextRoot, destRootPath) as MJ;
    const keepDenominatorFactorOrientation =
      movedWasDivisor &&
      movedFromDenominatorProductSubset &&
      isReciprocalDivideExpr(destExpr);
    let updatedDest: MJ;

    if (targetSlot === null) {
      // Whole division: divide the entire expression
      if (movedWasDivisor && destExpr) {
        // Denominator factors moved across "=" multiply the destination side.
        updatedDest = normalizeMul([destExpr, wrapForMultiplicativeInsertion(movedExpr)]);
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
        ? movedFromDenominatorProductSubset
          ? keepDenominatorFactorOrientation
            ? wrapForMultiplicativeInsertion(movedExpr)
            : (["Divide", 1, wrapForMultiplicativeInsertion(movedExpr)] as MJNode)
          : wrapForMultiplicativeInsertion(movedExpr)
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
        ? movedFromDenominatorProductSubset
          ? keepDenominatorFactorOrientation
            ? wrapForMultiplicativeInsertion(movedExpr)
            : (["Divide", 1, wrapForMultiplicativeInsertion(movedExpr)] as MJNode)
          : wrapForMultiplicativeInsertion(movedExpr)
        : (["Divide", 1, movedExpr] as MJNode);
      // Wrap destExpr in delimiter if it's an Add to preserve grouping
      const wrappedDest =
        Array.isArray(destExpr) && destExpr[0] === "Add"
          ? (["Delimiter", destExpr] as MJNode)
          : destExpr;
      updatedDest = foldReciprocalIntoTail(wrappedDest, reciprocal);
    }
    nextRoot = setAtPath(nextRoot, destRootPath, updatedDest);
  } else {
    // Default: update the entire destination side (fallback for non-side-root hovers)
    const destExpr = getAtPath(nextRoot, destRootPath) as MJ;
    let updatedDest: MJ;
    if (movedWasDivisor && destExpr) {
      // Denominator factors moved across "=" multiply the destination side.
      updatedDest = normalizeMul([destExpr, wrapForMultiplicativeInsertion(movedExpr)]);
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

    // FractionDerivative should collapse when denominator becomes 1 after pull-out.
    const fromRootOp = tree.nodesById[sideInfoFrom.sideRootId]?.op;
    if (
      Array.isArray(node) &&
      fromRootOp === "FractionDerivative" &&
      isOneTerm(node[2] as MJ)
    ) {
      nextRoot = setAtPath(nextRoot, fromRootPath, node[1] as MJ);
    }
  }

  return ExpressionTree.create(nextRoot);
}
