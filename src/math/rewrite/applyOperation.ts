import { displayGroup, equation, inequality, type Expr } from "../ast";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";
import { isNegativeExpr } from "./algebraUtils";
import type { TermSelection } from "../../selection/types";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

const EQUATION_PLACEHOLDER = "eqn";
const FRACTION_PART_PLACEHOLDER = "part";

export type ApplyOperationTargetKind = "relation" | "fraction";

export function operationPlaceholderForTarget(targetKind: ApplyOperationTargetKind): string {
  return targetKind === "relation" ? EQUATION_PLACEHOLDER : FRACTION_PART_PLACEHOLDER;
}

export function canApplyOperationToRelation(expr: Expr): boolean {
  return expr.kind === "equation" || expr.kind === "inequality";
}

export function canApplyOperationToFraction(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): boolean {
  return resolveSelectedFraction(document, selection) !== null;
}

export function validateOperationTemplate(
  template: Expr,
  placeholder = EQUATION_PLACEHOLDER,
): string | null {
  if (containsRelation(template)) return "Enter an operation expression, not an equation or inequality.";

  const placeholderCount = countPlaceholders(template, placeholder);
  if (placeholderCount === 0) {
    return `Include \\${placeholder} where the current ${placeholder === EQUATION_PLACEHOLDER ? "side" : "part"} should go.`;
  }
  if (placeholderCount > 1) return `Use exactly one \\${placeholder} placeholder.`;

  return null;
}

export function applyOperationToRelation(relation: Expr, template: Expr): Expr | null {
  if (!canApplyOperationToRelation(relation)) return null;
  if (validateOperationTemplate(template, EQUATION_PLACEHOLDER)) return null;

  if (relation.kind === "equation") {
    return equation(relation.sides.map((side) => applyOperationToPart(template, side, EQUATION_PLACEHOLDER)));
  }

  if (relation.kind === "inequality") {
    return inequality(
      applyOperationToPart(template, relation.lhs, EQUATION_PLACEHOLDER),
      relation.operator,
      applyOperationToPart(template, relation.rhs, EQUATION_PLACEHOLDER),
    );
  }

  return null;
}

export function applyOperationToFraction(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  template: Expr,
): Expr | null {
  if (validateOperationTemplate(template, FRACTION_PART_PLACEHOLDER)) return null;

  const target = resolveSelectedFraction(document, selection);
  if (!target) return null;

  const nextFraction = cloneExpr(target.expr) as typeof target.expr;
  nextFraction.numerator = applyOperationToPart(
    template,
    target.expr.numerator,
    FRACTION_PART_PLACEHOLDER,
  );
  nextFraction.denominator = applyOperationToPart(
    template,
    target.expr.denominator,
    FRACTION_PART_PLACEHOLDER,
  );
  return replaceCompiledNode(document, target.nodeId, nextFraction);
}

function resolveSelectedFraction(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): { nodeId: string; expr: Extract<Expr, { kind: "divide" }> } | null {
  if (!selection || selection.kind !== "single") return null;
  const expr = document.index.nodeById[selection.nodeId];
  if (expr?.kind !== "divide") return null;
  return { nodeId: selection.nodeId, expr };
}

function applyOperationToPart(template: Expr, part: Expr, placeholder: string): Expr {
  return replacePlaceholder(template, part, placeholder) ?? cloneExpr(template);
}

function isPlaceholder(expr: Expr, placeholder: string): boolean {
  return expr.kind === "symbol" && expr.name === placeholder;
}

function countPlaceholders(expr: Expr, placeholder: string): number {
  if (isPlaceholder(expr, placeholder)) return 1;
  return childExprs(expr).reduce((sum, child) => sum + countPlaceholders(child, placeholder), 0);
}

function containsRelation(expr: Expr): boolean {
  if (expr.kind === "equation" || expr.kind === "inequality") return true;
  return childExprs(expr).some(containsRelation);
}

function replacePlaceholder(expr: Expr, part: Expr, placeholder: string): Expr | null {
  if (isPlaceholder(expr, placeholder)) return cloneExpr(part);

  const nextExpr = cloneExpr(expr);
  let changed = false;

  for (const [key, value] of Object.entries(nextExpr) as Array<[keyof Expr, unknown]>) {
    if (key === "kind" || key === "error") continue;

    if (isExpr(value)) {
      const replacement = replacePlaceholder(value, part, placeholder);
      if (replacement) {
        (nextExpr as Record<string, unknown>)[key] = shouldWrapReplacementInField(expr, key, value, replacement)
          ? displayGroup("paren", replacement)
          : replacement;
        changed = true;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const nextChildren = value.map((child) => {
        if (!isExpr(child)) return child;
        const replacement = replacePlaceholder(child, part, placeholder);
        if (replacement) {
          changed = true;
          return shouldWrapReplacementInArray(expr, key, child, replacement)
            ? displayGroup("paren", replacement)
            : replacement;
        }
        return child;
      });
      if (changed) (nextExpr as Record<string, unknown>)[key] = nextChildren;
    }
  }

  return changed ? nextExpr : null;
}

function shouldWrapReplacementInField(
  parent: Expr,
  key: string,
  originalChild: Expr,
  replacement: Expr,
): boolean {
  if (
    (parent.kind !== "full_derivative_operator" && parent.kind !== "partial_derivative_operator") ||
    key !== "operand"
  ) {
    return false;
  }
  if (!isPlaceholder(originalChild, EQUATION_PLACEHOLDER) && !isPlaceholder(originalChild, FRACTION_PART_PLACEHOLDER)) {
    return false;
  }
  return replacement.kind === "add" || replacement.kind === "multiply" || isNegativeExpr(replacement);
}

function shouldWrapReplacementInArray(
  parent: Expr,
  key: string,
  originalChild: Expr,
  replacement: Expr,
): boolean {
  if (parent.kind !== "multiply" || key !== "factors") return false;
  if (!isPlaceholder(originalChild, EQUATION_PLACEHOLDER) && !isPlaceholder(originalChild, FRACTION_PART_PLACEHOLDER)) {
    return false;
  }
  return replacement.kind === "add" || replacement.kind === "number" || isNegativeExpr(replacement);
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
