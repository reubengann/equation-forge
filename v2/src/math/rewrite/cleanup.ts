import { add, divide, num, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import { collapseProduct, isNumberValue, structuralKeyIgnoringDisplayGroups } from "./algebraUtils";

export function canCleanupExpr(expr: Expr): boolean {
  return cleanupExpr(expr) !== null;
}

export function cleanupExpr(expr: Expr): Expr | null {
  return cleanupBottomUp(expr);
}

function cleanupBottomUp(expr: Expr): Expr | null {
  const withCleanChildren = cleanupChildren(expr);
  const candidate = withCleanChildren ?? cloneExpr(expr);
  const local = cleanupLocallyUntilStable(candidate);
  return local ?? withCleanChildren;
}

function cleanupLocallyUntilStable(expr: Expr): Expr | null {
  let current = cloneExpr(expr);
  let changed = false;

  while (true) {
    const next = cleanupLocalExpr(current);
    if (!next) break;
    current = next;
    changed = true;
  }

  return changed ? current : null;
}

function cleanupLocalExpr(expr: Expr): Expr | null {
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

function cleanupChildren(expr: Expr): Expr | null {
  const next = cloneExpr(expr);
  let changed = false;

  switch (next.kind) {
    case "add":
      next.terms = next.terms.map((term) => {
        const cleaned = cleanupBottomUp(term);
        if (cleaned) changed = true;
        return cleaned ?? term;
      });
      break;
    case "multiply":
      next.factors = next.factors.map((factor) => {
        const cleaned = cleanupBottomUp(factor);
        if (cleaned) changed = true;
        return cleaned ?? factor;
      });
      break;
    case "divide": {
      const numerator = cleanupBottomUp(next.numerator);
      const denominator = cleanupBottomUp(next.denominator);
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
      const value = cleanupBottomUp(next.value);
      if (value) {
        next.value = value;
        changed = true;
      }
      break;
    }
    case "power": {
      const base = cleanupBottomUp(next.base);
      const exponent = cleanupBottomUp(next.exponent);
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
      const expression = cleanupBottomUp(next.expression);
      if (expression) {
        next.expression = expression;
        changed = true;
      }
      break;
    }
    case "call": {
      const callee = cleanupBottomUp(next.callee);
      if (callee) {
        next.callee = callee;
        changed = true;
      }
      next.args = next.args.map((arg) => {
        const cleaned = cleanupBottomUp(arg);
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

  if (!changed) return null;
  if (keptTerms.length === 0) return num(0);
  if (keptTerms.length === 1) return keptTerms[0];
  return add(keptTerms);
}

function cleanupMultiply(expr: Extract<Expr, { kind: "multiply" }>): Expr | null {
  const factors = expr.factors.map(cloneExpr);
  if (factors.some((factor) => isNumberValue(factor, 0))) return num(0);

  const keptFactors: Expr[] = [];
  let numericProduct = 1;
  let numericFactorCount = 0;
  let firstNumericFactorIndex = 0;
  let changed = false;

  for (const factor of factors) {
    const numericValue = numericLiteralValue(factor);
    if (numericValue !== null) {
      if (numericFactorCount === 0) firstNumericFactorIndex = keptFactors.length;
      numericProduct *= numericValue;
      numericFactorCount += 1;
      continue;
    }

    if (isNumberValue(factor, 1)) {
      changed = true;
      continue;
    }

    const reciprocalIndex = keptFactors.findIndex((keptFactor) => areMultiplicativeReciprocals(keptFactor, factor));
    if (reciprocalIndex >= 0) {
      keptFactors.splice(reciprocalIndex, 1);
      changed = true;
      continue;
    }

    keptFactors.push(factor);
  }

  if (numericFactorCount > 0 && numericProduct !== 1) {
    keptFactors.splice(firstNumericFactorIndex, 0, num(numericProduct));
  }
  if (numericFactorCount > 1 || (numericFactorCount === 1 && numericProduct === 1)) changed = true;

  if (!changed) return null;
  return collapseProduct(keptFactors);
}

function cleanupDivide(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  if (isNumberValue(expr.numerator, 0)) return num(0);
  if (isNumberValue(expr.denominator, 1)) return cloneExpr(expr.numerator);
  if (cleanupKey(expr.numerator) === cleanupKey(expr.denominator)) return num(1);

  const numeratorValue = numericLiteralValue(expr.numerator);
  const denominatorValue = numericLiteralValue(expr.denominator);
  if (numeratorValue !== null && denominatorValue !== null && denominatorValue !== 0) {
    return num(numeratorValue / denominatorValue);
  }

  const unnestedFraction = unnestFraction(expr);
  if (unnestedFraction) return unnestedFraction;

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
  if (isNumberValue(nextDenominator, 1)) return nextNumerator;
  return divide(nextNumerator, nextDenominator);
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
  if (expr.value.kind === "negate") return cloneExpr(expr.value.value);
  return null;
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
  if (expr.kind === "display_group") {
    return numericLiteralValue(expr.expression);
  }
  if (expr.kind === "negate") {
    const value = numericLiteralValue(expr.value);
    return value === null ? null : -value;
  }
  if (expr.kind !== "number") return null;
  if (typeof expr.value !== "number") return null;
  return Number.isFinite(expr.value) ? expr.value : null;
}

function areAdditiveInverses(left: Expr, right: Expr): boolean {
  const leftPositive = unwrapNegate(left);
  const rightPositive = unwrapNegate(right);
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
  return expr.kind === "multiply" ? expr.factors.map(cloneExpr) : [cloneExpr(expr)];
}

function unwrapNegate(expr: Expr): { sign: 1 | -1; value: Expr } {
  if (expr.kind === "negate") return { sign: -1, value: expr.value };
  return { sign: 1, value: expr };
}

function cleanupKey(expr: Expr): string {
  return structuralKeyIgnoringDisplayGroups(expr);
}
