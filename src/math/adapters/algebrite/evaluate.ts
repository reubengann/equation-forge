import Algebrite from "algebrite";
import { extractIntegralDifferential, type Expr } from "../../ast";
import { fromAlgebrite } from "./fromAlgebrite";
import { toAlgebrite } from "./toAlgebrite";

export function canEvaluateAlgebrite(expr: Expr): boolean {
  return canTranslateExpr(expr);
}

export function evaluateAlgebrite(expr: Expr): Expr | null {
  const input = toAlgebrite(expr);
  if (!input.ok) return null;

  try {
    const evaluated = Algebrite.simplify(input.value);
    const output = fromAlgebrite(evaluated, input.symbols);
    return containsInvalidInput(output) ? null : output;
  } catch {
    return null;
  }
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

function canTranslateExpr(expr: Expr): boolean {
  switch (expr.kind) {
    case "number":
      return typeof expr.value === "number" || /^-?\d+(?:\.\d+)?$/.test(expr.value);
    case "symbol":
    case "user_function":
      return true;
    case "special_font":
      return expr.value.kind === "symbol";
    case "primed":
      return expr.value.kind === "symbol";
    case "add":
      return expr.terms.every(canTranslateExpr);
    case "multiply":
      return expr.factors.every(canTranslateExpr);
    case "power":
      return canTranslateExpr(expr.base) && canTranslateExpr(expr.exponent);
    case "negate":
      return canTranslateExpr(expr.value);
    case "divide":
      return canTranslateExpr(expr.numerator) && canTranslateExpr(expr.denominator);
    case "display_group":
      return canTranslateExpr(expr.expression);
    case "call":
      return canTranslateCall(expr);
    case "integral":
      return canTranslateIntegral(expr);
    case "uniterated_integral":
      return canTranslateIntegral({ kind: "integral", integrand: expr.integrand, lowerBound: null, upperBound: null });
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return canTranslateExpr(expr.operand) && canTranslateExpr(expr.variable);
    case "partial_derivative":
      return canTranslateExpr(expr.quantity) && canTranslateExpr(expr.variable);
    case "root":
      return canTranslateExpr(expr.value);
    case "absolute_value":
      return canTranslateExpr(expr.value);
    default:
      return false;
  }
}

function canTranslateCall(expr: Extract<Expr, { kind: "call" }>): boolean {
  return (
    expr.callee.kind === "symbol" &&
    ["sin", "cos", "tan", "log", "ln", "exp", "abs"].includes(expr.callee.name) &&
    expr.args.length === 1 &&
    canTranslateExpr(expr.args[0]!)
  );
}

function canTranslateIntegral(expr: Extract<Expr, { kind: "integral" }>): boolean {
  const extraction = extractIntegralDifferential(expr.integrand);
  if (!extraction) return false;
  if ((expr.lowerBound && !expr.upperBound) || (!expr.lowerBound && expr.upperBound)) return false;
  return (
    canTranslateExpr(extraction.integrand) &&
    canTranslateExpr(extraction.variable) &&
    (!expr.lowerBound || canTranslateExpr(expr.lowerBound)) &&
    (!expr.upperBound || canTranslateExpr(expr.upperBound))
  );
}
