import { add, divide, num, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import {
  applySign,
  collapseProduct,
  exprSign,
  flipSign,
  isNumberValue,
  multiplySigns,
  splitSign,
  structuralKeyIgnoringDisplayGroups,
  type Sign,
  withSign,
  withoutSign,
} from "./algebraUtils";

const DEFAULT_MAX_CLEANUP_DEPTH = 100;
const DEFAULT_MAX_LOCAL_CLEANUP_ITERATIONS = 50;

export class CleanupRecursionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanupRecursionError";
  }
}

type CleanupContext = {
  maxDepth: number;
  maxLocalIterations: number;
};

export function canCleanupExpr(expr: Expr): boolean {
  return cleanupExpr(expr) !== null;
}

export function cleanupExpr(expr: Expr): Expr | null {
  const context = createCleanupContext();
  return cleanupBottomUp(expr, context, 0);
}

function createCleanupContext(): CleanupContext {
  return {
    maxDepth: DEFAULT_MAX_CLEANUP_DEPTH,
    maxLocalIterations: DEFAULT_MAX_LOCAL_CLEANUP_ITERATIONS,
  };
}

function cleanupBottomUp(expr: Expr, context: CleanupContext, depth: number): Expr | null {
  if (depth > context.maxDepth) {
    throw new CleanupRecursionError(`Cleanup exceeded maximum recursive depth of ${context.maxDepth}.`);
  }

  const withCleanChildren = cleanupChildren(expr, context, depth);
  const candidate = withCleanChildren ?? cloneExpr(expr);
  const local = cleanupLocallyUntilStable(candidate, context);
  return local ?? withCleanChildren;
}

function cleanupLocallyUntilStable(expr: Expr, context: CleanupContext): Expr | null {
  let current = cloneExpr(expr);
  let changed = false;
  let iterations = 0;

  while (true) {
    iterations += 1;
    if (iterations > context.maxLocalIterations) {
      throw new CleanupRecursionError(
        `Cleanup exceeded maximum local rewrite iterations of ${context.maxLocalIterations}.`,
      );
    }

    const next = cleanupLocalExpr(current);
    if (!next) break;
    current = next;
    changed = true;
  }

  return changed ? current : null;
}

function cleanupLocalExpr(expr: Expr): Expr | null {
  if (expr.sign === -1 && expr.kind === "number" && typeof expr.value === "number") {
    return num(-expr.value);
  }
  switch (expr.kind) {
    case "add":
      return cleanupAdd(expr);
    case "multiply":
      return cleanupMultiply(expr);
    case "divide":
      return cleanupDivide(expr);
    case "negate":
      return cleanupNegate(expr);
    case "power":
      return cleanupPower(expr);
    default:
      return null;
  }
}

function cleanupChildren(expr: Expr, context: CleanupContext, depth: number): Expr | null {
  const next = cloneExpr(expr);
  let changed = false;

  switch (next.kind) {
    case "add":
      next.terms = next.terms.map((term) => {
        const cleaned = cleanupBottomUp(term, context, depth + 1);
        if (cleaned) changed = true;
        return cleaned ?? term;
      });
      break;
    case "multiply":
      next.factors = next.factors.map((factor) => {
        const cleaned = cleanupBottomUp(factor, context, depth + 1);
        if (cleaned) changed = true;
        return cleaned ?? factor;
      });
      break;
    case "divide": {
      const numerator = cleanupBottomUp(next.numerator, context, depth + 1);
      const denominator = cleanupBottomUp(next.denominator, context, depth + 1);
      if (numerator) {
        next.numerator = numerator;
        changed = true;
      }
      if (denominator) {
        next.denominator = denominator;
        changed = true;
      }
      break;
    }
    case "negate": {
      const value = cleanupBottomUp(next.value, context, depth + 1);
      if (value) {
        next.value = value;
        changed = true;
      }
      break;
    }
    case "power": {
      const base = cleanupBottomUp(next.base, context, depth + 1);
      const exponent = cleanupBottomUp(next.exponent, context, depth + 1);
      if (base) {
        next.base = base;
        changed = true;
      }
      if (exponent) {
        next.exponent = exponent;
        changed = true;
      }
      break;
    }
    case "display_group": {
      const expression = cleanupBottomUp(next.expression, context, depth + 1);
      if (expression) {
        next.expression = expression;
        changed = true;
      }
      break;
    }
    case "call": {
      const callee = cleanupBottomUp(next.callee, context, depth + 1);
      if (callee) {
        next.callee = callee;
        changed = true;
      }
      next.args = next.args.map((arg) => {
        const cleaned = cleanupBottomUp(arg, context, depth + 1);
        if (cleaned) changed = true;
        return cleaned ?? arg;
      });
      break;
    }
    default:
      return null;
  }

  return changed ? next : null;
}

function cleanupAdd(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  const terms = expr.terms.map(cloneExpr);
  const keptTerms: Expr[] = [];
  let numericSum = 0;
  let numericTermCount = 0;
  let firstNumericTermIndex = 0;
  let changed = false;

  for (const term of terms) {
    const numericValue = numericLiteralValue(term);
    if (numericValue !== null) {
      if (numericTermCount === 0) firstNumericTermIndex = keptTerms.length;
      numericSum += numericValue;
      numericTermCount += 1;
      continue;
    }

    if (isNumberValue(term, 0)) {
      changed = true;
      continue;
    }

    const inverseIndex = keptTerms.findIndex((keptTerm) => areAdditiveInverses(keptTerm, term));
    if (inverseIndex >= 0) {
      keptTerms.splice(inverseIndex, 1);
      changed = true;
      continue;
    }

    keptTerms.push(term);
  }

  if (numericTermCount > 0 && numericSum !== 0) {
    keptTerms.splice(firstNumericTermIndex, 0, num(numericSum));
  }
  if (numericTermCount > 1 || (numericTermCount === 1 && numericSum === 0)) changed = true;

  const likeTerms = collectLikeTerms(keptTerms);
  if (likeTerms) {
    keptTerms.splice(0, keptTerms.length, ...likeTerms);
    changed = true;
  }

  if (!changed) return null;
  if (keptTerms.length === 0) return num(0);
  if (keptTerms.length === 1) return keptTerms[0];
  return add(keptTerms);
}

type CoefficientTerm = {
  coefficient: number;
  base: Expr;
  key: string;
};

function collectLikeTerms(terms: Expr[]): Expr[] | null {
  const grouped = new Map<string, { coefficient: number; base: Expr; firstIndex: number; count: number }>();

  terms.forEach((term, index) => {
    const split = splitCoefficientTerm(term);
    if (!split) return;

    const existing = grouped.get(split.key);
    if (existing) {
      existing.coefficient += split.coefficient;
      existing.count += 1;
      return;
    }
    grouped.set(split.key, {
      coefficient: split.coefficient,
      base: split.base,
      firstIndex: index,
      count: 1,
    });
  });

  const replacementByIndex = new Map<number, Expr | null>();
  const collectedKeys = new Set<string>();
  let changed = false;
  for (const group of grouped.values()) {
    if (group.count < 2) continue;
    collectedKeys.add(cleanupKey(group.base));
    replacementByIndex.set(
      group.firstIndex,
      group.coefficient === 0 ? null : buildCoefficientTerm(group.coefficient, group.base),
    );
    changed = true;
  }

  if (!changed) return null;

  const result: Expr[] = [];
  const seenKeys = new Set<string>();
  for (let index = 0; index < terms.length; index += 1) {
    const term = terms[index];
    const split = splitCoefficientTerm(term);
    if (split && collectedKeys.has(split.key)) {
      if (seenKeys.has(split.key)) continue;
      seenKeys.add(split.key);
      if (replacementByIndex.has(index)) {
        const replacement = replacementByIndex.get(index);
        if (replacement) result.push(replacement);
        continue;
      }
    }
    result.push(term);
  }

  return result;
}

function splitCoefficientTerm(term: Expr): CoefficientTerm | null {
  const sign = splitSign(term);
  const value = sign.value;

  if (value.kind === "number") return null;

  if (value.kind !== "multiply") {
    return {
      coefficient: sign.sign,
      base: cloneExpr(value),
      key: cleanupKey(value),
    };
  }

  const factors = value.factors.map(cloneExpr);
  const firstFactor = factors[0];
  const coefficient =
    firstFactor?.kind === "number" && typeof firstFactor.value === "number" && Number.isFinite(firstFactor.value)
      ? firstFactor.value
      : 1;
  const baseFactors = coefficient === 1 ? factors : factors.slice(1);
  if (baseFactors.length === 0) return null;
  const base = collapseProduct(baseFactors);
  if (base.kind === "number") return null;

  return {
    coefficient: sign.sign * coefficient,
    base,
    key: cleanupKey(base),
  };
}

function buildCoefficientTerm(coefficient: number, base: Expr): Expr {
  if (coefficient === 1) return cloneExpr(base);
  if (coefficient === -1) return flipSign(base);
  return collapseProduct([num(coefficient), base]);
}

function cleanupMultiply(expr: Extract<Expr, { kind: "multiply" }>): Expr | null {
  const factors = expr.factors.map(cloneExpr);
  if (factors.some((factor) => isNumberValue(factor, 0))) return num(0);

  const keptFactors: Expr[] = [];
  let productSign: Sign = exprSign(expr);
  let numericProduct = 1;
  let numericFactorCount = 0;
  let firstNumericFactorIndex = 0;
  let changed = false;

  for (const factor of factors) {
    const signedFactor = splitSign(factor);
    productSign = multiplySigns(productSign, signedFactor.sign);
    const positiveFactor = signedFactor.value;
    if (signedFactor.sign === -1) changed = true;

    const numericValue = numericLiteralValue(positiveFactor);
    if (numericValue !== null) {
      if (numericFactorCount === 0) firstNumericFactorIndex = keptFactors.length;
      numericProduct *= numericValue;
      numericFactorCount += 1;
      continue;
    }

    if (isNumberValue(positiveFactor, 1)) {
      changed = true;
      continue;
    }

    const reciprocalIndex = keptFactors.findIndex((keptFactor) => areMultiplicativeReciprocals(keptFactor, positiveFactor));
    if (reciprocalIndex >= 0) {
      keptFactors.splice(reciprocalIndex, 1);
      changed = true;
      continue;
    }

    keptFactors.push(positiveFactor);
  }

  if (numericProduct < 0) {
    productSign = multiplySigns(productSign, -1);
    numericProduct = Math.abs(numericProduct);
    changed = true;
  }

  if (numericFactorCount > 0 && numericProduct !== 1) {
    keptFactors.splice(firstNumericFactorIndex, 0, num(numericProduct));
  }
  if (numericFactorCount > 1 || (numericFactorCount === 1 && numericProduct === 1)) changed = true;
  if (productSign !== exprSign(expr)) changed = true;

  if (!changed) return null;
  return withSign(collapseProduct(keptFactors), productSign);
}

function cleanupDivide(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const sign = exprSign(expr);
  if (isNumberValue(expr.numerator, 0)) return num(0);
  if (isNumberValue(expr.denominator, 1)) return withSign(cloneExpr(expr.numerator), sign);
  if (cleanupKey(expr.numerator) === cleanupKey(expr.denominator)) return withSign(num(1), sign);

  const numeratorValue = numericLiteralValue(expr.numerator);
  const denominatorValue = numericLiteralValue(expr.denominator);
  if (numeratorValue !== null && denominatorValue !== null && denominatorValue !== 0) {
    return withSign(num(numeratorValue / denominatorValue), sign);
  }

  const unnestedFraction = unnestFraction(expr);
  if (unnestedFraction) return withSign(unnestedFraction, sign);

  const numeratorFactors = multiplicativeFactors(expr.numerator);
  const denominatorFactors = multiplicativeFactors(expr.denominator);
  const remainingNumerator = numeratorFactors.map(cloneExpr);
  const remainingDenominator = denominatorFactors.map(cloneExpr);
  let changed = false;

  for (let numeratorIndex = 0; numeratorIndex < remainingNumerator.length; numeratorIndex += 1) {
    const numeratorFactor = remainingNumerator[numeratorIndex];
    const denominatorIndex = remainingDenominator.findIndex(
      (denominatorFactor) => cleanupKey(denominatorFactor) === cleanupKey(numeratorFactor),
    );
    if (denominatorIndex < 0) continue;

    remainingNumerator.splice(numeratorIndex, 1);
    remainingDenominator.splice(denominatorIndex, 1);
    numeratorIndex -= 1;
    changed = true;
  }

  if (!changed) return null;
  const nextNumerator = collapseProduct(remainingNumerator);
  const nextDenominator = collapseProduct(remainingDenominator);
  if (isNumberValue(nextDenominator, 1)) return withSign(nextNumerator, sign);
  return withSign(divide(nextNumerator, nextDenominator), sign);
}

function unnestFraction(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const numerator = cloneExpr(expr.numerator);
  const denominator = cloneExpr(expr.denominator);

  if (numerator.kind === "divide" && denominator.kind === "divide") {
    return divide(
      collapseProduct([numerator.numerator, denominator.denominator]),
      collapseProduct([numerator.denominator, denominator.numerator]),
    );
  }

  if (numerator.kind === "divide") {
    return divide(numerator.numerator, collapseProduct([numerator.denominator, denominator]));
  }

  if (denominator.kind === "divide") {
    return divide(
      cleanupProductFactors([numerator, denominator.denominator]),
      denominator.numerator,
    );
  }

  return null;
}

function cleanupProductFactors(factors: Expr[]): Expr {
  const product = collapseProduct(factors);
  return product.kind === "multiply" ? cleanupMultiply(product) ?? product : product;
}

function cleanupNegate(expr: Extract<Expr, { kind: "negate" }>): Expr | null {
  if (isNumberValue(expr.value, 0)) return num(0);
  const numericValue = numericLiteralValue(expr.value);
  if (numericValue !== null) return num(-numericValue);
  return flipSign(expr.value);
}

function cleanupPower(expr: Extract<Expr, { kind: "power" }>): Expr | null {
  const base = numericLiteralValue(expr.base);
  const exponent = numericLiteralValue(expr.exponent);
  if (base === null || exponent === null) return null;
  if (!Number.isInteger(exponent)) return null;

  const value = base ** exponent;
  return Number.isFinite(value) ? num(value) : null;
}

function numericLiteralValue(expr: Expr): number | null {
  const sign = exprSign(expr);
  const positive = withoutSign(expr);
  if (positive.kind === "display_group") {
    const value = numericLiteralValue(positive.expression);
    return value === null ? null : sign * value;
  }
  if (positive.kind === "negate") {
    const value = numericLiteralValue(positive.value);
    return value === null ? null : sign * -value;
  }
  if (positive.kind !== "number") return null;
  if (typeof positive.value !== "number") return null;
  return Number.isFinite(positive.value) ? sign * positive.value : null;
}

function areAdditiveInverses(left: Expr, right: Expr): boolean {
  const leftPositive = splitSign(left);
  const rightPositive = splitSign(right);
  if (leftPositive.sign === rightPositive.sign) return false;
  return cleanupKey(leftPositive.value) === cleanupKey(rightPositive.value);
}

function areMultiplicativeReciprocals(left: Expr, right: Expr): boolean {
  return (
    (left.kind === "divide" &&
      isNumberValue(left.numerator, 1) &&
      cleanupKey(left.denominator) === cleanupKey(right)) ||
    (right.kind === "divide" &&
      isNumberValue(right.numerator, 1) &&
      cleanupKey(right.denominator) === cleanupKey(left))
  );
}

function multiplicativeFactors(expr: Expr): Expr[] {
  const signed = splitSign(expr);
  const factors = signed.value.kind === "multiply" ? signed.value.factors.map(cloneExpr) : [cloneExpr(signed.value)];
  if (signed.sign === 1) return factors;
  if (factors.length === 0) return [num(-1)];
  return [applySign(-1, factors[0]!), ...factors.slice(1)];
}

function cleanupKey(expr: Expr): string {
  return structuralKeyIgnoringDisplayGroups(expr);
}
