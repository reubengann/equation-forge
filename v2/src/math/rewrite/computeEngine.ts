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
  negate,
  num,
  power,
  type Expr,
} from "../ast";
import { cloneExpr } from "../ast/utils";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import type { TermSelection } from "../../selection/types";
import type { MathJsonValue } from "../adapters/mathjson";
import { structuralKeyIgnoringDisplayGroups } from "./algebraUtils";
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
        expr: power(base.expr, exponent.expr),
        changed: base.changed || exponent.changed,
      };
    }
    case "negate": {
      const value = rewriteDefiniteIntegrals(expr.value);
      return { expr: negate(value.expr, expr.notation), changed: value.changed };
    }
    case "divide": {
      const numerator = rewriteDefiniteIntegrals(expr.numerator);
      const denominator = rewriteDefiniteIntegrals(expr.denominator);
      return {
        expr: divide(numerator.expr, denominator.expr),
        changed: numerator.changed || denominator.changed,
      };
    }
    case "display_group": {
      const expression = rewriteDefiniteIntegrals(expr.expression);
      return {
        expr: displayGroup(expr.delimiter, expression.expr),
        changed: expression.changed,
      };
    }
    case "call": {
      const callee = rewriteDefiniteIntegrals(expr.callee);
      const args = expr.args.map(rewriteDefiniteIntegrals);
      return {
        expr: { kind: "call", callee: callee.expr, args: args.map((arg) => arg.expr), delimiter: expr.delimiter },
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
  return { expr: add([upper, negate(lower, "subtraction")]), changed: true };
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
  if (sameExpr(expr, needle)) return cloneExpr(replacement);

  switch (expr.kind) {
    case "add":
      return add(expr.terms.map((term) => substituteExpr(term, needle, replacement)));
    case "multiply":
      return multiply(expr.factors.map((factor) => substituteExpr(factor, needle, replacement)));
    case "power":
      return power(
        substituteExpr(expr.base, needle, replacement),
        substituteExpr(expr.exponent, needle, replacement),
      );
    case "negate":
      return negate(substituteExpr(expr.value, needle, replacement), expr.notation);
    case "divide":
      return divide(
        substituteExpr(expr.numerator, needle, replacement),
        substituteExpr(expr.denominator, needle, replacement),
      );
    case "display_group":
      return displayGroup(expr.delimiter, substituteExpr(expr.expression, needle, replacement));
    case "call":
      return {
        kind: "call",
        callee: substituteExpr(expr.callee, needle, replacement),
        args: expr.args.map((arg) => substituteExpr(arg, needle, replacement)),
        delimiter: expr.delimiter,
      };
    default:
      return cloneExpr(expr);
  }
}

function cleanupExactDefiniteResult(expr: Expr): Expr {
  switch (expr.kind) {
    case "add":
      return cleanupExactAdd(expr.terms.map(cleanupExactDefiniteResult));
    case "multiply":
      return cleanupExactMultiply(expr.factors.map(cleanupExactDefiniteResult));
    case "power":
      return cleanupExactPower(
        cleanupExactDefiniteResult(expr.base),
        cleanupExactDefiniteResult(expr.exponent),
      );
    case "negate":
      return cleanupExactNegate(cleanupExactDefiniteResult(expr.value), expr.notation);
    case "divide":
      return divide(
        cleanupExactDefiniteResult(expr.numerator),
        cleanupExactDefiniteResult(expr.denominator),
      );
    case "display_group":
      return displayGroup(expr.delimiter, cleanupExactDefiniteResult(expr.expression));
    case "call":
      return cleanupExactCall({
        kind: "call",
        callee: cleanupExactDefiniteResult(expr.callee),
        args: expr.args.map(cleanupExactDefiniteResult),
        delimiter: expr.delimiter,
      });
    default:
      return cloneExpr(expr);
  }
}

function cleanupExactAdd(terms: Expr[]): Expr {
  const keptTerms: Expr[] = [];
  let integerSum = 0;

  for (const term of terms) {
    if (isNumberValue(term, 0)) continue;
    if (term.kind === "number" && typeof term.value === "number" && Number.isInteger(term.value)) {
      integerSum += term.value;
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
  return term.kind === "negate" ? negate(term.value, "subtraction") : term;
}

function cleanupExactMultiply(factors: Expr[]): Expr {
  if (factors.some((factor) => isNumberValue(factor, 0))) return num(0);

  const keptFactors: Expr[] = [];
  let integerProduct = 1;

  for (const factor of factors) {
    if (isNumberValue(factor, 1)) continue;
    if (factor.kind === "number" && typeof factor.value === "number" && Number.isInteger(factor.value)) {
      integerProduct *= factor.value;
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
    Number.isInteger(exponent.value)
  ) {
    return num(base.value ** exponent.value);
  }
  return power(base, exponent);
}

function cleanupExactNegate(value: Expr, notation: "prefix" | "subtraction" = "prefix"): Expr {
  if (isNumberValue(value, 0)) return num(0);
  if (value.kind === "number" && typeof value.value === "number") return num(-value.value);
  if (value.kind === "negate") return value.value;
  return negate(value, notation);
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
  return expr.kind === "number" && Number(expr.value) === value;
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
