import {
  findIntegralDifferentialVariable,
  type Expr,
} from "../../ast";
import type { MathJsonTranslationIssue, MathJsonValue } from "./types";

export type SymbolSubstitution = {
  originalBySafe: Map<string, string>;
  safeByOriginal: Map<string, string>;
};

export type ToMathJsonSuccess = {
  ok: true;
  value: MathJsonValue;
  symbols: SymbolSubstitution;
};

export type ToMathJsonFailure = {
  ok: false;
  issues: MathJsonTranslationIssue[];
  symbols: SymbolSubstitution;
};

export type ToMathJsonResult = ToMathJsonSuccess | ToMathJsonFailure;

type TranslationContext = {
  symbols: SymbolSubstitution;
  issues: MathJsonTranslationIssue[];
};

const FUNCTION_HEAD_BY_NAME: Record<string, string> = {
  sin: "Sin",
  cos: "Cos",
  tan: "Tan",
  log: "Log",
  ln: "Ln",
  exp: "Exp",
};

export function createSymbolSubstitution(): SymbolSubstitution {
  return {
    originalBySafe: new Map(),
    safeByOriginal: new Map(),
  };
}

export function toMathJson(expr: Expr, symbols = createSymbolSubstitution()): ToMathJsonResult {
  const context: TranslationContext = { symbols, issues: [] };
  const value = translateExpr(expr, context);
  if (value === null || context.issues.length > 0) {
    return { ok: false, issues: context.issues, symbols };
  }
  return { ok: true, value, symbols };
}

export function restoreMathJsonSymbols(value: MathJsonValue, symbols: SymbolSubstitution): MathJsonValue {
  if (typeof value === "string") return symbols.originalBySafe.get(value) ?? value;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map((entry) => restoreMathJsonSymbols(entry, symbols));

  const restored: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    restored[key] = restoreUnknownMathJsonSymbols(entry, symbols);
  }
  return restored;
}

function restoreUnknownMathJsonSymbols(value: unknown, symbols: SymbolSubstitution): unknown {
  if (typeof value === "string") return symbols.originalBySafe.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => restoreUnknownMathJsonSymbols(entry, symbols));
  if (typeof value !== "object" || value === null) return value;
  const restored: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    restored[key] = restoreUnknownMathJsonSymbols(entry, symbols);
  }
  return restored;
}

function translateExpr(expr: Expr, context: TranslationContext): MathJsonValue | null {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "symbol":
      return safeSymbolName(expr.name, context.symbols);
    case "add":
      return translateList("Add", expr.terms, context);
    case "multiply":
      return translateList("Multiply", expr.factors, context);
    case "power":
      return translateFixed("Power", [expr.base, expr.exponent], context);
    case "negate":
      return translateFixed("Negate", [expr.value], context);
    case "divide":
      return translateFixed("Divide", [expr.numerator, expr.denominator], context);
    case "equation":
      return translateList("Equal", expr.sides, context);
    case "display_group":
      return translateExpr(expr.expression, context);
    case "call":
      return translateCall(expr, context);
    case "integral":
      return translateIntegral(expr, context);
    case "uniterated_integral":
      return translateIntegral({ kind: "integral", integrand: expr.integrand, lowerBound: null, upperBound: null }, context);
    case "differential":
      return translateExpr(expr.variable, context);
    case "partial_derivative":
      return translateFixed("PartialDerivative", [expr.quantity, expr.variable], context);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return translateFixed("D", [expr.operand, expr.variable], context);
    case "root":
      return ["Power", translateExpr(expr.value, context), ["Rational", 1, expr.degree]];
    case "absolute_value":
      return translateFixed("Abs", [expr.value], context);
    default:
      context.issues.push({
        reason: "unsupported_expr_kind",
        exprKind: expr.kind,
      });
      return null;
  }
}

function translateCall(expr: Extract<Expr, { kind: "call" }>, context: TranslationContext): MathJsonValue | null {
  if (expr.callee.kind !== "symbol") {
    context.issues.push({ reason: "unsupported_call_callee", exprKind: expr.callee.kind });
    return null;
  }
  const head = FUNCTION_HEAD_BY_NAME[expr.callee.name];
  if (!head) {
    context.issues.push({ reason: "unsupported_function", exprKind: "call", detail: expr.callee.name });
    return null;
  }
  return translateList(head, expr.args, context);
}

function translateIntegral(expr: Extract<Expr, { kind: "integral" }>, context: TranslationContext): MathJsonValue | null {
  const variable = findIntegralDifferentialVariable(expr.integrand);
  if (!variable) {
    context.issues.push({ reason: "missing_integral_differential", exprKind: "integral" });
    return null;
  }

  const integrand = removeDifferentialFactor(expr.integrand);
  const translatedIntegrand = translateExpr(integrand, context);
  const translatedVariable = translateExpr(variable, context);
  if (translatedIntegrand === null || translatedVariable === null) return null;

  const lowerBound = expr.lowerBound ? translateExpr(expr.lowerBound, context) : "Nothing";
  const upperBound = expr.upperBound ? translateExpr(expr.upperBound, context) : "Nothing";
  if (lowerBound === null || upperBound === null) return null;
  return ["Integrate", translatedIntegrand, ["Limits", translatedVariable, lowerBound, upperBound]];
}

function translateList(head: string, values: Expr[], context: TranslationContext): MathJsonValue | null {
  const translated = values.map((value) => translateExpr(value, context));
  if (translated.some((value) => value === null)) return null;
  return [head, ...(translated as MathJsonValue[])];
}

function translateFixed(head: string, values: Expr[], context: TranslationContext): MathJsonValue | null {
  return translateList(head, values, context);
}

function safeSymbolName(name: string, symbols: SymbolSubstitution): string {
  if (name === String.raw`\pi`) return "Pi";
  const existing = symbols.safeByOriginal.get(name);
  if (existing) return existing;
  const safe = `__pdp${symbols.safeByOriginal.size}`;
  symbols.safeByOriginal.set(name, safe);
  symbols.originalBySafe.set(safe, name);
  return safe;
}

function removeDifferentialFactor(expr: Expr): Expr {
  if (expr.kind === "differential") return { kind: "number", value: 1 };
  if (expr.kind !== "multiply") return expr;

  const factors = expr.factors.filter((factor) => factor.kind !== "differential");
  if (factors.length === 0) return { kind: "number", value: 1 };
  if (factors.length === 1) return factors[0]!;
  return { kind: "multiply", factors };
}
