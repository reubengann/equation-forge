import { multiply, num, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";

export function collapseProduct(factors: Expr[]): Expr {
  const keptFactors = factors.filter((factor) => !isNumberValue(factor, 1));
  if (keptFactors.length === 0) return num(1);
  if (keptFactors.length === 1) return cloneExpr(keptFactors[0]);
  return multiply(keptFactors.map(cloneExpr));
}

export function isNumberValue(expr: Expr, value: number): boolean {
  return expr.kind === "number" && Number(expr.value) === value;
}

export function structuralKey(expr: Expr): string {
  const rest = { ...expr };
  delete rest.error;
  return JSON.stringify(rest);
}

export function structuralKeyIgnoringDisplayGroups(expr: Expr): string {
  return structuralKey(unwrapDisplayGroups(expr));
}

function unwrapDisplayGroups(expr: Expr): Expr {
  if (expr.kind === "display_group") return unwrapDisplayGroups(expr.expression);
  const next = cloneExpr(expr);
  const nextRecord = next as Record<string, unknown>;

  switch (next.kind) {
    case "add":
      next.terms = next.terms.map(unwrapDisplayGroups);
      break;
    case "multiply":
      next.factors = next.factors.map(unwrapDisplayGroups);
      break;
    case "power":
      next.base = unwrapDisplayGroups(next.base);
      next.exponent = unwrapDisplayGroups(next.exponent);
      break;
    case "negate":
      next.value = unwrapDisplayGroups(next.value);
      break;
    case "divide":
      next.numerator = unwrapDisplayGroups(next.numerator);
      next.denominator = unwrapDisplayGroups(next.denominator);
      break;
    default:
      return next;
  }

  return nextRecord as Expr;
}
