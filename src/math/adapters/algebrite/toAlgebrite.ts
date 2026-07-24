import Algebrite, { type AlgebriteNode } from "algebrite";
import { exprToLatex } from "../latex";
import { extractIntegralDifferential, type Expr } from "../../ast";

export type SymbolSubstitution = {
  originalBySafe: Map<string, string>;
  safeByOriginal: Map<string, string>;
};

export type AlgebriteTranslationIssue = {
  reason: string;
  exprKind?: string;
  detail?: string;
};

export type ToAlgebriteSuccess = {
  ok: true;
  value: AlgebriteNode;
  symbols: SymbolSubstitution;
};

export type ToAlgebriteFailure = {
  ok: false;
  issues: AlgebriteTranslationIssue[];
  symbols: SymbolSubstitution;
};

export type ToAlgebriteResult = ToAlgebriteSuccess | ToAlgebriteFailure;

type TranslationContext = {
  symbols: SymbolSubstitution;
  issues: AlgebriteTranslationIssue[];
};

const FUNCTION_BY_NAME = {
  sin: Algebrite.sin,
  cos: Algebrite.cos,
  tan: Algebrite.tan,
  log: Algebrite.log,
  ln: Algebrite.log,
  exp: Algebrite.exp,
  abs: Algebrite.abs,
} satisfies Record<string, (value: AlgebriteNode) => AlgebriteNode>;

export function createSymbolSubstitution(): SymbolSubstitution {
  return {
    originalBySafe: new Map(),
    safeByOriginal: new Map(),
  };
}

export function toAlgebrite(expr: Expr, symbols: SymbolSubstitution | null = null): ToAlgebriteResult {
  symbols = symbols ?? createSymbolSubstitution();
  const context: TranslationContext = { symbols, issues: [] };
  const value = translateExpr(expr, context);
  if (!value || context.issues.length > 0) {
    return { ok: false, issues: context.issues, symbols };
  }
  return { ok: true, value, symbols };
}

function translateExpr(expr: Expr, context: TranslationContext): AlgebriteNode | null {
  if (expr.sign === -1) {
    const positiveExpr = { ...expr };
    delete positiveExpr.sign;
    const translated = translatePositiveExpr(positiveExpr, context);
    return translated ? Algebrite.multiply(Algebrite.parse(-1), translated) : null;
  }
  return translatePositiveExpr(expr, context);
}

function translatePositiveExpr(expr: Expr, context: TranslationContext): AlgebriteNode | null {
  switch (expr.kind) {
    case "number":
      return translateNumber(expr.value, context);
    case "symbol":
      if (expr.name === String.raw`\pi`) return Algebrite.parse("pi");
      if (expr.name === "e") return Algebrite.parse("e");
      return Algebrite.usr_symbol(safeSymbolName(expr.name, context.symbols));
    case "user_function":
      return Algebrite.usr_symbol(safeSymbolName(exprToLatex(expr, false), context.symbols));
    case "special_font": {
      const name = specialFontSymbolName(expr);
      if (!name) {
        context.issues.push({ reason: "unsupported_special_font_value", exprKind: expr.value.kind });
        return null;
      }
      return Algebrite.usr_symbol(safeSymbolName(name, context.symbols));
    }
    case "primed":
      if (expr.value.kind !== "symbol") {
        context.issues.push({ reason: "unsupported_primed_value", exprKind: expr.value.kind });
        return null;
      }
      return Algebrite.usr_symbol(safeSymbolName(exprToLatex(expr, false), context.symbols));
    case "add":
      return translateNary(expr.terms, context, Algebrite.add, 0);
    case "multiply":
      return translateNary(expr.factors, context, Algebrite.multiply, 1);
    case "power":
      return translateBinary(expr.base, expr.exponent, context, Algebrite.power);
    case "negate": {
      const value = translateExpr(expr.value, context);
      return value ? Algebrite.multiply(Algebrite.parse(-1), value) : null;
    }
    case "divide": {
      const numerator = translateExpr(expr.numerator, context);
      const denominator = translateExpr(expr.denominator, context);
      return numerator && denominator
        ? Algebrite.multiply(numerator, Algebrite.power(denominator, Algebrite.parse(-1)))
        : null;
    }
    case "display_group":
      return translateExpr(expr.expression, context);
    case "call":
      return translateCall(expr, context);
    case "integral":
      return translateIntegral(expr, context);
    case "uniterated_integral":
      return translateIntegral(
        { kind: "integral", integrand: expr.integrand, lowerBound: null, upperBound: null },
        context,
      );
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return translateDerivative(expr.operand, expr.variable, context);
    case "partial_derivative":
      return translateDerivative(expr.quantity, expr.variable, context);
    case "root": {
      const value = translateExpr(expr.value, context);
      return value
        ? Algebrite.power(value, Algebrite.power(Algebrite.parse(expr.degree), Algebrite.parse(-1)))
        : null;
    }
    case "absolute_value": {
      const value = translateExpr(expr.value, context);
      return value ? Algebrite.abs(value) : null;
    }
    default:
      context.issues.push({ reason: "unsupported_expr_kind", exprKind: expr.kind });
      return null;
  }
}

function translateNumber(value: number | string, context: TranslationContext): AlgebriteNode | null {
  if (typeof value === "number") return Algebrite.parse(value);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Algebrite.parse(value);
  context.issues.push({ reason: "unsupported_number_literal", exprKind: "number", detail: value });
  return null;
}

function translateNary(
  values: Expr[],
  context: TranslationContext,
  combine: (left: AlgebriteNode, right: AlgebriteNode) => AlgebriteNode,
  identity: number,
): AlgebriteNode | null {
  if (values.length === 0) return Algebrite.parse(identity);
  const translated = values.map((value) => translateExpr(value, context));
  if (translated.some((value) => !value)) return null;
  return (translated as AlgebriteNode[]).reduce((left, right) => combine(left, right));
}

function translateBinary(
  left: Expr,
  right: Expr,
  context: TranslationContext,
  combine: (left: AlgebriteNode, right: AlgebriteNode) => AlgebriteNode,
): AlgebriteNode | null {
  const translatedLeft = translateExpr(left, context);
  const translatedRight = translateExpr(right, context);
  return translatedLeft && translatedRight ? combine(translatedLeft, translatedRight) : null;
}

function translateCall(
  expr: Extract<Expr, { kind: "call" }>,
  context: TranslationContext,
): AlgebriteNode | null {
  if (expr.callee.kind !== "symbol") {
    context.issues.push({ reason: "unsupported_call_callee", exprKind: expr.callee.kind });
    return null;
  }
  if (expr.args.length !== 1) {
    context.issues.push({ reason: "unsupported_function_arity", exprKind: "call", detail: expr.callee.name });
    return null;
  }
  const fn = FUNCTION_BY_NAME[expr.callee.name as keyof typeof FUNCTION_BY_NAME];
  if (!fn) {
    context.issues.push({ reason: "unsupported_function", exprKind: "call", detail: expr.callee.name });
    return null;
  }
  const arg = translateExpr(expr.args[0]!, context);
  return arg ? fn(arg) : null;
}

function translateIntegral(
  expr: Extract<Expr, { kind: "integral" }>,
  context: TranslationContext,
): AlgebriteNode | null {
  const extraction = extractIntegralDifferential(expr.integrand);
  if (!extraction) {
    context.issues.push({ reason: "missing_integral_differential", exprKind: "integral" });
    return null;
  }

  const translatedIntegrand = translateExpr(extraction.integrand, context);
  const translatedVariable = translateExpr(extraction.variable, context);
  if (!translatedIntegrand || !translatedVariable) return null;

  if (!expr.lowerBound && !expr.upperBound) {
    return Algebrite.integral(translatedIntegrand, translatedVariable);
  }
  if (!expr.lowerBound || !expr.upperBound) {
    context.issues.push({ reason: "unsupported_one_sided_integral_bound", exprKind: "integral" });
    return null;
  }

  const lowerBound = translateExpr(expr.lowerBound, context);
  const upperBound = translateExpr(expr.upperBound, context);
  return lowerBound && upperBound
    ? Algebrite.defint(translatedIntegrand, translatedVariable, lowerBound, upperBound)
    : null;
}

function translateDerivative(
  operand: Expr,
  variable: Expr,
  context: TranslationContext,
): AlgebriteNode | null {
  const translatedOperand = translateExpr(operand, context);
  const translatedVariable = translateExpr(variable, context);
  return translatedOperand && translatedVariable
    ? Algebrite.derivative(translatedOperand, translatedVariable)
    : null;
}

function safeSymbolName(name: string, symbols: SymbolSubstitution): string {
  const existing = symbols.safeByOriginal.get(name);
  if (existing) return existing;
  const safe = `__pdp${symbols.safeByOriginal.size}`;
  symbols.safeByOriginal.set(name, safe);
  symbols.originalBySafe.set(safe, name);
  return safe;
}

function specialFontSymbolName(expr: Extract<Expr, { kind: "special_font" }>): string | null {
  if (expr.value.kind !== "symbol") return null;
  const macro =
    expr.font === "script" ? "mathscr" : expr.font === "calligraphic" ? "mathcal" : "mathbb";
  return `\\${macro}{${expr.value.name}}`;
}
