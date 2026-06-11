import type { TermSelection } from "../../selection/types";
import { add, displayGroup, divide, multiply, num, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr } from "../ast/utils";
import { cleanupExpr } from "./cleanup";
import {
  applySign,
  collapseProduct,
  isNumberValue,
  multiplySigns,
  splitSign,
  structuralKeyIgnoringDisplayGroups,
  type Sign,
} from "./algebraUtils";
import { getSelectionRewriteTarget, replaceSelectionWithExpr } from "./selectionRewrite";

type RationalParts = {
  sign: Sign;
  numeratorFactors: Expr[];
  denominatorFactors: Expr[];
};

export function canForceFactorSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): boolean {
  const target = getForceFactorTarget(document, selection);
  return target !== null;
}

export function validateForceFactorExpr(factor: Expr): string | null {
  if (!isSimpleRationalExpr(factor)) {
    return "Enter a simple factor using only numbers, symbols, products, powers, and fractions.";
  }
  if (isNumberValue(unwrapDisplayGroups(factor), 0)) {
    return "Enter a nonzero factor.";
  }
  return null;
}

export function forceFactorSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  factor: Expr,
): Expr | null {
  if (!selection || validateForceFactorExpr(factor)) return null;

  const target = getForceFactorTarget(document, selection);
  if (!target) return null;

  const factorExpr = cloneExpr(factor);
  const remainderTerms = target.terms.map((term) => {
    const quotient = quotientByFactor(term, factorExpr);
    return cleanupExpr(quotient) ?? quotient;
  });
  const factored = multiply([
    cloneExpr(factorExpr),
    displayGroup("paren", add(remainderTerms)),
  ]);
  const cleanedFactored = cleanupExpr(factored) ?? factored;

  return replaceSelectionWithExpr(document, selection, cleanedFactored);
}

function getForceFactorTarget(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): Extract<Expr, { kind: "add" }> | null {
  const expr = getSelectionRewriteTarget(document, selection)?.expr ?? null;
  if (!expr) return null;
  if (expr.kind === "add") return expr;
  if (expr.kind === "display_group" && expr.expression.kind === "add") return expr.expression;
  return null;
}

function isSimpleRationalExpr(expr: Expr): boolean {
  const positive = unwrapDisplayGroups(expr);
  switch (positive.kind) {
    case "number":
    case "symbol":
      return true;
    case "multiply":
      return positive.factors.every(isSimpleRationalExpr);
    case "divide":
      return isSimpleRationalExpr(positive.numerator) && isSimpleRationalExpr(positive.denominator);
    case "power":
      return isSimpleRationalExpr(positive.base) && isNumericExponent(positive.exponent);
    default:
      return false;
  }
}

function quotientByFactor(term: Expr, factor: Expr): Expr {
  const termParts = rationalParts(term);
  const factorParts = rationalParts(factor);
  const numeratorFactors = [
    ...termParts.numeratorFactors.map(cloneExpr),
    ...factorParts.denominatorFactors.map(cloneExpr),
  ];
  const denominatorFactors = [
    ...termParts.denominatorFactors.map(cloneExpr),
    ...factorParts.numeratorFactors.map(cloneExpr),
  ];
  const sign = multiplySigns(termParts.sign, factorParts.sign);

  normalizeNumericFactors(numeratorFactors, denominatorFactors);
  cancelCommonFactors(numeratorFactors, denominatorFactors);

  const numerator = collapseProduct(numericFactorsFirst(numeratorFactors));
  const denominator = collapseProduct(numericFactorsFirst(denominatorFactors));
  const quotient = isNumberValue(denominator, 1) ? numerator : divide(numerator, denominator);
  return applySign(sign, quotient);
}

function rationalParts(expr: Expr): RationalParts {
  const signed = splitSign(expr);
  if (signed.value.kind === "display_group") {
    const parts = rationalParts(signed.value.expression);
    return { ...parts, sign: multiplySigns(signed.sign, parts.sign) };
  }
  if (signed.value.kind === "multiply") {
    return signed.value.factors.reduce<RationalParts>(
      (acc, factor) => {
        const parts = rationalParts(factor);
        acc.sign = multiplySigns(acc.sign, parts.sign);
        acc.numeratorFactors.push(...parts.numeratorFactors);
        acc.denominatorFactors.push(...parts.denominatorFactors);
        return acc;
      },
      { sign: signed.sign, numeratorFactors: [], denominatorFactors: [] },
    );
  }
  if (signed.value.kind === "divide") {
    const numeratorParts = rationalParts(signed.value.numerator);
    const denominatorParts = rationalParts(signed.value.denominator);
    return {
      sign: multiplySigns(signed.sign, numeratorParts.sign, denominatorParts.sign),
      numeratorFactors: [
        ...numeratorParts.numeratorFactors.map(cloneExpr),
        ...denominatorParts.denominatorFactors.map(cloneExpr),
      ],
      denominatorFactors: [
        ...numeratorParts.denominatorFactors.map(cloneExpr),
        ...denominatorParts.numeratorFactors.map(cloneExpr),
      ],
    };
  }
  return {
    sign: signed.sign,
    numeratorFactors: [cloneExpr(signed.value)],
    denominatorFactors: [],
  };
}

function normalizeNumericFactors(numeratorFactors: Expr[], denominatorFactors: Expr[]): void {
  const numeratorNumeric = pullNumericFactor(numeratorFactors);
  const denominatorNumeric = pullNumericFactor(denominatorFactors);
  const divisor = greatestCommonDivisor(Math.abs(numeratorNumeric), Math.abs(denominatorNumeric));
  const nextNumerator = numeratorNumeric / divisor;
  const nextDenominator = denominatorNumeric / divisor;
  if (nextNumerator !== 1) numeratorFactors.unshift(num(nextNumerator));
  if (nextDenominator !== 1) denominatorFactors.unshift(num(nextDenominator));
}

function pullNumericFactor(factors: Expr[]): number {
  let numeric = 1;
  for (let index = 0; index < factors.length; index += 1) {
    const factor = factors[index];
    if (factor?.kind !== "number" || typeof factor.value !== "number" || !Number.isInteger(factor.value)) {
      continue;
    }
    numeric *= factor.value;
    factors.splice(index, 1);
    index -= 1;
  }
  return numeric;
}

function cancelCommonFactors(numeratorFactors: Expr[], denominatorFactors: Expr[]): void {
  for (let numeratorIndex = 0; numeratorIndex < numeratorFactors.length; numeratorIndex += 1) {
    const numeratorKey = structuralKeyIgnoringDisplayGroups(numeratorFactors[numeratorIndex]!);
    const denominatorIndex = denominatorFactors.findIndex(
      (factor) => structuralKeyIgnoringDisplayGroups(factor) === numeratorKey,
    );
    if (denominatorIndex < 0) continue;
    numeratorFactors.splice(numeratorIndex, 1);
    denominatorFactors.splice(denominatorIndex, 1);
    numeratorIndex -= 1;
  }
}

function numericFactorsFirst(factors: Expr[]): Expr[] {
  return [
    ...factors.filter((factor) => factor.kind === "number").map(cloneExpr),
    ...factors.filter((factor) => factor.kind !== "number").map(cloneExpr),
  ];
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

function isNumericExponent(expr: Expr): boolean {
  const positive = unwrapDisplayGroups(expr);
  return positive.kind === "number" && typeof positive.value === "number";
}

function unwrapDisplayGroups(expr: Expr): Expr {
  return expr.kind === "display_group" ? unwrapDisplayGroups(expr.expression) : expr;
}
