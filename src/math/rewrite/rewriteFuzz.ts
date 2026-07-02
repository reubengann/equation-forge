import Algebrite, { type AlgebriteNode } from "algebrite";
import * as fc from "fast-check";
import {
  add,
  displayGroup,
  divide,
  equation,
  multiply,
  num,
  power,
  sym,
  type Expr,
} from "../ast";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { createSymbolSubstitution, toAlgebrite } from "../adapters/algebrite/toAlgebrite";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { cleanupExpr } from "./cleanup";
import { normalizeLegacyNegates } from "./algebraUtils";
import { canExecuteMove, executeMove } from "./rewriteEngine";
import type { InsertionSlot, MoveType } from "./types";

const SYMBOLS = ["a", "b", "c", "x", "y", "z", "T", "P"];
const SLOTS: InsertionSlot[] = ["before", "after"];
const MOVE_TYPES: MoveType[] = ["additive", "multiplicative"];
const MAX_ACCEPTED_MOVES_PER_CASE = 12;
const SAMPLE_VALUES = [2, -3, 5, -7, 11];
const NUMERIC_TOLERANCE = 1e-9;

export type RewriteFuzzCase = {
  expr: Expr;
};

export type RewriteFuzzFailure = {
  reason: string;
  sourceLatex: string;
  resultLatex?: string;
  selectionId?: string;
  destinationId?: string;
  moveType?: MoveType;
  destinationSlot?: InsertionSlot;
};

export type RewriteFuzzResult = {
  checkedMoves: number;
  skipped: boolean;
  failure: RewriteFuzzFailure | null;
};

type MoveAttempt = {
  selectionId: string;
  destinationId: string;
  moveType: MoveType;
  destinationSlot: InsertionSlot;
};

export const rewriteFuzzCaseArbitrary: fc.Arbitrary<RewriteFuzzCase> = fc.record({
  expr: expressionArbitrary(),
});

export function runRewriteFuzzCase(testCase: RewriteFuzzCase): RewriteFuzzResult {
  const sourceLatex = exprToLatex(testCase.expr, false);
  const document = compileMathDocumentFromExpr(sourceLatex, testCase.expr);
  const attempts = acceptedMoveAttempts(document);
  if (attempts.length === 0) return { checkedMoves: 0, skipped: true, failure: null };

  for (const attempt of attempts) {
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: attempt.selectionId },
      destinationId: attempt.destinationId,
      moveType: attempt.moveType,
      destinationSlot: attempt.destinationSlot,
    });
    if (!preview) continue;

    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: attempt.selectionId },
      destinationId: attempt.destinationId,
      moveType: attempt.moveType,
      destinationSlot: attempt.destinationSlot,
    });
    if (!result) {
      return {
        checkedMoves: 0,
        skipped: false,
        failure: { reason: "preview_without_execution", sourceLatex, ...attempt },
      };
    }

    const parsed = parseResult(result.latex);
    if (!parsed) {
      return {
        checkedMoves: 0,
        skipped: false,
        failure: { reason: "result_latex_did_not_parse", sourceLatex, resultLatex: result.latex, ...attempt },
      };
    }

    const signFailure = signMetadataFailure(parsed);
    if (signFailure) {
      return {
        checkedMoves: 0,
        skipped: false,
        failure: { reason: signFailure, sourceLatex, resultLatex: result.latex, ...attempt },
      };
    }

    if (!semanticallyEquivalent(testCase.expr, parsed)) {
      return {
        checkedMoves: 0,
        skipped: false,
        failure: { reason: "semantic_invariant_changed", sourceLatex, resultLatex: result.latex, ...attempt },
      };
    }
  }

  return { checkedMoves: attempts.length, skipped: false, failure: null };
}

export function formatRewriteFuzzFailure(failure: RewriteFuzzFailure): string {
  const move = failure.selectionId
    ? `\nmove=${JSON.stringify({
      selectionId: failure.selectionId,
      destinationId: failure.destinationId,
      moveType: failure.moveType,
      destinationSlot: failure.destinationSlot,
    })}`
    : "";
  return [
    `reason=${failure.reason}`,
    `source=${failure.sourceLatex}`,
    failure.resultLatex ? `result=${failure.resultLatex}` : null,
    move,
  ].filter((line): line is string => line !== null).join("\n");
}

function expressionArbitrary(): fc.Arbitrary<Expr> {
  return fc.letrec<{ expr: Expr; atom: Expr; nonZeroAtom: Expr }>((tie) => ({
    atom: withOptionalSign(fc.oneof(
      fc.constantFrom(...SYMBOLS).map((name) => sym(name)),
      fc.integer({ min: 1, max: 5 }).map((value) => num(value)),
    )),
    nonZeroAtom: withOptionalSign(fc.oneof(
      fc.constantFrom(...SYMBOLS).map((name) => sym(name)),
      fc.integer({ min: 1, max: 5 }).map((value) => num(value)),
    )),
    expr: fc.oneof(
      { weight: 4, arbitrary: tie("atom") },
      { weight: 3, arbitrary: fc.array(tie("expr"), { minLength: 2, maxLength: 3 }).map((terms) => add(terms)) },
      { weight: 3, arbitrary: fc.array(tie("expr"), { minLength: 2, maxLength: 3 }).map((factors) => multiply(factors)) },
      {
        weight: 4,
        arbitrary: fc.tuple(tie("expr"), tie("nonZeroAtom"), signArbitrary()).map(([numerator, denominator, sign]) =>
          divide(numerator, denominator, { sign })),
      },
      {
        weight: 2,
        arbitrary: fc.tuple(tie("atom"), fc.integer({ min: 2, max: 3 }), signArbitrary()).map(([base, exponent, sign]) =>
          power(base, num(exponent), { sign })),
      },
      {
        weight: 2,
        arbitrary: fc.tuple(tie("expr"), signArbitrary()).map(([expression, sign]) =>
          displayGroup("paren", expression, { sign })),
      },
    ),
  })).expr.chain((expr) =>
    fc.oneof(
      fc.constant(expr),
      fc.tuple(fc.constant(expr), fc.letrec<{ expr: Expr }>((tie) => ({
        expr: fc.oneof(
          withOptionalSign(fc.oneof(
            fc.constantFrom(...SYMBOLS).map((name) => sym(name)),
            fc.integer({ min: 1, max: 5 }).map((value) => num(value)),
          )),
          fc.array(tie("expr"), { minLength: 2, maxLength: 3 }).map((terms) => add(terms)),
          fc.array(tie("expr"), { minLength: 2, maxLength: 3 }).map((factors) => multiply(factors)),
        ),
      })).expr).map(([lhs, rhs]) => equation([lhs, rhs])),
    ));
}

function signArbitrary(): fc.Arbitrary<1 | -1> {
  return fc.constantFrom<1 | -1>(1, 1, 1, -1);
}

function withOptionalSign(arbitrary: fc.Arbitrary<Expr>): fc.Arbitrary<Expr> {
  return fc.tuple(arbitrary, signArbitrary()).map(([expr, sign]) => (sign === -1 ? { ...expr, sign } : expr));
}

function acceptedMoveAttempts(document: CompiledMathDocument): MoveAttempt[] {
  const nodeIds = Object.keys(document.index.nodeById).filter((nodeId) => nodeId !== document.index.rootId);
  const attempts: MoveAttempt[] = [];

  for (const selectionId of nodeIds) {
    for (const destinationId of nodeIds) {
      if (selectionId === destinationId) continue;
      for (const moveType of MOVE_TYPES) {
        for (const destinationSlot of SLOTS) {
          const preview = canExecuteMove({
            document,
            selection: { kind: "single", nodeId: selectionId },
            destinationId,
            moveType,
            destinationSlot,
          });
          if (!preview) continue;
          attempts.push({ selectionId, destinationId, moveType, destinationSlot });
          if (attempts.length >= MAX_ACCEPTED_MOVES_PER_CASE) return attempts;
        }
      }
    }
  }

  return attempts;
}

function parseResult(latex: string): Expr | null {
  try {
    return parseLatexToExpr(latex);
  } catch {
    return null;
  }
}

function signMetadataFailure(expr: Expr): string | null {
  const cleaned = cleanupExpr(normalizeLegacyNegates(expr)) ?? normalizeLegacyNegates(expr);
  return hasExplicitPositiveSign(cleaned) ? "explicit_positive_sign_metadata" : null;
}

function hasExplicitPositiveSign(expr: Expr): boolean {
  if (expr.sign === 1) return true;
  switch (expr.kind) {
    case "add":
      return expr.terms.some(hasExplicitPositiveSign);
    case "multiply":
      return expr.factors.some(hasExplicitPositiveSign);
    case "power":
      return hasExplicitPositiveSign(expr.base) || hasExplicitPositiveSign(expr.exponent);
    case "divide":
      return hasExplicitPositiveSign(expr.numerator) || hasExplicitPositiveSign(expr.denominator);
    case "display_group":
      return hasExplicitPositiveSign(expr.expression);
    case "equation":
      return expr.sides.some(hasExplicitPositiveSign);
    default:
      return false;
  }
}

function semanticallyEquivalent(before: Expr, after: Expr): boolean {
  if (before.kind === "equation" || after.kind === "equation") {
    return equationsHaveSameTruthValue(before, after);
  }

  const beforeInvariant = semanticInvariantExpr(before);
  const afterInvariant = semanticInvariantExpr(after);
  if (!beforeInvariant || !afterInvariant) return true;

  const symbols = createSymbolSubstitution();
  const beforeValue = toAlgebrite(beforeInvariant, symbols);
  const afterValue = toAlgebrite(afterInvariant, symbols);
  if (!beforeValue.ok || !afterValue.ok) return true;

  try {
    const delta = subtractNodes(beforeValue.value, afterValue.value);
    return Algebrite.simplify(delta).toString() === "0";
  } catch {
    return true;
  }
}

function semanticInvariantExpr(expr: Expr): Expr | null {
  return expr;
}

function subtractNodes(left: AlgebriteNode, right: AlgebriteNode): AlgebriteNode {
  return Algebrite.add(left, Algebrite.multiply(Algebrite.parse(-1), right));
}

function equationsHaveSameTruthValue(before: Expr, after: Expr): boolean {
  if (before.kind !== "equation" || after.kind !== "equation") return false;
  if (before.sides.length !== 2 || after.sides.length !== 2) return true;

  const symbolNames = [...new Set([...collectSymbolNames(before), ...collectSymbolNames(after)])].sort();
  let checkedSamples = 0;

  for (let sampleIndex = 0; sampleIndex < SAMPLE_VALUES.length; sampleIndex += 1) {
    const assignments = new Map<string, number>();
    symbolNames.forEach((name, symbolIndex) => {
      assignments.set(name, SAMPLE_VALUES[(sampleIndex + symbolIndex) % SAMPLE_VALUES.length]!);
    });

    const beforeValue = equationDeltaValue(before, assignments);
    const afterValue = equationDeltaValue(after, assignments);
    if (beforeValue === null || afterValue === null) continue;

    checkedSamples += 1;
    const beforeSatisfied = Math.abs(beforeValue) < NUMERIC_TOLERANCE;
    const afterSatisfied = Math.abs(afterValue) < NUMERIC_TOLERANCE;
    if (beforeSatisfied !== afterSatisfied) return false;
  }

  return checkedSamples > 0;
}

function equationDeltaValue(expr: Extract<Expr, { kind: "equation" }>, assignments: Map<string, number>): number | null {
  const left = numericValue(expr.sides[0]!, assignments);
  const right = numericValue(expr.sides[1]!, assignments);
  return left === null || right === null ? null : left - right;
}

function numericValue(expr: Expr, assignments: Map<string, number>): number | null {
  const sign = expr.sign === -1 ? -1 : 1;
  const value = numericPositiveValue(expr, assignments);
  return value === null ? null : sign * value;
}

function numericPositiveValue(expr: Expr, assignments: Map<string, number>): number | null {
  switch (expr.kind) {
    case "number": {
      const value = Number(expr.value);
      return Number.isFinite(value) ? value : null;
    }
    case "symbol":
      return assignments.get(expr.name) ?? null;
    case "add":
      return combineNumericValues(expr.terms, assignments, (values) =>
        values.reduce((total, value) => total + value, 0));
    case "multiply":
      return combineNumericValues(expr.factors, assignments, (values) =>
        values.reduce((product, value) => product * value, 1));
    case "divide": {
      const numerator = numericValue(expr.numerator, assignments);
      const denominator = numericValue(expr.denominator, assignments);
      if (numerator === null || denominator === null || Math.abs(denominator) < NUMERIC_TOLERANCE) return null;
      return numerator / denominator;
    }
    case "power": {
      const base = numericValue(expr.base, assignments);
      const exponent = numericValue(expr.exponent, assignments);
      if (base === null || exponent === null) return null;
      const value = base ** exponent;
      return Number.isFinite(value) ? value : null;
    }
    case "display_group":
      return numericValue(expr.expression, assignments);
    default:
      return null;
  }
}

function combineNumericValues(
  values: Expr[],
  assignments: Map<string, number>,
  combine: (values: number[]) => number,
): number | null {
  const numericValues = values.map((value) => numericValue(value, assignments));
  if (numericValues.some((value) => value === null)) return null;
  return combine(numericValues as number[]);
}

function collectSymbolNames(expr: Expr): string[] {
  switch (expr.kind) {
    case "symbol":
      return [expr.name];
    case "add":
      return expr.terms.flatMap(collectSymbolNames);
    case "multiply":
      return expr.factors.flatMap(collectSymbolNames);
    case "power":
      return [...collectSymbolNames(expr.base), ...collectSymbolNames(expr.exponent)];
    case "divide":
      return [...collectSymbolNames(expr.numerator), ...collectSymbolNames(expr.denominator)];
    case "display_group":
      return collectSymbolNames(expr.expression);
    case "equation":
      return expr.sides.flatMap(collectSymbolNames);
    default:
      return [];
  }
}
