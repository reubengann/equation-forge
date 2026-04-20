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

function factorsForCommonFactor(expr: MJ): MJ[] {
  const parsePositiveIntegerExponent = (value: MJ): number | null => {
    if (typeof value === "number" && Number.isInteger(value) && value > 1) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const n = Number(value);
      return n > 1 ? n : null;
    }
    return null;
  };
  const inverseFactor = (factor: MJ): MJ => ["Divide", 1, factor] as MJ;
  const expand = (value: MJ, reciprocal = false): MJ[] => {
    const unwrappedValue = unwrapDelimiter(value);
    if (Array.isArray(unwrappedValue)) {
      const op = unwrappedValue[0];
      if (op === "InvisibleOperator" || op === "Multiply") {
        return (unwrappedValue.slice(1) as MJ[]).flatMap((child) =>
          expand(child as MJ, reciprocal),
        );
      }
      if (op === "Divide" && unwrappedValue.length >= 3) {
        const numerator = unwrappedValue[1] as MJ;
        const denominator = unwrappedValue[2] as MJ;
        if (!reciprocal) {
          return [...expand(numerator, false), ...expand(denominator, true)];
        }
        return [...expand(denominator, false), ...expand(numerator, true)];
      }
      if (op === "Power" && unwrappedValue.length >= 3) {
        const exponent = parsePositiveIntegerExponent(unwrappedValue[2] as MJ);
        if (exponent !== null && exponent <= 12) {
          return Array.from({ length: exponent }, () =>
            reciprocal
              ? inverseFactor(unwrappedValue[1] as MJ)
              : (unwrappedValue[1] as MJ),
          );
        }
      }
    }
    return [reciprocal ? inverseFactor(unwrappedValue) : unwrappedValue];
  };

  const unwrapped = unwrapDelimiter(expr);
  return expand(unwrapped, false);
}

function buildProductFromFactors(factors: MJ[]): MJ {
  const mergeRepeatedFactors = (input: MJ[]): MJ[] => {
    const out: MJ[] = [];
    let i = 0;
    while (i < input.length) {
      const cur = input[i] as MJ;
      let j = i + 1;
      while (j < input.length && deepEqualMJ(input[j] as MJ, cur)) j += 1;
      const count = j - i;
      if (count > 1 && typeof cur !== "number") {
        out.push(["Power", cur, count] as MJ);
      } else {
        out.push(cur);
      }
      i = j;
    }
    return out;
  };
  const combineLeadingReciprocals = (input: MJ[]): MJ[] => {
    const out: MJ[] = [];
    for (const factor of input) {
      if (
        Array.isArray(factor) &&
        factor[0] === "Divide" &&
        factor.length >= 3 &&
        factor[1] === 1 &&
        out.length > 0
      ) {
        const prev = out[out.length - 1] as MJ;
        out[out.length - 1] = ["Divide", prev, factor[2] as MJ] as MJ;
        continue;
      }
      out.push(factor);
    }
    return out;
  };

  const compacted = combineLeadingReciprocals(mergeRepeatedFactors(factors));
  if (compacted.length === 0) return 1;
  if (compacted.length === 1) return compacted[0];
  return ["InvisibleOperator", ...compacted] as MJNode;
}

function buildAddFromTerms(terms: MJ[]): MJ {
  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0];
  return ["Add", ...terms] as MJNode;
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
  const absScalar = absoluteNumericMJ(expr);
  if (absScalar !== null) return ["Negate", absScalar] as MJ;
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  if (op !== "InvisibleOperator" && op !== "Multiply") return expr;

  const factors = expr.slice(1) as MJ[];
  if (factors.length === 0) return expr;
  const firstAbs = absoluteNumericMJ(factors[0] as MJ);
  if (firstAbs === null) return expr;

  const rest = [firstAbs, ...factors.slice(1)] as MJ[];
  const product = rest.length === 1 ? rest[0] : ([op, ...rest] as MJ);
  return ["Negate", product] as MJ;
}

function normalizeNegativeTermsInAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((child) => normalizeNegativeTermsInAdd(child as MJ)) as MJ[];
  if (op !== "Add") return [op, ...kids] as MJ;
  const terms = kids.map((term) => normalizeNegativeAddTerm(term as MJ));
  return ["Add", ...terms] as MJ;
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

type Rational = { num: number; den: number };

function gcdInts(values: number[]): number {
  const abs = values.map((v) => Math.abs(Math.trunc(v)));
  const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
  return abs.reduce((acc, v) => g(acc, v));
}

function lcmInt(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a * b) / gcdInts([a, b]));
}

function normalizeRational(num: number, den: number): Rational {
  if (den === 0) return { num, den };
  let n = Math.trunc(num);
  let d = Math.trunc(den);
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcdInts([n, d]);
  return { num: n / g, den: d / g };
}

function parseInteger(value: MJ): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function rationalFromExpr(expr: MJ): Rational | null {
  const int = parseInteger(expr);
  if (int !== null) return { num: int, den: 1 };
  if (!Array.isArray(expr)) return null;
  if (expr[0] === "Negate" && expr.length >= 2) {
    const inner = rationalFromExpr(expr[1] as MJ);
    return inner ? { num: -inner.num, den: inner.den } : null;
  }
  if (expr[0] === "Divide" && expr.length >= 3) {
    const num = parseInteger(expr[1] as MJ);
    const den = parseInteger(expr[2] as MJ);
    if (num === null || den === null || den === 0) return null;
    return normalizeRational(num, den);
  }
  return null;
}

function multiplyRational(a: Rational, b: Rational): Rational {
  return normalizeRational(a.num * b.num, a.den * b.den);
}

function divideRational(a: Rational, b: Rational): Rational {
  return normalizeRational(a.num * b.den, a.den * b.num);
}

function isRationalOne(r: Rational): boolean {
  return r.num === r.den;
}

function isRationalNegativeOne(r: Rational): boolean {
  return r.num === -r.den;
}

function rationalToMJ(r: Rational): MJ {
  const normalized = normalizeRational(r.num, r.den);
  if (normalized.den === 1) return normalized.num;
  if (normalized.num < 0) {
    return ["Negate", ["Divide", Math.abs(normalized.num), normalized.den] as MJ] as MJ;
  }
  return ["Divide", normalized.num, normalized.den] as MJ;
}

function commonFactorFromAdd(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length < 3) return null;
  const terms = expr.slice(1) as MJ[];
  if (terms.length < 2) return null;

  // Collect factors per term
  type TermInfo = { numeric: Rational; rest: MJ[] };
  const termInfos: TermInfo[] = [];

  for (const term of terms) {
    const { sign, core } = unwrapNegate(term);
    const factors = factorsForCommonFactor(core);
    let numeric: Rational = { num: sign, den: 1 };
    const rest: MJ[] = [];
    for (const f of factors) {
      const rat = rationalFromExpr(f);
      if (rat !== null) {
        numeric = multiplyRational(numeric, rat);
      } else {
        rest.push(f);
      }
    }
    termInfos.push({ numeric, rest });
  }

  // Numeric common factor (exact rational): gcd(nums) / lcm(dens)
  let numericCommon: Rational = { num: 1, den: 1 };
  const numerators = termInfos.map((t) => t.numeric.num);
  const denominators = termInfos.map((t) => t.numeric.den);
  const gcdNum = gcdInts(numerators);
  const lcmDen = denominators.reduce((acc, d) => lcmInt(acc, d), 1);
  if (gcdNum !== 0 && lcmDen !== 0) {
    numericCommon = normalizeRational(gcdNum, lcmDen);
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
  const hasNumeric = !isRationalOne(numericCommon);
  if (!hasSymbolic && !hasNumeric) return null;

  // Build factored terms
  const factoredTerms: MJ[] = [];
  const allTerms = [first, ...restInfos];
  for (const info of allTerms) {
    const factors: MJ[] = [];
    const residualNumeric = divideRational(info.numeric, numericCommon);
    const remainingRest = info.rest;

    if (isRationalNegativeOne(residualNumeric) && remainingRest.length > 0) {
      const termExpr = ["Negate", buildProductFromFactors(remainingRest)] as MJ;
      factoredTerms.push(termExpr);
      continue;
    }

    if (!isRationalOne(residualNumeric) || remainingRest.length === 0) {
      factors.push(rationalToMJ(residualNumeric));
    }

    factors.push(...remainingRest);

    const termExpr = buildProductFromFactors(factors);
    factoredTerms.push(termExpr);
  }

  const commonProductFactors: MJ[] = [];
  if (hasNumeric) commonProductFactors.push(rationalToMJ(numericCommon));
  commonProductFactors.push(...commonFactors);
  let commonProduct = buildProductFromFactors(commonProductFactors);
  const numericIsUnitFraction = numericCommon.num === 1 && numericCommon.den > 1;
  if (numericIsUnitFraction && commonFactors.length > 0) {
    commonProduct = ["Divide", buildProductFromFactors(commonFactors), numericCommon.den] as MJ;
  }
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

function isSquarePower(expr: MJ): { base: MJ } | null {
  if (!Array.isArray(expr) || expr[0] !== "Power" || expr.length < 3) return null;
  const exponent = expr[2] as MJ;
  if (exponent !== 2 && exponent !== "2") return null;
  return { base: expr[1] as MJ };
}

function differenceOfSquaresFromAdd(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length !== 3) return null;
  const leftRaw = expr[1] as MJ;
  const rightRaw = expr[2] as MJ;

  const left = unwrapNegate(leftRaw);
  const right = unwrapNegate(rightRaw);

  let positiveSquare: MJ | null = null;
  let negativeSquare: MJ | null = null;

  if (left.sign === 1) positiveSquare = left.core;
  if (left.sign === -1) negativeSquare = left.core;
  if (right.sign === 1) positiveSquare = right.core;
  if (right.sign === -1) negativeSquare = right.core;

  if (!positiveSquare || !negativeSquare) return null;

  const posSquare = isSquarePower(positiveSquare);
  const negSquare = isSquarePower(negativeSquare);
  if (!posSquare || !negSquare) return null;

  const a = posSquare.base;
  const b = negSquare.base;

  const diff = ["Delimiter", ["Add", a, ["Negate", b] as MJNode] as MJ] as MJ;
  const sum = ["Delimiter", ["Add", a, b] as MJ] as MJ;
  const factored = ["InvisibleOperator", diff, sum] as MJ;
  if (deepEqualMJ(factored, expr)) return null;
  return factored;
}

function perfectSquareTrinomialFromAdd(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Add" || expr.length !== 4) return null;
  const terms = expr.slice(1) as MJ[];
  type Parsed = { index: number; numeric: number; factors: MJ[] };
  const parsed: Parsed[] = [];

  for (let i = 0; i < terms.length; i += 1) {
    const { sign, core } = unwrapNegate(terms[i] as MJ);
    const factors = factorsOf(core).map(unwrapDelimiter);
    let numeric = sign;
    const symbolic: MJ[] = [];
    for (const factor of factors) {
      const n = parseInteger(factor);
      if (n !== null) numeric *= n;
      else symbolic.push(factor);
    }
    parsed.push({ index: i, numeric, factors: symbolic });
  }

  const isSquareFactor = (factor: MJ): MJ | null => {
    if (!Array.isArray(factor) || factor[0] !== "Power" || factor.length < 3) return null;
    const exponent = factor[2] as MJ;
    if (exponent !== 2 && exponent !== "2") return null;
    return factor[1] as MJ;
  };

  const squareTerms = parsed.filter((p) => {
    if (Math.abs(p.numeric) !== 1) return false;
    if (p.factors.length !== 1) return false;
    return isSquareFactor(p.factors[0] as MJ) !== null;
  });
  if (squareTerms.length !== 2) return null;

  const crossTerm = parsed.find((p) => !squareTerms.includes(p));
  if (!crossTerm) return null;
  if (crossTerm.factors.length !== 2 || Math.abs(crossTerm.numeric) !== 2) return null;

  const baseA = isSquareFactor(squareTerms[0].factors[0] as MJ);
  const baseB = isSquareFactor(squareTerms[1].factors[0] as MJ);
  if (!baseA || !baseB) return null;

  const crossHasA = crossTerm.factors.some((f) => deepEqualMJ(f as MJ, baseA));
  const crossHasB = crossTerm.factors.some((f) => deepEqualMJ(f as MJ, baseB));
  if (!crossHasA || !crossHasB) return null;

  const squareSign = Math.sign(squareTerms[0].numeric);
  if (squareSign === 0 || Math.sign(squareTerms[1].numeric) !== squareSign) return null;
  const crossSign = Math.sign(crossTerm.numeric);
  if (crossSign === 0) return null;
  const innerSign = crossSign / squareSign;
  if (innerSign !== 1 && innerSign !== -1) return null;

  let leftBase = baseA;
  let rightBase = baseB;
  if (squareSign === -1 && innerSign === -1) {
    // Prefer -(v-b)^2 style for -x^2+2xy-y^2.
    leftBase = baseB;
    rightBase = baseA;
  }

  const inner =
    innerSign === 1
      ? (["Add", leftBase, rightBase] as MJ)
      : (["Add", leftBase, ["Negate", rightBase] as MJNode] as MJ);
  const squared = ["Power", ["Delimiter", inner] as MJ, 2] as MJ;
  const factored = squareSign === -1 ? (["Negate", squared] as MJ) : squared;
  if (deepEqualMJ(factored, expr)) return null;
  return factored;
}

function factorExpression(expr: MJ): MJ | null {
  const factorToFixedPoint = (source: MJ): MJ | null => {
    let current = source;
    for (let i = 0; i < 4; i += 1) {
      const next = box(toComputeEngine(current))?.factor?.();
      if (!next?.json) return null;
      const candidate = fromComputeEngine(next.json as MJ);
      const normalized = normalizeNegativeTermsInAdd(
        normalizeMathJson(candidate) ?? candidate,
      );
      if (deepEqualMJ(normalized, current)) return normalized;
      current = normalized;
    }
    return current;
  };

  const ceReady = toComputeEngine(expr);
  const ceBox = box(ceReady) as any;
  const candidates: MJ[] = [];

  const factored = factorToFixedPoint(expr);
  if (factored) candidates.push(factored);

  const collected = ceBox?.collect?.();
  if (collected?.json) {
    const collectedCandidate = fromComputeEngine(collected.json as MJ);
    candidates.push(
      normalizeNegativeTermsInAdd(
        normalizeMathJson(collectedCandidate) ?? collectedCandidate,
      ),
    );
  }

  // Deterministic fallback: common denominator from Add
  const denomFactored = commonDenominatorFromAdd(expr);
  if (denomFactored && !deepEqualMJ(denomFactored, expr)) {
    candidates.push(normalizeNegativeTermsInAdd(normalizeMathJson(denomFactored) ?? denomFactored));
  }

  // Deterministic fallback: difference of squares (A^2 - B^2 = (A-B)(A+B))
  const dosFactored = differenceOfSquaresFromAdd(expr);
  if (dosFactored && !deepEqualMJ(dosFactored, expr)) {
    candidates.push(normalizeNegativeTermsInAdd(normalizeMathJson(dosFactored) ?? dosFactored));
  }

  // Deterministic fallback: perfect-square trinomial
  const pstFactored = perfectSquareTrinomialFromAdd(expr);
  if (pstFactored && !deepEqualMJ(pstFactored, expr)) {
    candidates.push(normalizeNegativeTermsInAdd(normalizeMathJson(pstFactored) ?? pstFactored));
  }

  // Deterministic fallback: common factor from Add
  const fallback = commonFactorFromAdd(expr);
  if (fallback && !deepEqualMJ(fallback, expr)) {
    candidates.push(normalizeNegativeTermsInAdd(normalizeMathJson(fallback) ?? fallback));
  }

  const changed = candidates.filter((cand) => !deepEqualMJ(cand, expr));
  if (changed.length > 0) {
    let best = changed[0];
    let bestScore = Infinity;
    for (const cand of changed) {
      const score = (() => {
        try {
          return ExpressionTree.create(cand).latexPlain.length;
        } catch {
          return JSON.stringify(cand).length;
        }
      })();
      if (score < bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    return best;
  }

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
