import { add, fullDerivativeOperator, partialDerivative, partialDerivativeOperator, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import { collapseProduct, flipSign, multiplySigns, splitSign, type Sign } from "./algebraUtils";

type DistributeParts = {
  factors: Expr[];
  target: {
    factorIndex: number;
    expression: Extract<Expr, { kind: "add" }>;
  };
};

type DistributableDerivative = Extract<
  Expr,
  { kind: "full_derivative_operator" | "partial_derivative" | "partial_derivative_operator" }
>;

export function canDistributeExpr(expr: Expr): boolean {
  return distributeParts(expr) !== null || derivativeAdditiveTarget(expr) !== null;
}

export function distributeExpr(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) {
    const distributed = distributeExpr(signed.value);
    if (!distributed || distributed.kind !== "add") return null;
    return add(distributed.terms.map(flipAdditiveSign));
  }

  const derivativeDistribution = distributeDerivative(signed.value);
  if (derivativeDistribution) return derivativeDistribution;

  const parts = distributeParts(expr);
  if (!parts) return null;

  return add(
    parts.target.expression.terms.map((term) => {
      const signedTerm = splitSign(term);
      const distributedTerm = signedTerm.value;
      const product = collapseProduct(
        parts.factors.map((factor, index) =>
          index === parts.target.factorIndex ? cloneExpr(distributedTerm) : cloneExpr(factor),
        ),
      );
      return signedTerm.sign === -1 ? flipSign(product) : product;
    }),
  );
}

function flipAdditiveSign(term: Expr): Expr {
  return flipSign(term);
}

function distributeDerivative(expr: Expr): Expr | null {
  if (!isDistributableDerivative(expr)) return null;

  const target = derivativeAdditiveTarget(expr);
  if (!target) return null;

  return add(
    target.terms.map((term) => {
      const signedTerm = splitDerivativeTermSign(term);
      const derivative = derivativeWithTarget(expr, signedTerm.value);
      return signedTerm.sign === -1 ? flipSign(derivative) : derivative;
    }),
  );
}

function splitDerivativeTermSign(term: Expr): { sign: Sign; value: Expr } {
  const signedTerm = splitSign(term);
  if (signedTerm.value.kind !== "multiply") return signedTerm;

  let sign = signedTerm.sign;
  const factors = signedTerm.value.factors.map((factor) => {
    const signedFactor = splitSign(factor);
    sign = multiplySigns(sign, signedFactor.sign);
    return signedFactor.value;
  });

  return { sign, value: collapseProduct(factors) };
}

function isDistributableDerivative(expr: Expr): expr is DistributableDerivative {
  return (
    expr.kind === "full_derivative_operator" ||
    expr.kind === "partial_derivative" ||
    expr.kind === "partial_derivative_operator"
  );
}

function derivativeAdditiveTarget(expr: Expr): Extract<Expr, { kind: "add" }> | null {
  if (!isDistributableDerivative(expr)) return null;

  switch (expr.kind) {
    case "partial_derivative":
      return additiveExpressionForFactor(expr.quantity);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return additiveExpressionForFactor(expr.operand);
  }
}

function derivativeWithTarget(expr: DistributableDerivative, target: Expr): Expr {
  switch (expr.kind) {
    case "partial_derivative":
      return partialDerivative(cloneExpr(target), cloneExpr(expr.variable));
    case "full_derivative_operator":
      return fullDerivativeOperator(cloneExpr(expr.variable), cloneExpr(target));
    case "partial_derivative_operator":
      return partialDerivativeOperator(cloneExpr(expr.variable), cloneExpr(target));
  }
}

function distributeParts(expr: Expr): DistributeParts | null {
  if (expr.kind !== "multiply" || expr.factors.length < 2) return null;

  const additiveFactors = expr.factors
    .map((factor, index) => {
      const additive = additiveExpressionForFactor(factor);
      return additive ? { factorIndex: index, expression: additive } : null;
    })
    .filter(
      (entry): entry is { factorIndex: number; expression: Extract<Expr, { kind: "add" }> } => entry !== null,
    );
  const target = additiveFactors.at(-1);
  if (!target) return null;

  return { factors: expr.factors.map(cloneExpr), target };
}

function additiveExpressionForFactor(factor: Expr): Extract<Expr, { kind: "add" }> | null {
  if (factor.kind === "add") return factor;
  if (factor.kind === "display_group" && factor.expression.kind === "add") return factor.expression;
  return null;
}
