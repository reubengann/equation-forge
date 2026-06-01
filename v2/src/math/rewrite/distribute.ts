import { add, negate, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";
import { collapseProduct } from "./algebraUtils";

type DistributeParts = {
  factors: Expr[];
  target: {
    factorIndex: number;
    expression: Extract<Expr, { kind: "add" }>;
  };
};

export function canDistributeExpr(expr: Expr): boolean {
  return distributeParts(expr) !== null;
}

export function distributeExpr(expr: Expr): Expr | null {
  if (expr.kind === "negate") {
    const distributed = distributeExpr(expr.value);
    if (!distributed || distributed.kind !== "add") return null;
    return add(distributed.terms.map(flipAdditiveSign));
  }

  const parts = distributeParts(expr);
  if (!parts) return null;

  return add(
    parts.target.expression.terms.map((term) => {
      const distributedTerm = term.kind === "negate" ? term.value : term;
      const product = collapseProduct(
        parts.factors.map((factor, index) =>
          index === parts.target.factorIndex ? cloneExpr(distributedTerm) : cloneExpr(factor),
        ),
      );
      return term.kind === "negate" ? negate(product, "subtraction") : product;
    }),
  );
}

function flipAdditiveSign(term: Expr): Expr {
  return term.kind === "negate" ? cloneExpr(term.value) : negate(term, "subtraction");
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
