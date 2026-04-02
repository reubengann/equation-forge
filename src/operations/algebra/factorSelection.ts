import { ExpressionTree, type MJ, type MJNode } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import { box, normalizeMathJson } from "../../computeEngine";
import type { ExprSelection } from "../../selectionSemantics";

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

function factorsOf(expr: MJ): MJ[] {
  if (Array.isArray(expr) && (expr[0] === "InvisibleOperator" || expr[0] === "Multiply")) {
    const children = expr.slice(1) as MJ[];
    return children.flatMap(factorsOf);
  }
  return [expr];
}

function buildProductFromFactors(factors: MJ[]): MJ {
  if (factors.length === 0) return 1;
  if (factors.length === 1) return factors[0];
  return ["InvisibleOperator", ...factors] as MJNode;
}

function buildAddFromTerms(terms: MJ[]): MJ {
  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0];
  return ["Add", ...terms] as MJNode;
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

function unwrapNegate(expr: MJ): { sign: 1 | -1; core: MJ } {
  let sign: 1 | -1 = 1;
  let cur: MJ = expr;
  while (Array.isArray(cur) && cur[0] === "Negate" && cur.length >= 2) {
    sign = (sign * -1) as 1 | -1;
    cur = cur[1] as MJ;
  }
  return { sign, core: unwrapDelimiter(cur) };
}

function isAncestorOrSelf(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function flattenAddTermIds(tree: ExpressionTree, addId: string): string[] {
  const out: string[] = [];
  const walk = (nodeId: string) => {
    if (tree.nodesById[nodeId]?.op === "Add") {
      const kids = tree.childrenById[nodeId] ?? [];
      for (const kid of kids) walk(kid);
      return;
    }
    out.push(nodeId);
  };
  walk(addId);
  return out;
}

function isNumericLiteral(expr: MJ): number | null {
  if (typeof expr === "number") return expr;
  if (typeof expr === "string" && /^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
  return null;
}

function gcdInts(values: number[]): number {
  const abs = values.map((v) => Math.abs(Math.trunc(v)));
  const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
  return abs.reduce((acc, v) => g(acc, v));
}

function commonFactorFromAdd(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length < 3) return null;
  const terms = expr.slice(1) as MJ[];
  if (terms.length < 2) return null;

  // Collect factors per term
  type TermInfo = { numeric: number; rest: MJ[] };
  const termInfos: TermInfo[] = [];

  for (const term of terms) {
    const { sign, core } = unwrapNegate(term);
    const factors = factorsOf(core);
    let numeric = sign;
    const rest: MJ[] = [];
    for (const f of factors) {
      const num = isNumericLiteral(f);
      if (num !== null) {
        numeric *= num;
      } else {
        rest.push(f);
      }
    }
    termInfos.push({ numeric, rest });
  }

  // Numeric common factor (integers only to stay safe)
  let numericCommon = 1;
  const numericValues = termInfos.map((t) => t.numeric);
  if (numericValues.every((v) => Number.isInteger(v))) {
    numericCommon = gcdInts(numericValues);
    if (numericCommon === 0) numericCommon = 1;
  }

  // Symbolic common factors (based on first term)
  const commonFactors: MJ[] = [];
  const [first, ...restInfos] = termInfos;
  const baseCandidates = [...first.rest];
  let firstWorking = [...first.rest];
  let restWorking = restInfos.map((info) => ({ ...info, rest: [...info.rest] }));

  for (const f of baseCandidates) {
    let ok = true;
    for (let i = 0; i < restWorking.length; i += 1) {
      const removal = removeFactorOnce(restWorking[i].rest, unwrapDelimiter(f));
      if (!removal.removed) {
        ok = false;
        break;
      }
      restWorking[i] = { ...restWorking[i], rest: removal.remaining };
    }
    if (ok) {
      commonFactors.push(f);
      const updatedFirstRemoval = removeFactorOnce(firstWorking, unwrapDelimiter(f));
      firstWorking = updatedFirstRemoval.remaining;
    }
  }
  first.rest.splice(0, first.rest.length, ...firstWorking);
  for (let i = 0; i < restInfos.length; i += 1) {
    restInfos[i] = restWorking[i];
  }

  const hasSymbolic = commonFactors.length > 0;
  const hasNumeric = numericCommon !== 1;
  if (!hasSymbolic && !hasNumeric) return null;

  // Build factored terms
  const factoredTerms: MJ[] = [];
  const allTerms = [first, ...restInfos];
  for (const info of allTerms) {
    const factors: MJ[] = [];
    const residualNumeric = info.numeric / numericCommon;
    let remainingRest = info.rest;
    for (const cf of commonFactors) {
      const removal = removeFactorOnce(remainingRest, unwrapDelimiter(cf));
      remainingRest = removal.remaining;
    }

    if (residualNumeric === -1 && remainingRest.length > 0) {
      const termExpr = ["Negate", buildProductFromFactors(remainingRest)] as MJ;
      factoredTerms.push(termExpr);
      continue;
    }

    if (residualNumeric !== 1 || remainingRest.length === 0) {
      factors.push(residualNumeric);
    }

    factors.push(...remainingRest);

    const termExpr = buildProductFromFactors(factors);
    factoredTerms.push(termExpr);
  }

  const commonProductFactors: MJ[] = [];
  if (hasNumeric) commonProductFactors.push(numericCommon);
  commonProductFactors.push(...commonFactors);
  const commonProduct = buildProductFromFactors(commonProductFactors);
  const innerAdd = buildAddFromTerms(factoredTerms);
  const factored = buildProductFromFactors([commonProduct, ["Delimiter", innerAdd] as MJ]);

  if (deepEqualMJ(factored, expr)) return null;
  return factored;
}

function commonDenominatorFromAdd(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length < 3) return null;
  const terms = expr.slice(1) as MJ[];

  let sharedDenominator: MJ | null = null;
  const signedNumerators: MJ[] = [];

  for (const term of terms) {
    const { sign, core } = unwrapNegate(term);
    if (!Array.isArray(core) || core[0] !== "Divide" || core.length < 3) return null;
    const numerator = core[1] as MJ;
    const denominator = unwrapDelimiter(core[2] as MJ);

    if (sharedDenominator == null) {
      sharedDenominator = denominator;
    } else if (!deepEqualMJ(sharedDenominator, denominator)) {
      return null;
    }

    signedNumerators.push(
      sign === -1 ? (["Negate", numerator] as MJNode) : numerator
    );
  }

  if (!sharedDenominator) return null;
  const numeratorAdd = buildAddFromTerms(signedNumerators);
  const factored = ["Divide", numeratorAdd, sharedDenominator] as MJ;
  if (deepEqualMJ(factored, expr)) return null;
  return factored;
}

function factorExpression(expr: MJ): MJ | null {
  const ceReady = toComputeEngine(expr);
  const ceBox = box(ceReady) as any;
  const candidates: MJ[] = [];

  const factored = ceBox?.factor?.();
  if (factored?.json) candidates.push(fromComputeEngine(factored.json as MJ));

  const collected = ceBox?.collect?.();
  if (collected?.json) candidates.push(fromComputeEngine(collected.json as MJ));

  for (const cand of candidates) {
    const normalized = normalizeMathJson(cand) ?? cand;
    if (!deepEqualMJ(normalized, expr)) return normalized;
  }

  // Deterministic fallback: common denominator from Add
  const denomFactored = commonDenominatorFromAdd(expr);
  if (denomFactored && !deepEqualMJ(denomFactored, expr)) return denomFactored;

  // Deterministic fallback: common factor from Add
  const fallback = commonFactorFromAdd(expr);
  if (fallback && !deepEqualMJ(fallback, expr)) return fallback;

  return null;
}

function computeFactoredRoot(tree: ExpressionTree, sel: ExprSelection): MJ | null {
  if (sel.kind === "multi") {
    const selectedIds = Array.from(new Set(sel.nodeIds));
    if (selectedIds.length < 2) return null;
    const addAncestors = (nodeId: string): string[] => {
      const out: string[] = [];
      let cur: string | null = nodeId;
      while (cur) {
        const parentId = tree.parentById[cur];
        if (!parentId) break;
        if (tree.nodesById[parentId]?.op === "Add") out.push(parentId);
        cur = parentId;
      }
      return out;
    };

    const firstAddAncestors = addAncestors(selectedIds[0]);
    const commonAddId =
      firstAddAncestors.find((candidate) =>
        selectedIds.every((id) => isAncestorOrSelf(tree, candidate, id))
      ) ?? null;
    if (!commonAddId) return null;

    const flatTermIds = flattenAddTermIds(tree, commonAddId);
    if (flatTermIds.length < 2) return null;

    const selectedTermIndices = Array.from(
      new Set(
        selectedIds
          .map((id) =>
            flatTermIds.findIndex((termId) => isAncestorOrSelf(tree, termId, id))
          )
          .filter((idx) => idx >= 0)
      )
    ).sort((a, b) => a - b);
    if (selectedTermIndices.length < 2) return null;

    const start = selectedTermIndices[0];
    const end = selectedTermIndices[selectedTermIndices.length - 1];
    if (end - start + 1 !== selectedTermIndices.length) return null;

    const parentPath = tree.pathById[commonAddId];
    if (!parentPath) return null;
    const termExprs = flatTermIds.map((id) => {
      const p = tree.pathById[id];
      return p ? (getAtPath(tree.rootJson, p) as MJ) : null;
    });
    if (termExprs.some((x) => x == null)) return null;
    const typedTerms = termExprs as MJ[];
    const segmentExpr = buildAddFromTerms(typedTerms.slice(start, end + 1));
    const factoredSegment = factorExpression(segmentExpr);
    if (!factoredSegment || deepEqualMJ(factoredSegment, segmentExpr)) return null;

    const rebuiltTerms = [
      ...typedTerms.slice(0, start),
      factoredSegment,
      ...typedTerms.slice(end + 1),
    ];
    const rebuiltAdd = buildAddFromTerms(rebuiltTerms);
    return setAtPath(tree.rootJson, parentPath, rebuiltAdd) as MJ;
  }

  if (sel.kind === "node") {
    const path = tree.pathById[sel.nodeId];
    if (!path) return null;
    const target = getAtPath(tree.rootJson, path) as MJ;
    if (
      Array.isArray(target) &&
      (target[0] === "Delimiter" || target[0] === "List") &&
      target.length >= 2
    ) {
      const inner = target[1] as MJ;
      const factoredInner = factorExpression(inner);
      if (!factoredInner || deepEqualMJ(factoredInner, inner)) return null;
      const wrapped = [target[0], factoredInner] as MJ;
      return setAtPath(tree.rootJson, path, wrapped) as MJ;
    }
    const factored = factorExpression(target);
    if (!factored) return null;
    if (deepEqualMJ(factored, target)) return null;
    return setAtPath(tree.rootJson, path, factored) as MJ;
  }

  // Span selection: factor the selected slice within an Add
  const parentPath = tree.pathById[sel.parentId];
  if (!parentPath) return null;
  const parent = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parent) || parent[0] !== "Add") return null;
  const kids = parent.slice(1) as MJ[];
  if (kids.length === 0) return null;
  const { start, end } = sel;
  if (start < 0 || end >= kids.length || start > end) return null;

  const segment = kids.slice(start, end + 1);
  const segmentExpr = buildAddFromTerms(segment);
  const factoredSegment = factorExpression(segmentExpr);
  if (!factoredSegment || deepEqualMJ(factoredSegment, segmentExpr)) return null;

  const nextKids = [...kids.slice(0, start), factoredSegment, ...kids.slice(end + 1)];
  const rebuiltParent = buildAddFromTerms(nextKids);
  return setAtPath(tree.rootJson, parentPath, rebuiltParent) as MJ;
}

export function factorSelection(tree: ExpressionTree, sel: ExprSelection): ExpressionTree | null {
  const nextRoot = computeFactoredRoot(tree, sel);
  if (!nextRoot) return null;
  return ExpressionTree.create(nextRoot);
}

export function canFactorSelection(tree: ExpressionTree | null, sel: ExprSelection | null): boolean {
  if (!tree || !sel) return false;
  if (computeFactoredRoot(tree, sel) !== null) return true;

  // Be permissive for multi/span selections to avoid false negatives in UI enablement.
  // The executor still performs full structural validation.
  if (sel.kind === "multi") return sel.nodeIds.length >= 2;
  if (sel.kind === "span") return sel.end > sel.start;
  return false;
}
