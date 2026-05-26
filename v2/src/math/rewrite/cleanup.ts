import { add, divide, num, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import { collapseProduct, isNumberValue, structuralKeyIgnoringDisplayGroups } from "./algebraUtils";

export function canCleanupExpr(expr: Expr): boolean {
  return cleanupExpr(expr) !== null;
}

export function cleanupExpr(expr: Expr): Expr | null {
  switch (expr.kind) {
    case "add":
      return cleanupAdd(expr);
    case "multiply":
      return cleanupMultiply(expr);
    case "divide":
      return cleanupDivide(expr);
    case "negate":
      return cleanupNegate(expr);
    default:
      return null;
  }
}

function cleanupAdd(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  const terms = expr.terms.map(cloneExpr);
  const keptTerms: Expr[] = [];
  let changed = false;

  for (const term of terms) {
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

  if (!changed) return null;
  if (keptTerms.length === 0) return num(0);
  if (keptTerms.length === 1) return keptTerms[0];
  return add(keptTerms);
}

function cleanupMultiply(expr: Extract<Expr, { kind: "multiply" }>): Expr | null {
  const factors = expr.factors.map(cloneExpr);
  if (factors.some((factor) => isNumberValue(factor, 0))) return num(0);

  const keptFactors: Expr[] = [];
  let changed = false;

  for (const factor of factors) {
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

  if (!changed) return null;
  return collapseProduct(keptFactors);
}

function cleanupDivide(expr: Extract<Expr, { kind: "divide" }>): Expr | null {
  if (isNumberValue(expr.numerator, 0)) return num(0);
  if (isNumberValue(expr.denominator, 1)) return cloneExpr(expr.numerator);
  if (cleanupKey(expr.numerator) === cleanupKey(expr.denominator)) return num(1);

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

function cleanupNegate(expr: Extract<Expr, { kind: "negate" }>): Expr | null {
  if (isNumberValue(expr.value, 0)) return num(0);
  if (expr.value.kind === "negate") return cloneExpr(expr.value.value);
  return null;
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
