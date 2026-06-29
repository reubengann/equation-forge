import { add, multiply, num, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";

export type Sign = 1 | -1;

export function exprSign(expr: Expr): Sign {
  return expr.sign === -1 ? -1 : 1;
}

export function withoutSign(expr: Expr): Expr {
  const next = cloneExpr(expr);
  delete next.sign;
  return next;
}

export function withSign(expr: Expr, sign: Sign): Expr {
  const next = withoutSign(expr);
  return sign === -1 ? { ...next, sign: -1 } : next;
}

export function flipSign(expr: Expr): Expr {
  return withSign(expr, multiplySigns(exprSign(expr), -1));
}

export function multiplySigns(...signs: Sign[]): Sign {
  return signs.reduce<Sign>((acc, sign) => (acc === sign ? 1 : -1), 1);
}

export function normalizeSign(expr: Expr): Expr {
  if (expr.sign !== 1) return expr;
  return withoutSign(expr);
}

export function splitSign(expr: Expr): { sign: Sign; value: Expr } {
  if (expr.kind === "negate") {
    const inner = splitSign(expr.value);
    return {
      sign: multiplySigns(-1, inner.sign),
      value: inner.value,
    };
  }
  return { sign: exprSign(expr), value: withoutSign(expr) };
}

export function applySign(sign: Sign, expr: Expr): Expr {
  const signed = splitSign(expr);
  const nextSign = multiplySigns(sign, signed.sign);
  if (nextSign === -1 && signed.value.kind === "add") {
    return add(signed.value.terms.map(flipSign));
  }
  return withSign(signed.value, nextSign);
}

export function isNegativeExpr(expr: Expr): boolean {
  return splitSign(expr).sign === -1;
}

export function normalizeLegacyNegates(expr: Expr): Expr {
  const normalizedChildren = mapExprChildren(expr, normalizeLegacyNegates);
  const split = splitSign(normalizedChildren);
  return withSign(split.value, split.sign);
}

export function collapseProduct(factors: Expr[]): Expr {
  let sign: Sign = 1;
  const keptFactors: Expr[] = [];

  factors.forEach((factor) => {
    const signed = splitSign(factor);
    sign = multiplySigns(sign, signed.sign);
    if (!isNumberValue(signed.value, 1)) keptFactors.push(signed.value);
  });

  if (keptFactors.length === 0) return withSign(num(1), sign);
  if (keptFactors.length === 1) return withSign(cloneExpr(keptFactors[0]!), sign);
  return withSign(multiply(keptFactors.map(cloneExpr)), sign);
}

export function isNumberValue(expr: Expr, value: number): boolean {
  const signed = splitSign(expr);
  return signed.value.kind === "number" && Number(signed.value.value) * signed.sign === value;
}

export function structuralKey(expr: Expr): string {
  const rest = { ...expr };
  delete rest.error;
  if (rest.sign === 1) delete rest.sign;
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

function mapExprChildren(expr: Expr, mapper: (child: Expr) => Expr): Expr {
  const next = cloneExpr(expr);
  const nextRecord = next as Record<string, unknown>;

  switch (next.kind) {
    case "add":
      next.terms = next.terms.map(mapper);
      break;
    case "multiply":
      next.factors = next.factors.map(mapper);
      break;
    case "power":
      next.base = mapper(next.base);
      next.exponent = mapper(next.exponent);
      break;
    case "negate":
      next.value = mapper(next.value);
      break;
    case "divide":
      next.numerator = mapper(next.numerator);
      next.denominator = mapper(next.denominator);
      break;
    case "root":
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      next.value = mapper(next.value);
      break;
    case "equation":
      next.sides = next.sides.map(mapper);
      break;
    case "inequality":
      next.lhs = mapper(next.lhs);
      next.rhs = mapper(next.rhs);
      break;
    case "call":
      next.callee = mapper(next.callee);
      next.args = next.args.map(mapper);
      break;
    case "inner_product":
    case "outer_product":
      next.factors = next.factors.map(mapper);
      break;
    case "big_sum":
      next.summand = mapper(next.summand);
      if (next.lowerBound) next.lowerBound = mapper(next.lowerBound);
      if (next.upperBound) next.upperBound = mapper(next.upperBound);
      break;
    case "big_prod":
      next.muliplicand = mapper(next.muliplicand);
      if (next.lowerBound) next.lowerBound = mapper(next.lowerBound);
      if (next.upperBound) next.upperBound = mapper(next.upperBound);
      break;
    case "limit":
      next.expression = mapper(next.expression);
      if (next.lowerBound) next.lowerBound = mapper(next.lowerBound);
      break;
    case "integral":
      next.integrand = mapper(next.integrand);
      if (next.lowerBound) next.lowerBound = mapper(next.lowerBound);
      if (next.upperBound) next.upperBound = mapper(next.upperBound);
      break;
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      next.integrand = mapper(next.integrand);
      break;
    case "differential":
      next.variable = mapper(next.variable);
      break;
    case "partial_derivative":
      next.quantity = mapper(next.quantity);
      next.variable = mapper(next.variable);
      break;
    case "full_derivative_operator":
    case "partial_derivative_operator":
      next.variable = mapper(next.variable);
      next.operand = mapper(next.operand);
      break;
    case "display_group":
      next.expression = mapper(next.expression);
      break;
    case "second_order_partial_derivative":
      next.dependentVariable = mapper(next.dependentVariable);
      next.independentVariables = next.independentVariables.map(mapper);
      break;
    case "partial_at_const_quantity":
      next.quantity = mapper(next.quantity);
      next.variable = mapper(next.variable);
      next.constantQuantity = mapper(next.constantQuantity);
      break;
    default:
      return next;
  }

  return nextRecord as Expr;
}
