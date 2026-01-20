import { ExpressionTree, type MJ, type MJNode } from "./ExpressionTree";
import { getAtPath, setAtPath } from "./movePath";
import { normalizeMathJson, box } from "./computeEngine";
import type { ExprSelection } from "./selectionSemantics";

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
    return expr.slice(1) as MJ[];
  }
  return [expr];
}

function buildProductFromFactors(factors: MJ[]): MJ {
  return normalizeMul(factors);
}

function buildAddFromTerms(terms: MJ[]): MJ {
  return normalizeAdd(terms);
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

function cancelInFraction(
  tree: ExpressionTree,
  selectionId: string
): { divideId: string; nextExpr: MJ } | null {
  // Find nearest Divide ancestor.
  let cursor: string | null = selectionId;
  let divideId: string | null = null;
  while (cursor) {
    const op = tree.nodesById[cursor]?.op;
    if (op === "Divide") {
      divideId = cursor;
      break;
    }
    cursor = tree.parentById[cursor] ?? null;
  }
  if (!divideId) return null;

  const kids = tree.childrenById[divideId] ?? [];
  if (kids.length !== 2) return null;
  const [numId, denId] = kids;

  const inNum = isDescendant(tree, selectionId, numId);
  const inDen = isDescendant(tree, selectionId, denId);
  if (inNum === inDen) return null; // either both or neither

  const selectionExpr = tree.nodesById[selectionId]?.json;
  if (!selectionExpr) return null;

  const numExpr = tree.nodesById[numId]?.json;
  const denExpr = tree.nodesById[denId]?.json;
  if (!numExpr || !denExpr) return null;

  const selCanonical = unwrapDelimiter(selectionExpr);

  const lhsFactorsRaw = factorsOf(inNum ? numExpr : denExpr);
  const rhsFactorsRaw = factorsOf(inNum ? denExpr : numExpr);

  const lhsRemoval = removeFactorOnce(lhsFactorsRaw, selCanonical);
  if (!lhsRemoval.removed) return null;
  const rhsRemoval = removeFactorOnce(rhsFactorsRaw, selCanonical);
  if (!rhsRemoval.removed) return null;

  const nextNum = inNum
    ? buildProductFromFactors(lhsRemoval.remaining)
    : buildProductFromFactors(rhsRemoval.remaining);
  const nextDen = inNum
    ? buildProductFromFactors(rhsRemoval.remaining)
    : buildProductFromFactors(lhsRemoval.remaining);

  // Normalize Divide(num, 1) -> num
  const nextExpr: MJ = isOneEquivalent(nextDen)
    ? nextNum
    : (["Divide", nextNum, nextDen] as MJNode);

  return { divideId, nextExpr };
}

export function canCancelTerm(
  tree: ExpressionTree | null,
  selection: ExprSelection | null
): boolean {
  if (!tree || !selection || selection.kind !== "node") return false;
  const attempt = cancelTerm(tree, selection);
  return attempt !== null;
}

export function cancelTerm(
  tree: ExpressionTree,
  selection: ExprSelection | null
): ExpressionTree | null {
  if (!selection || selection.kind !== "node") return null;
  const selId = selection.nodeId;
  const selInfo = tree.nodesById[selId];
  if (!selInfo) return null;

  // 1) Fraction cancellation
  const fractionResult = cancelInFraction(tree, selId);
  if (fractionResult) {
    const dividePath = tree.pathById[fractionResult.divideId];
    if (!dividePath) return null;
    const nextRoot = setAtPath(tree.rootJson, dividePath, fractionResult.nextExpr);
    return ExpressionTree.create(nextRoot);
  }

  const parentId = tree.parentById[selId];
  if (!parentId) return null;
  const parentOp = tree.nodesById[parentId]?.op;
  const parentPath = tree.pathById[parentId];
  if (!parentPath) return null;

  // 2) Sum term removal
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

  // 3) Product factor removal
  if (parentOp === "InvisibleOperator") {
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
