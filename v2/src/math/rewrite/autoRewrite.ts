import type { TermSelection } from "../../selection/types";
import { add, displayGroup, multiply, negate, num, power, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";

export type AutoRewriteKind = "factor";

type MultiSelectionRange = {
  parentId: string;
  parent: Expr;
  start: number;
  end: number;
  selectedExpr: Expr;
};

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

export function canAutoRewrite(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  kind: AutoRewriteKind,
): boolean {
  if (!selection) return false;
  if (kind !== "factor") return false;

  const selectionExpr = exprForSelection(document, selection);
  return selectionExpr !== null && canFactorExpr(selectionExpr);
}

export function autoRewriteSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  kind: AutoRewriteKind,
): Expr | null {
  if (!selection) return null;
  if (kind !== "factor") return null;

  if (selection.kind === "single") {
    const selected = document.index.nodeById[selection.nodeId];
    if (!selected) return null;
    const factored = factorExpr(selected);
    if (!factored) return null;
    return replaceCompiledNode(document, selection.nodeId, wrapReplacementForLocation(document, selection.nodeId, factored));
  }

  const range = resolveMultiSelectionRange(document, selection);
  if (!range) return null;
  const factored = factorExpr(range.selectedExpr);
  if (!factored) return null;

  const nextParent = cloneExpr(range.parent);
  if (nextParent.kind !== "add") return null;
  nextParent.terms = [
    ...nextParent.terms.slice(0, range.start),
    factored,
    ...nextParent.terms.slice(range.end + 1),
  ];
  return replaceCompiledNode(document, range.parentId, nextParent);
}

function exprForSelection(document: CompiledMathDocument, selection: TermSelection): Expr | null {
  if (selection.kind === "single") {
    return document.index.nodeById[selection.nodeId] ?? null;
  }
  return resolveMultiSelectionRange(document, selection)?.selectedExpr ?? null;
}

function canFactorExpr(expr: Expr): boolean {
  if (expr.kind === "display_group" && expr.expression.kind === "add") {
    return canFactorAdd(expr.expression);
  }
  if (expr.kind !== "add") return false;
  return canFactorAdd(expr);
}

function canFactorAdd(expr: Extract<Expr, { kind: "add" }>): boolean {
  return canFactorPerfectSquare(expr) || canFactorCommonProduct(expr);
}

function factorExpr(expr: Expr): Expr | null {
  if (expr.kind === "display_group" && expr.expression.kind === "add") {
    return factorAdd(expr.expression);
  }
  if (expr.kind !== "add") return null;
  return factorAdd(expr);
}

function factorAdd(expr: Extract<Expr, { kind: "add" }>): Expr | null {
  const perfectSquare = factorPerfectSquare(expr);
  if (perfectSquare) return perfectSquare;

  return factorCommonProduct(expr);
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
    middleEntry.term.coefficient > 0 ? cloneExpr(rightBase) : negate(cloneExpr(rightBase), "subtraction"),
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
  if (term.kind === "negate") {
    return { sign: -1, value: term.value };
  }
  return { sign: 1, value: term };
}

function applySign(sign: 1 | -1, expr: Expr): Expr {
  if (sign === 1) return expr;
  if (expr.kind === "number" && typeof expr.value === "number") return num(-expr.value);
  return negate(expr, "subtraction");
}

function collapseProduct(factors: Expr[]): Expr {
  if (factors.length === 0) return num(1);
  if (factors.length === 1) return cloneExpr(factors[0]);
  return multiply(factors.map(cloneExpr));
}

function structuralKey(expr: Expr): string {
  const rest = { ...expr };
  delete rest.error;
  return JSON.stringify(rest);
}

function resolveMultiSelectionRange(
  document: CompiledMathDocument,
  selection: Extract<TermSelection, { kind: "multi" }>,
): MultiSelectionRange | null {
  const { containerNodeId } = selection;
  if (!containerNodeId || selection.nodeIds.length === 0) return null;

  const parent = document.index.nodeById[containerNodeId];
  if (!parent || parent.kind !== "add") return null;

  const indexedChildren = selection.nodeIds
    .map((nodeId) => {
      const location = document.index.locationById[nodeId];
      if (location?.parentId !== containerNodeId || location.index == null) return null;
      return { index: location.index };
    })
    .filter((child): child is { index: number } => child !== null)
    .sort((a, b) => a.index - b.index);

  if (indexedChildren.length !== selection.nodeIds.length) return null;

  const start = indexedChildren[0]?.index;
  const end = indexedChildren[indexedChildren.length - 1]?.index;
  if (start == null || end == null) return null;
  if (end - start + 1 !== indexedChildren.length) return null;

  const selectedTerms = parent.terms.slice(start, end + 1).map(cloneExpr);
  if (selectedTerms.length !== indexedChildren.length) return null;

  return { parentId: containerNodeId, parent, start, end, selectedExpr: add(selectedTerms) };
}

function wrapReplacementForLocation(document: CompiledMathDocument, nodeId: string, replacement: Expr): Expr {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId || !location.field) return cloneExpr(replacement);

  const parent = document.index.nodeById[location.parentId];
  if (!parent) return cloneExpr(replacement);

  if (parent.kind === "power" && location.field === "base") return displayGroup("paren", cloneExpr(replacement));
  return cloneExpr(replacement);
}
