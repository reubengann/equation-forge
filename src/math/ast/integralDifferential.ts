import type { Expr } from "./expr";
import { cloneExpr } from "./utils";

export type IntegralDifferentialExtraction = {
  variable: Expr;
  integrand: Expr;
};

export function findIntegralDifferentialVariable(integrand: Expr): Expr | null {
  return extractIntegralDifferential(integrand)?.variable ?? null;
}

export function extractIntegralDifferential(integrand: Expr): IntegralDifferentialExtraction | null {
  if (integrand.kind === "differential") {
    return {
      variable: cloneExpr(integrand.variable),
      integrand: { kind: "number", value: 1 },
    };
  }

  if (integrand.kind === "divide") {
    const numeratorExtraction = extractIntegralDifferential(integrand.numerator);
    if (!numeratorExtraction) return null;
    return {
      variable: numeratorExtraction.variable,
      integrand: {
        kind: "divide",
        numerator: numeratorExtraction.integrand,
        denominator: cloneExpr(integrand.denominator),
        ...(integrand.sign ? { sign: integrand.sign } : {}),
      },
    };
  }

  if (integrand.kind === "multiply") {
    const differentialIndex = integrand.factors.findIndex((factor) => factor.kind === "differential");
    if (differentialIndex < 0) return null;
    const differentialFactor = integrand.factors[differentialIndex];
    if (!differentialFactor || differentialFactor.kind !== "differential") return null;

    const factors = integrand.factors
      .filter((_, index) => index !== differentialIndex)
      .map(cloneExpr);
    let nextIntegrand: Expr;
    if (factors.length === 0) {
      nextIntegrand = { kind: "number", value: 1 };
    } else if (factors.length === 1) {
      nextIntegrand = factors[0]!;
    } else {
      nextIntegrand = { kind: "multiply", factors };
    }

    if (integrand.sign === -1) {
      nextIntegrand = { ...nextIntegrand, sign: -1 };
    }

    return {
      variable: cloneExpr(differentialFactor.variable),
      integrand: nextIntegrand,
    };
  }

  return null;
}
