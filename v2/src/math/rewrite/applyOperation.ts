import { equation, inequality, type Expr } from "../ast";
import { cloneExpr } from "../ast/utils";

const EQUATION_PLACEHOLDER = "eqn";

export function canApplyOperationToRelation(expr: Expr): boolean {
  return expr.kind === "equation" || expr.kind === "inequality";
}

export function validateOperationTemplate(template: Expr): string | null {
  if (containsRelation(template)) return "Enter an operation expression, not an equation or inequality.";

  const placeholderCount = countEquationPlaceholders(template);
  if (placeholderCount === 0) return String.raw`Include \eqn where the current side should go.`;
  if (placeholderCount > 1) return String.raw`Use exactly one \eqn placeholder.`;

  return null;
}

export function applyOperationToRelation(relation: Expr, template: Expr): Expr | null {
  if (!canApplyOperationToRelation(relation)) return null;
  if (validateOperationTemplate(template)) return null;

  if (relation.kind === "equation") {
    return equation(relation.sides.map((side) => applyOperationToSide(template, side)));
  }

  if (relation.kind === "inequality") {
    return inequality(
      applyOperationToSide(template, relation.lhs),
      relation.operator,
      applyOperationToSide(template, relation.rhs),
    );
  }

  return null;
}

function applyOperationToSide(template: Expr, side: Expr): Expr {
  return replaceEquationPlaceholder(template, side) ?? cloneExpr(template);
}

function isEquationPlaceholder(expr: Expr): boolean {
  return expr.kind === "symbol" && expr.name === EQUATION_PLACEHOLDER;
}

function countEquationPlaceholders(expr: Expr): number {
  if (isEquationPlaceholder(expr)) return 1;
  return childExprs(expr).reduce((sum, child) => sum + countEquationPlaceholders(child), 0);
}

function containsRelation(expr: Expr): boolean {
  if (expr.kind === "equation" || expr.kind === "inequality") return true;
  return childExprs(expr).some(containsRelation);
}

function replaceEquationPlaceholder(expr: Expr, side: Expr): Expr | null {
  if (isEquationPlaceholder(expr)) return cloneExpr(side);

  const nextExpr = cloneExpr(expr);
  let changed = false;

  for (const [key, value] of Object.entries(nextExpr) as Array<[keyof Expr, unknown]>) {
    if (key === "kind" || key === "error") continue;

    if (isExpr(value)) {
      const replacement = replaceEquationPlaceholder(value, side);
      if (replacement) {
        (nextExpr as Record<string, unknown>)[key] = replacement;
        changed = true;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const nextChildren = value.map((child) => {
        if (!isExpr(child)) return child;
        const replacement = replaceEquationPlaceholder(child, side);
        if (replacement) {
          changed = true;
          return replacement;
        }
        return child;
      });
      if (changed) (nextExpr as Record<string, unknown>)[key] = nextChildren;
    }
  }

  return changed ? nextExpr : null;
}

function childExprs(expr: Expr): Expr[] {
  const children: Expr[] = [];
  for (const [key, value] of Object.entries(expr) as Array<[keyof Expr, unknown]>) {
    if (key === "kind" || key === "error") continue;
    if (isExpr(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      children.push(...value.filter(isExpr));
    }
  }
  return children;
}

function isExpr(value: unknown): value is Expr {
  return typeof value === "object" && value !== null && "kind" in value;
}
