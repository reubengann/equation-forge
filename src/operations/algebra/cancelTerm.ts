import { ExpressionTree, type MJ, type MJNode } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import { normalizeMathJson, box } from "../../computeEngine";
import type { ExprSelection } from "../../selectionSemantics";
import { getDescendantNodeIds } from "../../selectionSemantics";

type CancellablePairResult =
  | { kind: "divide"; nodeId: string; nextExpr: MJ }
  | { kind: "equal"; nodeId: string; nextExpr: MJ };

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

function unwrapDelimiter(expr: MJ): MJ {
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    return expr[1] as MJ;
  }
  return expr;
}

function toComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const mappedOp = op === "InvisibleOperator" ? ("Multiply" as const) : op;
  return [mappedOp, ...expr.slice(1).map(toComputeEngine)] as MJ;
}

function fromComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const mappedOp = op === "Multiply" ? ("InvisibleOperator" as const) : op;
  return [mappedOp, ...expr.slice(1).map(fromComputeEngine)] as MJ;
}

function simplify(expr: MJ): MJ {
  const ceReady = toComputeEngine(expr);
  const simplifiedBox = box(ceReady)?.simplify?.();
  const simplified = simplifiedBox ? (simplifiedBox.json as MJ) : ceReady;
  const back = fromComputeEngine(simplified);
  return normalizeMathJson(back) ?? back;
}

function isZeroEquivalent(expr: MJ): boolean {
  const simp = simplify(expr);
  if (simp === 0 || simp === "0") return true;
  if (Array.isArray(simp) && simp[0] === "Negate") {
    const inner = simp[1] as MJ;
    if (inner === 0 || inner === "0") return true;
  }
  return false;
}

function isOneEquivalent(expr: MJ): boolean {
  const simp = simplify(expr);
  return simp === 1 || simp === "1";
}

function normalizeAdd(terms: MJ[]): MJ {
  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0];
  return ["Add", ...terms] as MJNode;
}

function normalizeMul(factors: MJ[]): MJ {
  if (factors.length === 0) return 1;
  if (factors.length === 1) return factors[0];
  return ["InvisibleOperator", ...factors] as MJNode;
}

function factorsOf(expr: MJ): MJ[] {
  if (Array.isArray(expr) && expr[0] === "InvisibleOperator") {
    const children = expr.slice(1) as MJ[];
    return children.flatMap(factorsOf);
  }
  return [expr];
}

function buildProductFromFactors(factors: MJ[]): MJ {
  return normalizeMul(factors);
}

function buildAddFromTerms(terms: MJ[]): MJ {
  return normalizeAdd(terms);
}

function unwrapNegate(expr: MJ): { sign: 1 | -1; core: MJ } {
  let sign: 1 | -1 = 1;
  let cur: MJ = expr;
  while (Array.isArray(cur) && cur[0] === "Negate" && cur.length >= 2) {
    sign = (sign * -1) as 1 | -1;
    cur = cur[1] as MJ;
  }
  return { sign, core: unwrapDelimiter(cur) };
}

function removeTermOnce(terms: MJ[], targetCanonical: MJ): { remaining: MJ[]; removed: boolean } {
  const remaining: MJ[] = [];
  let removed = false;
  for (const t of terms) {
    const canon = unwrapDelimiter(t);
    if (!removed && deepEqualMJ(canon, targetCanonical)) {
      removed = true;
      continue;
    }
    remaining.push(t);
  }
  return { remaining, removed };
}

function removeFactorFromAddTerms(
  addExpr: MJ,
  targetCanonical: MJ
): { next: MJ; removed: boolean } | null {
  if (!Array.isArray(addExpr) || addExpr[0] !== "Add") return null;

  const terms = addExpr.slice(1) as MJ[];
  const nextTerms: MJ[] = [];

  for (const term of terms) {
    const { sign, core } = unwrapNegate(term);
    const factors = factorsOf(core);
    const removal = removeFactorOnce(factors, targetCanonical);
    if (!removal.removed) return null;
    const rebuilt = buildProductFromFactors(removal.remaining);
    const withSign = sign === -1 ? (["Negate", rebuilt] as MJNode) : rebuilt;
    nextTerms.push(withSign);
  }

  return { next: buildAddFromTerms(nextTerms), removed: true };
}

function isDescendant(tree: ExpressionTree, nodeId: string, ancestorId: string): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function removeFactorOnce(factors: MJ[], targetCanonical: MJ): { remaining: MJ[]; removed: boolean } {
  const remaining: MJ[] = [];
  let removed = false;
  for (const f of factors) {
    const canon = unwrapDelimiter(f);
    if (!removed && deepEqualMJ(canon, targetCanonical)) {
      removed = true;
      continue;
    }
    remaining.push(f);
  }
  return { remaining, removed };
}

function findDivideAncestor(
  tree: ExpressionTree,
  nodeId: string
): { divideId: string; inNumerator: boolean } | null {
  let cursor: string | null = nodeId;
  while (cursor) {
    const op = tree.nodesById[cursor]?.op;
    if (op === "Divide") {
      const kids = tree.childrenById[cursor] ?? [];
      if (kids.length !== 2) return null;
      const [numId, denId] = kids;
      const inNum = isDescendant(tree, nodeId, numId);
      const inDen = isDescendant(tree, nodeId, denId);
      if (inNum === inDen) return null;
      return { divideId: cursor, inNumerator: inNum };
    }
    cursor = tree.parentById[cursor] ?? null;
  }
  return null;
}

function findEqualAncestor(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; isLhs: boolean } | null {
  let cursor: string | null = nodeId;
  while (cursor) {
    const op = tree.nodesById[cursor]?.op;
    if (op === "Equal") {
      const kids = tree.childrenById[cursor] ?? [];
      if (kids.length < 2) return null;
      const lhsId = kids[0];
      const rhsId = kids[1];
      const inLhs = isDescendant(tree, nodeId, lhsId);
      const inRhs = isDescendant(tree, nodeId, rhsId);
      if (inLhs === inRhs) return null;
      return { equalId: cursor, isLhs: inLhs };
    }
    cursor = tree.parentById[cursor] ?? null;
  }
  return null;
}

function cancelSelectedPairInFraction(
  tree: ExpressionTree,
  aId: string,
  bId: string
): CancellablePairResult | null {
  const aDivide = findDivideAncestor(tree, aId);
  const bDivide = findDivideAncestor(tree, bId);
  if (!aDivide || !bDivide) return null;
  if (aDivide.divideId !== bDivide.divideId) return null;
  if (aDivide.inNumerator === bDivide.inNumerator) return null;

  const divideId = aDivide.divideId;
  const kids = tree.childrenById[divideId] ?? [];
  if (kids.length !== 2) return null;
  const [numId, denId] = kids;

  const aExpr = tree.nodesById[aId]?.json;
  const bExpr = tree.nodesById[bId]?.json;
  const numExpr = tree.nodesById[numId]?.json;
  const denExpr = tree.nodesById[denId]?.json;
  if (aExpr == null || bExpr == null || numExpr == null || denExpr == null) return null;

  const aCanonical = unwrapDelimiter(aExpr);
  const bCanonical = unwrapDelimiter(bExpr);
  if (!deepEqualMJ(aCanonical, bCanonical)) return null;

  const target = aCanonical;

  // Try to remove the target from every addend in the numerator when the numerator is an Add.
  let nextNum: MJ | null = null;
  let numRemoved = false;
  const numAddRemoval = removeFactorFromAddTerms(numExpr, target);
  if (numAddRemoval?.removed) {
    nextNum = numAddRemoval.next;
    numRemoved = true;
  }

  // Fallback: multiplicative removal.
  if (!numRemoved) {
    const numFactorsRaw = factorsOf(numExpr);
    const numRemoval = removeFactorOnce(numFactorsRaw, target);
    if (numRemoval.removed) {
      nextNum = buildProductFromFactors(numRemoval.remaining);
      numRemoved = true;
    }
  }

  const denFactorsRaw = factorsOf(denExpr);
  const denRemoval = removeFactorOnce(denFactorsRaw, target);
  if (!numRemoved || !denRemoval.removed) return null;

  if (!nextNum) return null;
  const nextDen = buildProductFromFactors(denRemoval.remaining);

  const nextExpr: MJ = isOneEquivalent(nextDen)
    ? nextNum
    : (["Divide", nextNum, nextDen] as MJNode);

  return { kind: "divide", nodeId: divideId, nextExpr };
}

function cancelSelectedPairInEqual(
  tree: ExpressionTree,
  aId: string,
  bId: string
): CancellablePairResult | null {
  const aEqual = findEqualAncestor(tree, aId);
  const bEqual = findEqualAncestor(tree, bId);
  if (!aEqual || !bEqual) return null;
  if (aEqual.equalId !== bEqual.equalId) return null;
  if (aEqual.isLhs === bEqual.isLhs) return null;

  const equalId = aEqual.equalId;
  const kids = tree.childrenById[equalId] ?? [];
  if (kids.length < 2) return null;
  const lhsId = kids[0];
  const rhsId = kids[1];

  const aExpr = tree.nodesById[aId]?.json;
  const bExpr = tree.nodesById[bId]?.json;
  const lhsExpr = tree.nodesById[lhsId]?.json;
  const rhsExpr = tree.nodesById[rhsId]?.json;
  if (aExpr == null || bExpr == null || lhsExpr == null || rhsExpr == null) return null;

  const lhsIsZero = isZeroEquivalent(lhsExpr);
  const rhsIsZero = isZeroEquivalent(rhsExpr);

  // If exactly one side is zero, allow cancelling any multiplicative factor on the non-zero side.
  if (lhsIsZero !== rhsIsZero) {
    const zeroIsLhs = lhsIsZero;
    const zeroExpr = zeroIsLhs ? lhsExpr : rhsExpr;
    const nonZeroExpr = zeroIsLhs ? rhsExpr : lhsExpr;
    const factorId = aEqual.isLhs === zeroIsLhs ? bId : aId;
    const factorExpr = tree.nodesById[factorId]?.json;
    if (!factorExpr) return null;
    const factorCanonical = unwrapDelimiter(factorExpr);

    const addRemoval = removeFactorFromAddTerms(nonZeroExpr, factorCanonical);
    if (addRemoval?.removed) {
      const nextNonZero = unwrapDelimiter(addRemoval.next);
      const nextExpr: MJ = zeroIsLhs
        ? (["Equal", zeroExpr, nextNonZero] as MJNode)
        : (["Equal", nextNonZero, zeroExpr] as MJNode);
      return { kind: "equal", nodeId: equalId, nextExpr };
    }

    const nonZeroFactors = factorsOf(nonZeroExpr);
    const nonZeroRemoval = removeFactorOnce(nonZeroFactors, factorCanonical);
    if (nonZeroRemoval.removed) {
      const nextNonZero = unwrapDelimiter(buildProductFromFactors(nonZeroRemoval.remaining));
      const nextExpr: MJ = zeroIsLhs
        ? (["Equal", zeroExpr, nextNonZero] as MJNode)
        : (["Equal", nextNonZero, zeroExpr] as MJNode);
      return { kind: "equal", nodeId: equalId, nextExpr };
    }
  }

  const aCanonical = unwrapDelimiter(aExpr);
  const bCanonical = unwrapDelimiter(bExpr);
  if (!deepEqualMJ(aCanonical, bCanonical)) return null;

  // --- Additive cancellation ---
  const lhsTerms = Array.isArray(lhsExpr) && lhsExpr[0] === "Add" ? (lhsExpr as MJ[]).slice(1) : [lhsExpr];
  const rhsTerms = Array.isArray(rhsExpr) && rhsExpr[0] === "Add" ? (rhsExpr as MJ[]).slice(1) : [rhsExpr];
  const lhsTermRemoval = removeTermOnce(lhsTerms, aCanonical);
  const rhsTermRemoval = removeTermOnce(rhsTerms, aCanonical);

  if (lhsTermRemoval.removed && rhsTermRemoval.removed) {
    const nextLhs = buildAddFromTerms(lhsTermRemoval.remaining);
    const nextRhs = buildAddFromTerms(rhsTermRemoval.remaining);
    const nextExpr: MJ = ["Equal", nextLhs, nextRhs] as MJNode;
    return { kind: "equal", nodeId: equalId, nextExpr };
  }

  // --- Additive-with-factor cancellation (common factor across an Add side) ---
  const lhsAddFactorRemoval = removeFactorFromAddTerms(lhsExpr, aCanonical);
  const rhsAddFactorRemoval = removeFactorFromAddTerms(rhsExpr, aCanonical);

  // LHS is Add with common factor, RHS multiplicative
  if (lhsAddFactorRemoval?.removed) {
    const rhsFactors = factorsOf(rhsExpr);
    const rhsRemoval = removeFactorOnce(rhsFactors, aCanonical);
    if (rhsRemoval.removed) {
      const nextLhs = lhsAddFactorRemoval.next;
      const nextRhs = buildProductFromFactors(rhsRemoval.remaining);
      const nextExpr: MJ = ["Equal", nextLhs, nextRhs] as MJNode;
      return { kind: "equal", nodeId: equalId, nextExpr };
    }
  }

  // RHS is Add with common factor, LHS multiplicative
  if (rhsAddFactorRemoval?.removed) {
    const lhsFactors = factorsOf(lhsExpr);
    const lhsRemoval = removeFactorOnce(lhsFactors, aCanonical);
    if (lhsRemoval.removed) {
      const nextLhs = buildProductFromFactors(lhsRemoval.remaining);
      const nextRhs = rhsAddFactorRemoval.next;
      const nextExpr: MJ = ["Equal", nextLhs, nextRhs] as MJNode;
      return { kind: "equal", nodeId: equalId, nextExpr };
    }
  }

  // --- Multiplicative cancellation ---
  const lhsFactors = factorsOf(lhsExpr);
  const rhsFactors = factorsOf(rhsExpr);
  const lhsRemoval = removeFactorOnce(lhsFactors, aCanonical);
  const rhsRemoval = removeFactorOnce(rhsFactors, aCanonical);

  if (lhsRemoval.removed && rhsRemoval.removed) {
    const nextLhs = buildProductFromFactors(lhsRemoval.remaining);
    const nextRhs = buildProductFromFactors(rhsRemoval.remaining);
    const nextExpr: MJ = ["Equal", nextLhs, nextRhs] as MJNode;
    return { kind: "equal", nodeId: equalId, nextExpr };
  }

  return null;
}

function cancelSingleFactorWhenOtherSideIsZero(tree: ExpressionTree, selId: string): ExpressionTree | null {
  const equalInfo = findEqualAncestor(tree, selId);
  if (!equalInfo) return null;

  const equalId = equalInfo.equalId;
  const kids = tree.childrenById[equalId] ?? [];
  if (kids.length < 2) return null;
  const lhsId = kids[0];
  const rhsId = kids[1];

  const lhsExpr = tree.nodesById[lhsId]?.json;
  const rhsExpr = tree.nodesById[rhsId]?.json;
  const selExpr = tree.nodesById[selId]?.json;
  if (lhsExpr == null || rhsExpr == null || selExpr == null) return null;

  const selIsLhs = equalInfo.isLhs;
  const otherIsZero = selIsLhs ? isZeroEquivalent(rhsExpr) : isZeroEquivalent(lhsExpr);
  if (!otherIsZero) return null;

  const sideExpr = selIsLhs ? lhsExpr : rhsExpr;
  const target = unwrapDelimiter(selExpr);

  // Try removing as a common factor across additive terms on the selected side.
  const addRemoval = removeFactorFromAddTerms(sideExpr, target);
  if (addRemoval?.removed) {
    const nextSide = unwrapDelimiter(addRemoval.next);
    const nextExpr: MJ = selIsLhs
      ? (["Equal", nextSide, rhsExpr] as MJNode)
      : (["Equal", lhsExpr, nextSide] as MJNode);
    const targetPath = tree.pathById[equalId];
    if (!targetPath) return null;
    const nextRoot = setAtPath(tree.rootJson, targetPath, nextExpr);
    return ExpressionTree.create(nextRoot);
  }

  // Fallback: multiplicative removal on the selected side.
  const factors = factorsOf(sideExpr);
  const removal = removeFactorOnce(factors, target);
  if (removal.removed) {
    const nextSide = unwrapDelimiter(buildProductFromFactors(removal.remaining));
    const nextExpr: MJ = selIsLhs
      ? (["Equal", nextSide, rhsExpr] as MJNode)
      : (["Equal", lhsExpr, nextSide] as MJNode);
    const targetPath = tree.pathById[equalId];
    if (!targetPath) return null;
    const nextRoot = setAtPath(tree.rootJson, targetPath, nextExpr);
    return ExpressionTree.create(nextRoot);
  }

  return null;
}

function findCancellablePair(
  tree: ExpressionTree,
  candidateIds: string[]
): CancellablePairResult | null {
  const uniqueIds = Array.from(new Set(candidateIds));
  for (let i = 0; i < uniqueIds.length; i += 1) {
    for (let j = i + 1; j < uniqueIds.length; j += 1) {
      const resFraction = cancelSelectedPairInFraction(tree, uniqueIds[i], uniqueIds[j]);
      if (resFraction) return resFraction;
      const resEqual = cancelSelectedPairInEqual(tree, uniqueIds[i], uniqueIds[j]);
      if (resEqual) return resEqual;
    }
  }
  return null;
}

function findZeroFactorCandidate(
  tree: ExpressionTree,
  candidateIds: string[]
): string | null {
  for (const id of candidateIds) {
    const info = tree.nodesById[id];
    if (!info) continue;
    if (!isZeroEquivalent(info.json)) continue;
    const parentId = tree.parentById[id];
    if (!parentId) continue;
    if (tree.nodesById[parentId]?.op !== "InvisibleOperator") continue;
    return id;
  }
  return null;
}

function spanCandidateIds(tree: ExpressionTree, selection: ExprSelection & { kind: "span" }): string[] {
  const kids = tree.childrenById[selection.parentId] ?? [];
  const slice = kids.slice(selection.start, selection.end + 1);
  return getDescendantNodeIds(tree, slice);
}

function canCancelCandidates(tree: ExpressionTree, candidateIds: string[]): boolean {
  if (candidateIds.length === 0) return false;
  if (findCancellablePair(tree, candidateIds)) return true;
  return findZeroFactorCandidate(tree, candidateIds) != null;
}

export function canCancelTerm(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree || !selection) return false;
  if (selection.kind === "multi") {
    const candidates = getDescendantNodeIds(tree, selection.nodeIds);
    return canCancelCandidates(tree, candidates);
  }
  if (selection.kind === "span") {
    const candidates = spanCandidateIds(tree, selection);
    return canCancelCandidates(tree, candidates);
  }
  if (selection.kind !== "node") return false;
  return cancelTerm(tree, selection) !== null;
}

export function cancelTerm(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  if (!selection) return null;

  if (selection.kind === "multi") {
    const candidates = getDescendantNodeIds(tree, selection.nodeIds);
    const result = findCancellablePair(tree, candidates);
    if (result) {
      const targetPath = tree.pathById[result.nodeId];
      if (!targetPath) return null;
      const nextRoot = setAtPath(tree.rootJson, targetPath, result.nextExpr);
      return ExpressionTree.create(nextRoot);
    }

    const zeroId = findZeroFactorCandidate(tree, candidates);
    if (zeroId) {
      return cancelTerm(tree, { kind: "node", nodeId: zeroId });
    }
    return null;
  }

  if (selection.kind === "span") {
    const candidates = spanCandidateIds(tree, selection);
    const result = findCancellablePair(tree, candidates);
    if (result) {
      const targetPath = tree.pathById[result.nodeId];
      if (!targetPath) return null;
      const nextRoot = setAtPath(tree.rootJson, targetPath, result.nextExpr);
      return ExpressionTree.create(nextRoot);
    }
    const zeroId = findZeroFactorCandidate(tree, candidates);
    if (zeroId) {
      return cancelTerm(tree, { kind: "node", nodeId: zeroId });
    }
    return null;
  }

  if (selection.kind !== "node") return null;

  const selId = selection.nodeId;
  const selInfo = tree.nodesById[selId];
  if (!selInfo) return null;

  // If the opposite side of an equals sign is zero, allow cancelling this factor alone.
  const zeroSideCancel = cancelSingleFactorWhenOtherSideIsZero(tree, selId);
  if (zeroSideCancel) return zeroSideCancel;

  const parentId = tree.parentById[selId];
  if (!parentId) return null;
  const parentOp = tree.nodesById[parentId]?.op;
  const parentPath = tree.pathById[parentId];
  if (!parentPath) return null;

  // 1) Sum term removal
  if (parentOp === "Add") {
    if (!isZeroEquivalent(selInfo.json)) return null;
    const addExpr = getAtPath(tree.rootJson, parentPath) as MJ;
    if (!Array.isArray(addExpr) || addExpr[0] !== "Add") return null;
    const idx = tree.childIndexById[selId];
    if (idx == null) return null;
    const remaining = (addExpr as MJNode).slice(1).filter((_, i) => i !== idx);
    const nextAdd = buildAddFromTerms(remaining);
    const nextRoot = setAtPath(tree.rootJson, parentPath, nextAdd);
    return ExpressionTree.create(nextRoot);
  }

  // 2) Product factor removal
  if (parentOp === "InvisibleOperator") {
    if (isZeroEquivalent(selInfo.json)) {
      const parentParentId = tree.parentById[parentId];
      const nextRoot = setAtPath(tree.rootJson, parentPath, 0);

      // If this product sits as a term inside a sum, remove the now-zero term.
      if (parentParentId && tree.nodesById[parentParentId]?.op === "Add") {
        const addPath = tree.pathById[parentParentId];
        if (!addPath) return ExpressionTree.create(nextRoot);
        const addExpr = getAtPath(nextRoot, addPath) as MJ;
        if (!Array.isArray(addExpr) || addExpr[0] !== "Add") {
          return ExpressionTree.create(nextRoot);
        }
        const idx = tree.childIndexById[parentId];
        if (idx == null) return ExpressionTree.create(nextRoot);
        const remaining = (addExpr as MJNode).slice(1).filter((_, i) => i !== idx);
        const nextAdd = buildAddFromTerms(remaining);
        const cleanedRoot = setAtPath(nextRoot, addPath, nextAdd);
        return ExpressionTree.create(cleanedRoot);
      }

      return ExpressionTree.create(nextRoot);
    }

    if (!isOneEquivalent(selInfo.json)) return null;
    const mulExpr = getAtPath(tree.rootJson, parentPath) as MJ;
    if (!Array.isArray(mulExpr)) return null;
    const [op, ...factors] = mulExpr;
    if (op !== "InvisibleOperator") return null;
    const idx = tree.childIndexById[selId];
    if (idx == null) return null;
    const remaining = factors.filter((_, i) => i !== idx);
    const nextMul = buildProductFromFactors(remaining);
    const nextRoot = setAtPath(tree.rootJson, parentPath, nextMul);
    return ExpressionTree.create(nextRoot);
  }

  return null;
}
