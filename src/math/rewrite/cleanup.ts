import { add, divide, num, power, root, type Expr } from "../ast";
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

type Rational = {
  numerator: number;
  denominator: number;
  decimalPlaces?: number;
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
    case "call":
      return cleanupCall(expr);
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
  let numericSum: Rational = { numerator: 0, denominator: 1 };
  let numericTermCount = 0;
  let firstNumericTermIndex = 0;
  let changed = false;

  for (const term of terms) {
    const numericValue = numericRationalValue(term);
    if (numericValue !== null) {
      if (numericTermCount === 0) firstNumericTermIndex = keptTerms.length;
      numericSum = addRationals(numericSum, numericValue);
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

  if (numericTermCount > 0 && numericSum.numerator !== 0) {
    keptTerms.splice(firstNumericTermIndex, 0, rationalToExpr(numericSum));
  }
  if (numericTermCount > 1 || (numericTermCount === 1 && numericSum.numerator === 0)) changed = true;

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

    if (positiveFactor.kind === "display_group" && positiveFactor.expression.kind === "multiply") {
      const groupedSign = splitSign(positiveFactor.expression);
      productSign = multiplySigns(productSign, groupedSign.sign);
      const groupedProduct = groupedSign.value as Extract<Expr, { kind: "multiply" }>;
      keptFactors.push(...groupedProduct.factors.map(cloneExpr));
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

  const collapsedFractionFactors = cancelAcrossFractionFactors(keptFactors);
  if (collapsedFractionFactors) {
    keptFactors.splice(0, keptFactors.length, ...multiplicativeFactors(collapsedFractionFactors));
    changed = true;
  }

  const combinedPowerFactors = combinePowerFactors(keptFactors);
  if (combinedPowerFactors) {
    keptFactors.splice(0, keptFactors.length, ...combinedPowerFactors);
    changed = true;
  }

  if (!changed) return null;
  return withSign(collapseProduct(numericFactorsFirst(keptFactors)), productSign);
}

function cleanupDivide(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const sign = exprSign(expr);
  if (isNumberValue(expr.numerator, 0)) return num(0);
  const normalizedSigns = normalizeFractionOperandSigns(expr);
  if (normalizedSigns) return normalizedSigns;
  if (isNumberValue(expr.denominator, 1)) return withSign(cloneExpr(expr.numerator), sign);
  if (cleanupKey(expr.numerator) === cleanupKey(expr.denominator)) return withSign(num(1), sign);

  const numeratorValue = numericLiteralValue(expr.numerator);
  const denominatorValue = numericLiteralValue(expr.denominator);
  if (numeratorValue !== null && denominatorValue !== null && denominatorValue !== 0) {
    const quotient = numeratorValue / denominatorValue;
    return Number.isInteger(quotient) ? withSign(num(quotient), sign) : null;
  }

  const unnestedFraction = unnestFraction(expr);
  if (unnestedFraction) return applySign(sign, unnestedFraction);

  const collapsedNestedFraction = collapseNestedFractionFactors(expr);
  if (collapsedNestedFraction) return applySign(sign, collapsedNestedFraction);

  const canceledAddNumeratorFactors = cancelCommonFactorsAcrossAddNumerator(expr.numerator, expr.denominator);
  if (canceledAddNumeratorFactors) return applySign(sign, canceledAddNumeratorFactors);

  const numeratorFactors = multiplicativeFactors(expr.numerator);
  const denominatorFactors = multiplicativeFactors(expr.denominator);
  const remainingNumerator = numeratorFactors.map(cloneExpr);
  const remainingDenominator = denominatorFactors.map(cloneExpr);
  let changed = false;

  changed = cancelCommonFactors(remainingNumerator, remainingDenominator) || changed;

  if (!changed) return null;
  const nextNumerator = collapseProduct(remainingNumerator);
  const nextDenominator = collapseProduct(remainingDenominator);
  if (isNumberValue(nextDenominator, 1)) return withSign(nextNumerator, sign);
  return withSign(divide(nextNumerator, nextDenominator), sign);
}

function cancelCommonFactorsAcrossAddNumerator(numerator: Expr, denominator: Expr): Expr | null {
  const addNumerator =
    numerator.kind === "add"
      ? numerator
      : numerator.kind === "display_group" && numerator.expression.kind === "add"
        ? numerator.expression
        : null;
  if (!addNumerator || addNumerator.terms.length < 2) return null;

  const terms = addNumerator.terms.map((term) => {
    const signed = splitSign(term);
    return {
      sign: signed.sign,
      factors: multiplicativeFactors(signed.value),
    };
  });
  const denominatorFactors = multiplicativeFactors(denominator);
  let denominatorIndex = 0;
  let changed = false;

  while (denominatorIndex < denominatorFactors.length) {
    const denominatorFactor = denominatorFactors[denominatorIndex];
    if (!denominatorFactor) break;

    const matches = terms.map((term) => findCancellableFactor(term.factors, denominatorFactor));
    if (matches.some((match) => match === null)) {
      denominatorIndex += 1;
      continue;
    }

    matches.forEach((match, termIndex) => {
      const term = terms[termIndex];
      if (!match || !term) return;
      decrementFactorAt(term.factors, match.index, match.base);
    });
    decrementFactorAt(denominatorFactors, denominatorIndex, matches[0]!.base);
    changed = true;
  }

  if (!changed) return null;

  const nextNumerator = add(
    terms.map((term) => applySign(term.sign, cleanupProductFactors(term.factors))),
  );
  const nextDenominator = cleanupProductFactors(denominatorFactors);
  return isNumberValue(nextDenominator, 1) ? nextNumerator : divide(nextNumerator, nextDenominator);
}

function normalizeFractionOperandSigns(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const fractionSign = exprSign(expr);
  const numerator = splitSign(expr.numerator);
  const denominator = splitSign(expr.denominator);
  if (numerator.sign === 1 && denominator.sign === 1) return null;

  return withSign(
    divide(numerator.value, denominator.value),
    multiplySigns(fractionSign, numerator.sign, denominator.sign),
  );
}

function cancelAcrossFractionFactors(factors: Expr[]): Expr | null {
  const fractionFactors = factors.filter((factor) => factor.kind === "divide");
  if (fractionFactors.length < 1) return null;

  const numeratorFactors: Expr[] = [];
  const denominatorFactors: Expr[] = [];
  for (const factor of factors) {
    if (factor.kind === "divide") {
      numeratorFactors.push(...multiplicativeFactors(factor.numerator));
      denominatorFactors.push(...multiplicativeFactors(factor.denominator));
    } else {
      numeratorFactors.push(cloneExpr(factor));
    }
  }

  const changed = cancelCommonFactors(numeratorFactors, denominatorFactors);

  if (!changed) return null;
  const numerator = cleanupProductFactors(numeratorFactors);
  const denominator = cleanupProductFactors(denominatorFactors);
  return isNumberValue(denominator, 1) ? numerator : divide(numerator, denominator);
}

function combinePowerFactors(factors: Expr[]): Expr[] | null {
  const entries = factors.map(powerFactorParts);
  const grouped = new Map<string, { base: Expr; exponentSum: number; firstIndex: number; count: number }>();

  entries.forEach((entry, index) => {
    if (!entry) return;
    const existing = grouped.get(entry.key);
    if (existing) {
      existing.exponentSum += entry.exponent;
      existing.count += 1;
      return;
    }
    grouped.set(entry.key, {
      base: entry.base,
      exponentSum: entry.exponent,
      firstIndex: index,
      count: 1,
    });
  });

  if (![...grouped.values()].some((group) => group.count > 1)) return null;

  const replacementByIndex = new Map<number, Expr>();
  for (const group of grouped.values()) {
    if (group.count <= 1) continue;
    replacementByIndex.set(group.firstIndex, powerExpr(group.base, group.exponentSum));
  }

  const seenKeys = new Set<string>();
  const result: Expr[] = [];
  factors.forEach((factor, index) => {
    const entry = entries[index];
    if (!entry) {
      result.push(cloneExpr(factor));
      return;
    }
    if (seenKeys.has(entry.key)) return;
    seenKeys.add(entry.key);
    result.push(replacementByIndex.get(index) ?? cloneExpr(factor));
  });
  return result;
}

function powerFactorParts(factor: Expr): { key: string; base: Expr; exponent: number } | null {
  if (factor.kind === "power" && isPositiveIntegerPower(factor)) {
    return {
      key: cleanupKey(factor.base),
      base: cloneExpr(factor.base),
      exponent: Number(factor.exponent.value),
    };
  }
  if (factor.kind === "number") return null;
  return {
    key: cleanupKey(factor),
    base: cloneExpr(factor),
    exponent: 1,
  };
}

function powerExpr(base: Expr, exponent: number): Expr {
  return exponent === 1 ? cloneExpr(base) : power(cloneExpr(base), num(exponent));
}

function cancelCommonFactors(numeratorFactors: Expr[], denominatorFactors: Expr[]): boolean {
  let changed = false;
  for (let numeratorIndex = 0; numeratorIndex < numeratorFactors.length; numeratorIndex += 1) {
    const numeratorFactor = numeratorFactors[numeratorIndex];
    const denominatorMatch = findCancellableFactor(denominatorFactors, numeratorFactor);
    if (!denominatorMatch) continue;

    decrementFactorAt(numeratorFactors, numeratorIndex, denominatorMatch.base);
    decrementFactorAt(denominatorFactors, denominatorMatch.index, denominatorMatch.base);
    numeratorIndex -= 1;
    changed = true;
  }
  return changed;
}

function findCancellableFactor(factors: Expr[], factor: Expr): { index: number; base: Expr } | null {
  for (let index = 0; index < factors.length; index += 1) {
    const candidate = factors[index];
    if (!candidate) continue;
    const base = cancellableBase(candidate, factor);
    if (base) return { index, base };
  }
  return null;
}

function cancellableBase(left: Expr, right: Expr): Expr | null {
  if (cleanupKey(left) === cleanupKey(right)) return cloneExpr(right);

  if (left.kind === "power" && isPositiveIntegerPower(left)) {
    if (cleanupKey(left.base) === cleanupKey(right)) return cloneExpr(right);
    if (right.kind === "power" && isPositiveIntegerPower(right) && cleanupKey(left.base) === cleanupKey(right.base)) {
      return cloneExpr(left.base);
    }
  }

  if (right.kind === "power" && isPositiveIntegerPower(right) && cleanupKey(right.base) === cleanupKey(left)) {
    return cloneExpr(left);
  }

  return null;
}

function decrementFactorAt(factors: Expr[], index: number, canceledFactor: Expr): void {
  const factor = factors[index];
  if (!factor || cleanupKey(factor) === cleanupKey(canceledFactor)) {
    factors.splice(index, 1);
    return;
  }
  if (factor.kind !== "power" || !isPositiveIntegerPower(factor)) return;
  const exponent = Number(factor.exponent.value);
  if (exponent === 2) {
    factors[index] = cloneExpr(factor.base);
    return;
  }
  factors[index] = {
    ...factor,
    exponent: num(exponent - 1),
  };
}

function isPositiveIntegerPower(expr: Extract<Expr, { kind: "power" }>): expr is Extract<Expr, { kind: "power" }> & {
  exponent: Extract<Expr, { kind: "number" }>;
} {
  return (
    expr.exponent.kind === "number" &&
    Number.isInteger(Number(expr.exponent.value)) &&
    Number(expr.exponent.value) > 1
  );
}

function collapseNestedFractionFactors(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const numeratorFactors = multiplicativeFactors(expr.numerator);
  const denominatorFactors = multiplicativeFactors(expr.denominator);
  if (![...numeratorFactors, ...denominatorFactors].some((factor) => factor.kind === "divide")) return null;

  const nextNumeratorFactors: Expr[] = [];
  const nextDenominatorFactors: Expr[] = [];
  const sign = multiplySigns(
    collectFlatFractionFactors(numeratorFactors, nextNumeratorFactors, nextDenominatorFactors),
    collectFlatFractionFactors(denominatorFactors, nextDenominatorFactors, nextNumeratorFactors),
  );

  return withSign(
    divide(
      cleanupProductFactors(numericFactorsFirst(nextNumeratorFactors)),
      cleanupProductFactors(numericFactorsFirst(nextDenominatorFactors)),
    ),
    sign,
  );
}

function numericFactorsFirst(factors: Expr[]): Expr[] {
  return [
    ...factors.filter((factor) => factor.kind === "number").map(cloneExpr),
    ...factors.filter((factor) => factor.kind !== "number").map(cloneExpr),
  ];
}

function collectFlatFractionFactors(factors: Expr[], numeratorFactors: Expr[], denominatorFactors: Expr[]): Sign {
  let sign: Sign = 1;
  for (const factor of factors) {
    const signed = splitSign(factor);
    sign = multiplySigns(sign, signed.sign);
    if (signed.value.kind === "divide") {
      numeratorFactors.push(...multiplicativeFactors(signed.value.numerator));
      denominatorFactors.push(...multiplicativeFactors(signed.value.denominator));
      continue;
    }
    numeratorFactors.push(cloneExpr(signed.value));
  }
  return sign;
}

function unnestFraction(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  const numerator = cloneExpr(expr.numerator);
  const denominator = cloneExpr(expr.denominator);

  if (numerator.kind === "divide" && denominator.kind === "divide") {
    const signedNumerator = splitSign(numerator);
    const signedDenominator = splitSign(denominator);
    const numeratorValue = signedNumerator.value as Extract<Expr, { kind: "divide" }>;
    const denominatorValue = signedDenominator.value as Extract<Expr, { kind: "divide" }>;
    return withSign(
      divide(
        collapseProduct([numeratorValue.numerator, denominatorValue.denominator]),
        collapseProduct([numeratorValue.denominator, denominatorValue.numerator]),
      ),
      multiplySigns(signedNumerator.sign, signedDenominator.sign),
    );
  }

  if (numerator.kind === "divide") {
    const signedNumerator = splitSign(numerator);
    const numeratorValue = signedNumerator.value as Extract<Expr, { kind: "divide" }>;
    return withSign(
      divide(numeratorValue.numerator, collapseProduct([numeratorValue.denominator, denominator])),
      signedNumerator.sign,
    );
  }

  if (denominator.kind === "divide") {
    const signedDenominator = splitSign(denominator);
    const denominatorValue = signedDenominator.value as Extract<Expr, { kind: "divide" }>;
    return withSign(
      divide(
        cleanupProductFactors([numerator, denominatorValue.denominator]),
        denominatorValue.numerator,
      ),
      signedDenominator.sign,
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
  const exponentRational = numericRationalValue(expr.exponent);
  if (!exponentRational) return null;
  const exponent = exponentRational.numerator / exponentRational.denominator;

  if (Number.isInteger(exponent)) {
    const signedBase = splitSign(unwrapDisplayGroups(expr.base));
    if (signedBase.value.kind === "root" && signedBase.value.degree === exponent) {
      const basePowerSign = signedBase.sign === -1 && exponent % 2 !== 0 ? -1 : 1;
      return withSign(
        cloneExpr(signedBase.value.value),
        multiplySigns(exprSign(expr), basePowerSign),
      );
    }
  }

  if (exponentRational.numerator === 1 && exponentRational.denominator > 1) {
    return withSign(root(cloneExpr(expr.base), exponentRational.denominator), exprSign(expr));
  }

  if (!Number.isInteger(exponent)) return null;
  const base = numericLiteralValue(expr.base);
  if (base === null) return null;

  const value = base ** exponent;
  return Number.isFinite(value) ? num(value) : null;
}

function cleanupCall(expr: Extract<Expr, { kind: "call" }>): Expr | null {
  const signed = splitSign(expr);
  if (signed.value.kind !== "call") return null;
  if (signed.value.callee.kind !== "symbol" || signed.value.callee.name !== "exp") return null;
  if (signed.value.args.length !== 1) return null;

  const [arg] = signed.value.args;
  if (!arg) return null;
  const unwrappedArg = unwrapDisplayGroups(arg);
  if (unwrappedArg.kind !== "call") return null;
  if (unwrappedArg.callee.kind !== "symbol" || unwrappedArg.callee.name !== "ln") return null;
  if (unwrappedArg.args.length !== 1) return null;

  const [innerArg] = unwrappedArg.args;
  return innerArg ? withSign(cloneExpr(innerArg), signed.sign) : null;
}

function unwrapDisplayGroups(expr: Expr): Expr {
  return expr.kind === "display_group" ? unwrapDisplayGroups(expr.expression) : expr;
}

function numericRationalValue(expr: Expr): Rational | null {
  const sign = exprSign(expr);
  const positive = withoutSign(expr);
  if (positive.kind === "display_group") {
    const value = numericRationalValue(positive.expression);
    return value ? normalizeRational({ numerator: sign * value.numerator, denominator: value.denominator }) : null;
  }
  if (positive.kind === "negate") {
    const value = numericRationalValue(positive.value);
    return value ? normalizeRational({ numerator: sign * -value.numerator, denominator: value.denominator }) : null;
  }
  if (positive.kind === "number" && typeof positive.value === "number" && Number.isFinite(positive.value)) {
    return numericLiteralRational(sign * positive.value);
  }
  if (positive.kind === "divide") {
    const numerator = numericLiteralValue(positive.numerator);
    const denominator = numericLiteralValue(positive.denominator);
    if (numerator === null || denominator === null || denominator === 0) return null;
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) return null;
    return normalizeRational({ numerator: sign * numerator, denominator });
  }
  return null;
}

function addRationals(left: Rational, right: Rational): Rational {
  return normalizeRational({
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
    decimalPlaces: maxDefined(left.decimalPlaces, right.decimalPlaces),
  });
}

function normalizeRational(value: Rational): Rational {
  if (value.numerator === 0) return { numerator: 0, denominator: 1 };
  const denominatorSign = value.denominator < 0 ? -1 : 1;
  const numerator = value.numerator * denominatorSign;
  const denominator = Math.abs(value.denominator);
  const divisor = greatestCommonDivisor(Math.abs(numerator), denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
    ...(value.decimalPlaces != null ? { decimalPlaces: value.decimalPlaces } : {}),
  };
}

function rationalToExpr(value: Rational): Expr {
  const normalized = normalizeRational(value);
  const decimal = rationalToDecimalNumber(normalized);
  if (decimal != null) return num(decimal);
  if (normalized.denominator === 1) return num(normalized.numerator);
  const sign = normalized.numerator < 0 ? -1 : 1;
  return withSign(divide(num(Math.abs(normalized.numerator)), num(normalized.denominator)), sign);
}

function numericLiteralRational(value: number): Rational | null {
  if (Number.isInteger(value)) return { numerator: value, denominator: 1 };
  const text = value.toString();
  if (/[eE]/.test(text)) return null;
  const decimalPlaces = text.split(".")[1]?.length ?? 0;
  if (decimalPlaces === 0) return { numerator: value, denominator: 1 };
  const denominator = 10 ** decimalPlaces;
  return normalizeRational({
    numerator: Math.round(value * denominator),
    denominator,
    decimalPlaces,
  });
}

function rationalToDecimalNumber(value: Rational): number | null {
  if (value.decimalPlaces == null) return null;
  const scale = 10 ** value.decimalPlaces;
  if (scale % value.denominator !== 0) return null;
  const scaledNumerator = value.numerator * (scale / value.denominator);
  return Number((scaledNumerator / scale).toFixed(value.decimalPlaces));
}

function maxDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
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
