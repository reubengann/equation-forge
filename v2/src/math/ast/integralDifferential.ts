import type { Expr } from "./expr";

export function findIntegralDifferentialVariable(integrand: Expr): Expr | null {
  const fromTopLevelMultiply = (expr: Expr): Expr | null => {
    if (expr.kind !== "multiply") return null;
    const differentialFactor = expr.factors.find(
      (factor) => factor.kind === "differential",
    );
    return differentialFactor?.variable ?? null;
  };

  if (integrand.kind === "differential") {
    return integrand.variable;
  }
  if (integrand.kind === "divide") {
    if (integrand.numerator.kind === "differential") {
      return integrand.numerator.variable;
    }
    return fromTopLevelMultiply(integrand.numerator);
  }
  return fromTopLevelMultiply(integrand);
}
