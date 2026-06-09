import { ComputeEngine } from "@cortex-js/compute-engine";
import type { ExpressionInput } from "@cortex-js/compute-engine";
import { fromMathJson, restoreMathJsonSymbols, toMathJson } from "../adapters/mathjson";
import {
  add,
  differential,
  displayGroup,
  divide,
  findIntegralDifferentialVariable,
  multiply,
  num,
  power,
  type Expr,
} from "../ast";
import { cloneExpr } from "../ast/utils";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import type { TermSelection } from "../../selection/types";
import type { MathJsonValue } from "../adapters/mathjson";
import { flipSign, structuralKeyIgnoringDisplayGroups, withSign } from "./algebraUtils";
import { getSelectionRewriteTarget, replaceSelectionWithExpr } from "./selectionRewrite";

export type ComputeEngineEvaluationFailureReason =
  | "no_selection"
  | "selection_not_found"
  | "not_translatable"
  | "ce_error"
  | "untranslatable_result"
  | "unchanged"
  | "replacement_failed";

export type ComputeEngineEvaluationResult =
  | { ok: true; expr: Expr }
  | { ok: false; reason: ComputeEngineEvaluationFailureReason; detail?: string };

const computeEngine = new ComputeEngine();

export function canEvaluateWithComputeEngine(document: CompiledMathDocument, selection: TermSelection | null): boolean {
  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return false;
  return toMathJson(target.expr).ok;
}

export function evaluateSelectionWithComputeEngine(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): ComputeEngineEvaluationResult {
  if (!selection) return { ok: false, reason: "no_selection" };

  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return { ok: false, reason: "selection_not_found" };

  const rewritten = evaluateExprWithComputeEngine(target.expr);
  if (!rewritten.ok) return rewritten;

  const replaced = replaceSelectionWithExpr(document, selection, rewritten.expr);
  if (!replaced) return { ok: false, reason: "replacement_failed" };
  return { ok: true, expr: replaced };
}

function evaluateExprWithComputeEngine(expr: Expr): ComputeEngineEvaluationResult {
  const definiteIntegralCandidate = evaluateDefiniteIntegrals(expr);
  if (definiteIntegralCandidate) return definiteIntegralCandidate;
  return evaluateDirect(expr);
}

function evaluateDefiniteIntegrals(expr: Expr): ComputeEngineEvaluationResult | null {
  const candidate = rewriteDefiniteIntegrals(expr);
  if (!candidate.changed) return null;
  const cleaned = cleanupExactDefiniteResult(candidate.expr);
  if (sameExpr(cleaned, expr)) return { ok: false, reason: "unchanged" };
  return { ok: true, expr: cleaned };
}

function evaluateDirect(expr: Expr): ComputeEngineEvaluationResult {
  const input = toMathJson(expr);
  if (!input.ok) {
    return {
      ok: false,
      reason: "not_translatable",
      detail: input.issues.map((issue) => issue.reason).join(", "),
    };
  }

  const evaluated = computeEngine.box(input.value as ExpressionInput).evaluate().json as MathJsonValue;
  if (containsComputeEngineError(evaluated)) return { ok: false, reason: "ce_error" };

  const restored = restoreMathJsonSymbols(evaluated, input.symbols);
  const output = fromMathJson(restored);
  if (containsInvalidInput(output)) return { ok: false, reason: "untranslatable_result" };

  if (sameExpr(output, expr)) return { ok: false, reason: "unchanged" };
  return { ok: true, expr: output };
}

function rewriteDefiniteIntegrals(expr: Expr): { expr: Expr; changed: boolean } {
  switch (expr.kind) {
    case "integral":
      return rewriteDefiniteIntegral(expr);
    case "add":
      return rewriteChildren(expr, "terms", expr.terms);
    case "multiply":
      return rewriteChildren(expr, "factors", expr.factors);
    case "power": {
      const base = rewriteDefiniteIntegrals(expr.base);
      const exponent = rewriteDefiniteIntegrals(expr.exponent);
      return {
        expr: withSign(power(base.expr, exponent.expr), expr.sign ?? 1),
        changed: base.changed || exponent.changed,
      };
    }
    case "negate": {
      const value = rewriteDefiniteIntegrals(expr.value);
      return { expr: flipSign(value.expr), changed: true };
    }
    case "divide": {
      const numerator = rewriteDefiniteIntegrals(expr.numerator);
      const denominator = rewriteDefiniteIntegrals(expr.denominator);
      return {
        expr: withSign(divide(numerator.expr, denominator.expr), expr.sign ?? 1),
        changed: numerator.changed || denominator.changed,
      };
    }
    case "display_group": {
      const expression = rewriteDefiniteIntegrals(expr.expression);
      return {
        expr: withSign(displayGroup(expr.delimiter, expression.expr), expr.sign ?? 1),
        changed: expression.changed,
      };
    }
    case "call": {
      const callee = rewriteDefiniteIntegrals(expr.callee);
      const args = expr.args.map(rewriteDefiniteIntegrals);
      return {
        expr: withSign({ kind: "call", callee: callee.expr, args: args.map((arg) => arg.expr), delimiter: expr.delimiter }, expr.sign ?? 1),
        changed: callee.changed || args.some((arg) => arg.changed),
      };
    }
    default:
      return { expr: cloneExpr(expr), changed: false };
  }
}

function rewriteDefiniteIntegral(expr: Extract<Expr, { kind: "integral" }>): { expr: Expr; changed: boolean } {
  if (!expr.lowerBound || !expr.upperBound) return { expr: cloneExpr(expr), changed: false };

  const variable = findIntegralDifferentialVariable(expr.integrand);
  if (!variable) return { expr: cloneExpr(expr), changed: false };

  const integrand = stripDifferential(expr.integrand);
  const indefinite = evaluateIndefiniteIntegral(integrand, variable);
  if (!indefinite) return { expr: cloneExpr(expr), changed: false };

  const upper = substituteExpr(indefinite, variable, expr.upperBound);
  const lower = substituteExpr(indefinite, variable, expr.lowerBound);
  if (expr.sign === -1) {
    return { expr: add([lower, flipSign(upper)]), changed: true };
  }
  return { expr: add([upper, flipSign(lower)]), changed: true };
}

function evaluateIndefiniteIntegral(integrand: Expr, variable: Expr): Expr | null {
  const inputExpr = {
    kind: "integral",
    integrand: multiply([cloneExpr(integrand), differential(cloneExpr(variable))]),
    lowerBound: null,
    upperBound: null,
  } satisfies Expr;
  const input = toMathJson(inputExpr);
  if (!input.ok) return null;

  const evaluated = computeEngine.box(input.value as ExpressionInput).evaluate().json as MathJsonValue;
  if (containsComputeEngineError(evaluated)) return null;

  const restored = restoreMathJsonSymbols(evaluated, input.symbols);
  const output = fromMathJson(restored);
  if (containsInvalidInput(output)) return null;
  return output;
}

function rewriteChildren<K extends "terms" | "factors">(
  expr: Extract<Expr, { kind: "add" | "multiply" }>,
  field: K,
  children: Expr[],
): { expr: Expr; changed: boolean } {
  const rewritten = children.map(rewriteDefiniteIntegrals);
  const changed = rewritten.some((child) => child.changed);
  if (!changed) return { expr: cloneExpr(expr), changed: false };
  const nextChildren = rewritten.map((child) => child.expr);
  return {
    expr: field === "terms" ? add(nextChildren) : multiply(nextChildren.map(wrapAdditiveFactor)),
    changed: true,
  };
}

function wrapAdditiveFactor(expr: Expr): Expr {
  return expr.kind === "add" ? displayGroup("paren", expr) : expr;
}

function stripDifferential(expr: Expr): Expr {
  if (expr.kind === "differential") return num(1);
  if (expr.kind !== "multiply") return cloneExpr(expr);

  const factors = expr.factors.filter((factor) => factor.kind !== "differential").map(cloneExpr);
  if (factors.length === 0) return num(1);
  if (factors.length === 1) return factors[0]!;
  return multiply(factors);
}

function substituteExpr(expr: Expr, needle: Expr, replacement: Expr): Expr {
  if (sameExpr(expr, needle)) return withSign(replacement, expr.sign ?? 1);
  const sign = expr.sign ?? 1;

  switch (expr.kind) {
    case "add":
      return withSign(add(expr.terms.map((term) => substituteExpr(term, needle, replacement))), sign);
    case "multiply":
      return withSign(multiply(expr.factors.map((factor) => substituteExpr(factor, needle, replacement))), sign);
    case "power":
      return withSign(power(
        substituteExpr(expr.base, needle, replacement),
        substituteExpr(expr.exponent, needle, replacement),
      ), sign);
    case "negate":
      return flipSign(substituteExpr(expr.value, needle, replacement));
    case "divide":
      return withSign(divide(
        substituteExpr(expr.numerator, needle, replacement),
        substituteExpr(expr.denominator, needle, replacement),
      ), sign);
    case "display_group":
      return withSign(displayGroup(expr.delimiter, substituteExpr(expr.expression, needle, replacement)), sign);
    case "call":
      return withSign({
        kind: "call",
        callee: substituteExpr(expr.callee, needle, replacement),
        args: expr.args.map((arg) => substituteExpr(arg, needle, replacement)),
        delimiter: expr.delimiter,
      }, sign);
    default:
      return cloneExpr(expr);
  }
}

function cleanupExactDefiniteResult(expr: Expr): Expr {
  const sign = expr.sign ?? 1;
  switch (expr.kind) {
    case "add":
      return withSign(cleanupExactAdd(expr.terms.map(cleanupExactDefiniteResult)), sign);
    case "multiply":
      return withSign(cleanupExactMultiply(expr.factors.map(cleanupExactDefiniteResult)), sign);
    case "power":
      return withSign(cleanupExactPower(
        cleanupExactDefiniteResult(expr.base),
        cleanupExactDefiniteResult(expr.exponent),
      ), sign);
    case "negate":
      return flipSign(cleanupExactDefiniteResult(expr.value));
    case "divide":
      return withSign(divide(
        cleanupExactDefiniteResult(expr.numerator),
        cleanupExactDefiniteResult(expr.denominator),
      ), sign);
    case "display_group":
      return withSign(displayGroup(expr.delimiter, cleanupExactDefiniteResult(expr.expression)), sign);
    case "call":
      return withSign(cleanupExactCall({
        kind: "call",
        callee: cleanupExactDefiniteResult(expr.callee),
        args: expr.args.map(cleanupExactDefiniteResult),
        delimiter: expr.delimiter,
      }), sign);
    default:
      return cloneExpr(expr);
  }
}

function cleanupExactAdd(terms: Expr[]): Expr {
  const keptTerms: Expr[] = [];
  let integerSum = 0;

  for (const term of terms) {
    if (isNumberValue(term, 0)) continue;
    const numericTerm = signedIntegerValue(term);
    if (numericTerm !== null) {
      integerSum += numericTerm;
      continue;
    }
    keptTerms.push(normalizeAddTerm(term));
  }

  if (integerSum !== 0) keptTerms.unshift(num(integerSum));
  if (keptTerms.length === 0) return num(0);
  if (keptTerms.length === 1) return keptTerms[0]!;
  return add(keptTerms);
}

function normalizeAddTerm(term: Expr): Expr {
  return term;
}

function cleanupExactMultiply(factors: Expr[]): Expr {
  if (factors.some((factor) => isNumberValue(factor, 0))) return num(0);

  const keptFactors: Expr[] = [];
  let integerProduct = 1;

  for (const factor of factors) {
    if (isNumberValue(factor, 1)) continue;
    const numericFactor = signedIntegerValue(factor);
    if (numericFactor !== null) {
      integerProduct *= numericFactor;
      continue;
    }
    keptFactors.push(factor);
  }

  if (integerProduct !== 1 || keptFactors.length === 0) keptFactors.unshift(num(integerProduct));
  if (keptFactors.length === 1) return keptFactors[0]!;
  return multiply(keptFactors);
}

function cleanupExactPower(base: Expr, exponent: Expr): Expr {
  if (isNumberValue(exponent, 0)) return num(1);
  if (isNumberValue(exponent, 1)) return base;
  if (
    base.kind === "number" &&
    exponent.kind === "number" &&
    typeof base.value === "number" &&
    typeof exponent.value === "number" &&
    Number.isInteger(signedIntegerValue(exponent))
  ) {
    return num((signedIntegerValue(base) ?? base.value) ** (signedIntegerValue(exponent) ?? exponent.value));
  }
  return power(base, exponent);
}

function cleanupExactCall(expr: Extract<Expr, { kind: "call" }>): Expr {
  if (expr.callee.kind !== "symbol" || expr.args.length !== 1) return expr;
  const [arg] = expr.args;
  if (!arg) return expr;

  if (expr.callee.name === "cos") {
    if (isNumberValue(arg, 0)) return num(1);
    if (isPiSymbol(arg)) return num(-1);
  }
  if (expr.callee.name === "sin" && (isNumberValue(arg, 0) || isPiSymbol(arg))) {
    return num(0);
  }
  if (expr.callee.name === "tan" && isNumberValue(arg, 0)) {
    return num(0);
  }
  return expr;
}

function isNumberValue(expr: Expr, value: number): boolean {
  const sign = expr.sign === -1 ? -1 : 1;
  return expr.kind === "number" && sign * Number(expr.value) === value;
}

function signedIntegerValue(expr: Expr): number | null {
  if (expr.kind !== "number" || typeof expr.value !== "number") return null;
  const value = (expr.sign === -1 ? -1 : 1) * expr.value;
  return Number.isInteger(value) ? value : null;
}

function isPiSymbol(expr: Expr): boolean {
  return expr.kind === "symbol" && expr.name === String.raw`\pi`;
}

function containsComputeEngineError(value: MathJsonValue): boolean {
  if (Array.isArray(value)) {
    const [head, ...args] = value;
    if (head === "Error" || head === "EvaluateAt") return true;
    return args.some(containsComputeEngineError);
  }
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((entry) => containsComputeEngineError(entry as MathJsonValue));
}

function containsInvalidInput(expr: Expr): boolean {
  switch (expr.kind) {
    case "invalid_input":
      return true;
    case "add":
      return expr.terms.some(containsInvalidInput);
    case "multiply":
      return expr.factors.some(containsInvalidInput);
    case "power":
      return containsInvalidInput(expr.base) || containsInvalidInput(expr.exponent);
    case "negate":
      return containsInvalidInput(expr.value);
    case "divide":
      return containsInvalidInput(expr.numerator) || containsInvalidInput(expr.denominator);
    case "equation":
      return expr.sides.some(containsInvalidInput);
    case "call":
      return containsInvalidInput(expr.callee) || expr.args.some(containsInvalidInput);
    case "integral":
      return (
        containsInvalidInput(expr.integrand) ||
        (!!expr.lowerBound && containsInvalidInput(expr.lowerBound)) ||
        (!!expr.upperBound && containsInvalidInput(expr.upperBound))
      );
    default:
      return false;
  }
}

function sameExpr(left: Expr, right: Expr): boolean {
  return structuralKeyIgnoringDisplayGroups(left) === structuralKeyIgnoringDisplayGroups(right);
}
