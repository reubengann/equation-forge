import { add, displayGroup, divide, multiply, num, power, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import { applySign, collapseProduct, flipSign, splitSign as splitExprSign, structuralKey } from "./algebraUtils";

type SignedTerm = {
  sign: 1 | -1;
  value: Expr;
};

type FactorTerm = {
  sign: 1 | -1;
  factors: Expr[];
};

type CoefficientTerm = {
  coefficient: number;
  factors: Expr[];
};

export function canFactorExpr(expr: Expr): boolean {
  if (expr.kind === "display_group" && expr.expression.kind === "add") {
    return canFactorAdd(expr.expression);
  }
  if (expr.kind !== "add") return false;
  return canFactorAdd(expr);
}

export function factorExpr(expr: Expr): Expr | null {
  if (expr.kind === "display_group" && expr.expression.kind === "add") {
    return factorAdd(expr.expression);
  }
  if (expr.kind !== "add") return null;
  return factorAdd(expr);
}

function canFactorAdd(expr: Extract<Expr, { kind: "add" }>): boolean {
  return canFactorPerfectSquare(expr) || canFactorCommonDenominator(expr) || canFactorCommonProduct(expr);
}

function factorAdd(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  const perfectSquare = factorPerfectSquare(expr);
  if (perfectSquare) return perfectSquare;

  const commonDenominator = factorCommonDenominator(expr);
  if (commonDenominator) return commonDenominator;

  return factorCommonProduct(expr);
}

function factorCommonDenominator(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  if (expr.terms.length < 2) return null;

  const terms = expr.terms.map(splitSign);
  const denominator = commonFractionDenominator(terms);
  if (!denominator) return null;

  const remainderTerms = terms.map((term) => {
    if (term.value.kind !== "divide") return null;
    return applySign(term.sign, term.value.numerator);
  });
  if (remainderTerms.some((term) => term === null)) return null;

  return multiply([divide(num(1), denominator), displayGroup("paren", add(remainderTerms as Expr[]))]);
}

function canFactorCommonDenominator(expr: Extract<Expr, { kind: "add" }>): boolean {
  return factorCommonDenominator(expr) !== null;
}

function commonFractionDenominator(terms: SignedTerm[]): Expr | null {
  const first = terms[0]?.value;
  if (!first || first.kind !== "divide") return null;

  const denominatorKey = structuralKey(first.denominator);
  return terms.every((term) => term.value.kind === "divide" && structuralKey(term.value.denominator) === denominatorKey)
    ? cloneExpr(first.denominator)
    : null;
}

function factorCommonProduct(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  if (expr.terms.length < 2) return null;

  const terms = expr.terms.map(splitTermFactors);
  const firstTerm = terms[0];
  if (!firstTerm || firstTerm.factors.length === 0) return null;

  const commonFactors: Expr[] = [];
  const remainingTerms = terms.map((term) => term.factors.map(cloneExpr));

  for (const factor of firstTerm.factors) {
    const factorKey = structuralKey(factor);
    const matchingIndexes = remainingTerms.map((termFactors) =>
      termFactors.findIndex((candidate) => structuralKey(candidate) === factorKey),
    );
    if (matchingIndexes.some((index) => index < 0)) continue;

    commonFactors.push(cloneExpr(factor));
    for (let termIndex = matchingIndexes.length - 1; termIndex >= 0; termIndex -= 1) {
      const factorIndex = matchingIndexes[termIndex];
      remainingTerms[termIndex]?.splice(factorIndex, 1);
    }
  }

  if (commonFactors.length === 0) return null;

  const remainderTerms = terms.map((term, index) =>
    applySign(term.sign, collapseProduct(remainingTerms[index] ?? [])),
  );
  return multiply([...commonFactors, displayGroup("paren", add(remainderTerms))]);
}

function canFactorCommonProduct(expr: Extract<Expr, { kind: "add" }>): boolean {
  if (expr.terms.length < 2) return false;

  const terms = expr.terms.map(splitTermFactors);
  const firstTerm = terms[0];
  if (!firstTerm || firstTerm.factors.length === 0) return false;

  return firstTerm.factors.some((factor) => {
    const factorKey = structuralKey(factor);
    return terms.every((term) => term.factors.some((candidate) => structuralKey(candidate) === factorKey));
  });
}

function factorPerfectSquare(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  if (expr.terms.length !== 3) return null;

  const coefficientTerms = expr.terms.map(splitCoefficientTerm);
  const squareTerms = coefficientTerms
    .map((term, index) => ({ term, index, base: squareBase(term) }))
    .filter((entry): entry is { term: CoefficientTerm; index: number; base: Expr } => entry.base !== null);
  if (squareTerms.length !== 2) return null;

  const middleEntry = coefficientTerms
    .map((term, index) => ({ term, index }))
    .find((entry) => !squareTerms.some((square) => square.index === entry.index));
  if (!middleEntry || Math.abs(middleEntry.term.coefficient) !== 2) return null;

  const [leftSquare, rightSquare] = squareTerms;
  if (!leftSquare || !rightSquare) return null;
  const leftBase = leftSquare.base;
  const rightBase = rightSquare.base;

  const middleKeys = middleEntry.term.factors.map(structuralKey).sort();
  const expectedKeys = [structuralKey(leftBase), structuralKey(rightBase)].sort();
  if (middleKeys.length !== 2 || middleKeys.some((key, index) => key !== expectedKeys[index])) return null;

  const innerTerms = [
    cloneExpr(leftBase),
    middleEntry.term.coefficient > 0 ? cloneExpr(rightBase) : flipSign(rightBase),
  ];
  return power(displayGroup("paren", add(innerTerms)), num(2));
}

function canFactorPerfectSquare(expr: Extract<Expr, { kind: "add" }>): boolean {
  return factorPerfectSquare(expr) !== null;
}

function squareBase(term: CoefficientTerm): Expr | null {
  if (term.coefficient !== 1 || term.factors.length !== 1) return null;
  const factor = term.factors[0];
  if (factor?.kind !== "power") return null;
  if (factor.exponent.kind !== "number" || Number(factor.exponent.value) !== 2) return null;
  return factor.base;
}

function splitTermFactors(term: Expr): FactorTerm {
  const signed = splitSign(term);
  return {
    sign: signed.sign,
    factors: signed.value.kind === "multiply" ? signed.value.factors.map(cloneExpr) : [cloneExpr(signed.value)],
  };
}

function splitCoefficientTerm(term: Expr): CoefficientTerm {
  const factorTerm = splitTermFactors(term);
  let coefficient = factorTerm.sign;
  const factors: Expr[] = [];

  for (const factor of factorTerm.factors) {
    if (factor.kind === "number" && typeof factor.value === "number") {
      coefficient *= factor.value;
    } else {
      factors.push(cloneExpr(factor));
    }
  }

  return { coefficient, factors };
}

function splitSign(term: Expr): SignedTerm {
  return splitExprSign(term);
}

