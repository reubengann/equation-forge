import { sym, type Expr } from "../ast";
import { exprToLatex } from "../adapters/latex";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import type { TermSelection } from "../../selection/types";
import { cloneExpr } from "../ast/utils";
import { applySign, collapseProduct, splitSign, structuralKeyIgnoringDisplayGroups, withSign } from "./algebraUtils";
import {
  getSelectionRewriteTarget,
  replaceSelectionWithExpr,
} from "./selectionRewrite";

export type SubstitutionSelection = {
  expr: Expr;
  suggestionExpr?: Expr;
  latex: string;
};

export type ReplaceableSymbol = {
  key: string;
  expr: Expr;
  latex: string;
};

export type SimultaneousSubstitution = {
  target: Expr;
  replacement: Expr;
};

type SymbolNameReplacement = {
  targetName: string;
  replacementName: string;
};

type ReplacementPlan = {
  replacementByKey: Map<string, Expr>;
  symbolNameReplacements: SymbolNameReplacement[];
};

export function isValidSubstitutionReplacement(expr: Expr): boolean {
  return expr.kind !== "equation" && expr.kind !== "inequality";
}

export function canSubstituteSelection(document: CompiledMathDocument, selection: TermSelection | null): boolean {
  return getSubstitutionSelection(document, selection) !== null;
}

export function getSubstitutionSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): SubstitutionSelection | null {
  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return null;
  const unsigned = splitSign(target.expr).value;
  const suggestionExpr =
    selection?.kind === "single" && shouldApplySelectedSign(document, selection.nodeId)
      ? unsigned
      : target.expr;
  return { expr: unsigned, suggestionExpr, latex: exprToLatex(unsigned, false) };
}

export function substituteSelection(
  document: CompiledMathDocument,
  selection: TermSelection,
  replacement: Expr,
): Expr | null {
  if (!isValidSubstitutionReplacement(replacement)) return null;
  const next = replaceSelectionWithExpr(document, selection, contextualReplacement(document, selection, replacement));
  return next ? normalizeSubstitutionSigns(next) : null;
}

function contextualReplacement(
  document: CompiledMathDocument,
  selection: TermSelection,
  replacement: Expr,
): Expr {
  if (selection.kind !== "single") return replacement;
  const selected = document.index.nodeById[selection.nodeId];
  if (!selected) return replacement;
  if (!shouldApplySelectedSign(document, selection.nodeId)) return replacement;
  return applySign(splitSign(selected).sign, normalizeReplacementProductSign(replacement));
}

function normalizeReplacementProductSign(replacement: Expr): Expr {
  return replacement.kind === "multiply" ? collapseProduct(replacement.factors) : replacement;
}

function shouldApplySelectedSign(document: CompiledMathDocument, nodeId: string): boolean {
  const selected = document.index.nodeById[nodeId];
  if (!selected || splitSign(selected).sign === 1) return false;

  const location = document.index.locationById[nodeId];
  if (!location?.parentId || location.field !== "terms") return false;

  const parent = document.index.nodeById[location.parentId];
  return parent?.kind === "add";
}

export function substituteAllMatchingSelection(
  document: CompiledMathDocument,
  selection: TermSelection,
  replacement: Expr,
): Expr | null {
  if (!isValidSubstitutionReplacement(replacement)) return null;
  const target = getSubstitutionSelection(document, selection);
  if (!target) return null;

  return substituteAllMatchingExpression(document, target.expr, replacement);
}

export function substituteAllMatchingExpression(
  document: CompiledMathDocument,
  target: Expr,
  replacement: Expr,
): Expr | null {
  return substituteAllMatchingExpressions(document, [{ target, replacement }]);
}

export function substituteAllMatchingExpressions(
  document: CompiledMathDocument,
  substitutions: SimultaneousSubstitution[],
): Expr | null {
  const plan = buildReplacementPlan(substitutions);
  if (!plan) return null;

  const { expr, changed } = substituteAllMatchingExpr(document.expr, plan);
  return changed ? expr : null;
}

export function getReplaceableSymbols(document: CompiledMathDocument): ReplaceableSymbol[] {
  const symbolsByKey = new Map<string, ReplaceableSymbol>();
  const addSymbol = (expr: Expr) => {
    if (!isValidSubstitutionReplacement(expr) || !isReplaceableSymbolExpr(expr)) return;
    const canonical = splitSign(expr).value;
    const key = structuralKeyIgnoringDisplayGroups(canonical);
    if (symbolsByKey.has(key)) return;
    const cloned = cloneExpr(canonical);
    symbolsByKey.set(key, {
      key,
      expr: cloned,
      latex: exprToLatex(cloned, false),
    });
  };

  walkExpr(document.expr, (expr) => {
    if (expr.kind === "user_function") addSymbol(sym(expr.name));
    if (isReplaceableSymbolExpr(expr)) addSymbol(expr);
  });

  return [...symbolsByKey.values()].sort((left, right) => left.latex.localeCompare(right.latex));
}

function substituteAllMatchingExpr(
  expr: Expr,
  plan: ReplacementPlan,
): { expr: Expr; changed: boolean } {
  const directReplacement = plan.replacementByKey.get(structuralKeyIgnoringDisplayGroups(expr));
  if (directReplacement) {
    return { expr: cloneExpr(directReplacement), changed: true };
  }
  const signed = splitSign(expr);
  if (signed.sign === -1) {
    const unsignedReplacement = plan.replacementByKey.get(structuralKeyIgnoringDisplayGroups(signed.value));
    if (unsignedReplacement) {
      return {
        expr: applySign(signed.sign, normalizeReplacementProductSign(unsignedReplacement)),
        changed: true,
      };
    }
  }

  const next = cloneExpr(expr);
  let changed = false;
  const replaceChild = (child: Expr): Expr => {
    const result = substituteAllMatchingExpr(child, plan);
    changed ||= result.changed;
    return result.expr;
  };
  const replaceOptionalChild = (child: Expr | null): Expr | null => (child ? replaceChild(child) : null);

  switch (next.kind) {
    case "symbol": {
      const renamed = replaceSymbolicSubscriptFromPlan(next.name, plan.symbolNameReplacements);
      return renamed ? { expr: { ...next, name: renamed }, changed: true } : { expr: next, changed: false };
    }
    case "number":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return { expr: next, changed: false };
    case "add":
      next.terms = next.terms.map(replaceChild);
      break;
    case "multiply":
      next.factors = next.factors.map(replaceChild);
      break;
    case "power":
      next.base = replaceChild(next.base);
      next.exponent = replaceChild(next.exponent);
      break;
    case "negate":
      next.value = replaceChild(next.value);
      break;
    case "divide":
      next.numerator = replaceChild(next.numerator);
      next.denominator = replaceChild(next.denominator);
      break;
    case "root":
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      next.value = replaceChild(next.value);
      break;
    case "equation":
      next.sides = next.sides.map(replaceChild);
      break;
    case "inequality":
      next.lhs = replaceChild(next.lhs);
      next.rhs = replaceChild(next.rhs);
      break;
    case "call":
      next.callee = replaceChild(next.callee);
      next.args = next.args.map(replaceChild);
      break;
    case "user_function": {
      const renamed = replaceSymbolFromPlan(next.name, plan.symbolNameReplacements);
      if (renamed) {
        next.name = renamed;
        changed = true;
      }
      next.argument = replaceChild(next.argument);
      break;
    }
    case "inner_product":
    case "outer_product":
      next.factors = next.factors.map(replaceChild);
      break;
    case "big_sum":
      next.summand = replaceChild(next.summand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      break;
    case "big_prod":
      next.muliplicand = replaceChild(next.muliplicand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      break;
    case "limit":
      next.expression = replaceChild(next.expression);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      break;
    case "integral":
      next.integrand = replaceChild(next.integrand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      break;
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      next.integrand = replaceChild(next.integrand);
      break;
    case "differential":
      next.variable = replaceChild(next.variable);
      break;
    case "partial_derivative":
      next.quantity = replaceChild(next.quantity);
      next.variable = replaceChild(next.variable);
      break;
    case "full_derivative_operator":
    case "partial_derivative_operator":
      next.variable = replaceChild(next.variable);
      next.operand = replaceChild(next.operand);
      break;
    case "display_group":
      next.expression = replaceChild(next.expression);
      break;
    case "second_order_partial_derivative":
      next.dependentVariable = replaceChild(next.dependentVariable);
      next.independentVariables = next.independentVariables.map(replaceChild);
      break;
    case "partial_at_const_quantity":
      next.quantity = replaceChild(next.quantity);
      next.variable = replaceChild(next.variable);
      next.constantQuantity = replaceChild(next.constantQuantity);
      break;
  }

  return { expr: normalizeSubstitutionSigns(next), changed };
}

function normalizeSubstitutionSigns(expr: Expr): Expr {
  const next = cloneExpr(expr);
  const replaceChild = normalizeSubstitutionSigns;
  const replaceOptionalChild = (child: Expr | null): Expr | null => (child ? replaceChild(child) : null);

  switch (next.kind) {
    case "number":
    case "symbol":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return next;
    case "add":
      next.terms = next.terms.map(replaceChild);
      return next;
    case "multiply":
      next.factors = next.factors.map(replaceChild);
      return next;
    case "power":
      next.base = replaceChild(next.base);
      next.exponent = replaceChild(next.exponent);
      return next;
    case "negate":
      next.value = replaceChild(next.value);
      return next;
    case "divide":
      next.numerator = replaceChild(next.numerator);
      next.denominator = replaceChild(next.denominator);
      return next;
    case "root":
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      next.value = replaceChild(next.value);
      return next;
    case "equation":
      next.sides = next.sides.map(replaceChild);
      return next;
    case "inequality":
      next.lhs = replaceChild(next.lhs);
      next.rhs = replaceChild(next.rhs);
      return next;
    case "call":
      next.callee = replaceChild(next.callee);
      next.args = next.args.map(replaceChild);
      return next;
    case "user_function":
      next.argument = replaceChild(next.argument);
      return next;
    case "inner_product":
    case "outer_product":
      next.factors = next.factors.map(replaceChild);
      return next;
    case "big_sum":
      next.summand = replaceChild(next.summand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      return next;
    case "big_prod":
      next.muliplicand = replaceChild(next.muliplicand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      return next;
    case "limit":
      next.expression = replaceChild(next.expression);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      return next;
    case "integral":
      next.integrand = replaceChild(next.integrand);
      next.lowerBound = replaceOptionalChild(next.lowerBound);
      next.upperBound = replaceOptionalChild(next.upperBound);
      return next;
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      next.integrand = replaceChild(next.integrand);
      return next;
    case "differential":
      next.variable = replaceChild(next.variable);
      return promoteChildSign(next, "variable");
    case "partial_derivative":
      next.quantity = replaceChild(next.quantity);
      next.variable = replaceChild(next.variable);
      return promoteChildSign(next, "quantity");
    case "full_derivative_operator":
    case "partial_derivative_operator":
      next.variable = replaceChild(next.variable);
      next.operand = replaceChild(next.operand);
      return promoteChildSign(next, "operand");
    case "display_group":
      next.expression = replaceChild(next.expression);
      return next;
    case "second_order_partial_derivative":
      next.dependentVariable = replaceChild(next.dependentVariable);
      next.independentVariables = next.independentVariables.map(replaceChild);
      return promoteChildSign(next, "dependentVariable");
    case "partial_at_const_quantity":
      next.quantity = replaceChild(next.quantity);
      next.variable = replaceChild(next.variable);
      next.constantQuantity = replaceChild(next.constantQuantity);
      return promoteChildSign(next, "quantity");
  }
}

function promoteChildSign<T extends Expr, K extends keyof T>(expr: T, key: K): Expr {
  const child = expr[key];
  if (!isExpr(child)) return expr;
  const signedChild = splitSign(child);
  if (signedChild.sign === 1) return expr;

  const signedExpr = splitSign(expr);
  return withSign(
    {
      ...signedExpr.value,
      [key]: signedChild.value,
    } as Expr,
    signedExpr.sign === signedChild.sign ? 1 : -1,
  );
}

function isExpr(value: unknown): value is Expr {
  return typeof value === "object" && value !== null && "kind" in value;
}

function buildReplacementPlan(substitutions: SimultaneousSubstitution[]): ReplacementPlan | null {
  const replacementByKey = new Map<string, Expr>();
  const symbolNameReplacements: SymbolNameReplacement[] = [];

  for (const substitution of substitutions) {
    if (
      !isValidSubstitutionReplacement(substitution.target) ||
      !isValidSubstitutionReplacement(substitution.replacement)
    ) {
      return null;
    }

    replacementByKey.set(structuralKeyIgnoringDisplayGroups(substitution.target), cloneExpr(substitution.replacement));
    if (substitution.target.kind === "symbol" && substitution.replacement.kind === "symbol") {
      symbolNameReplacements.push({
        targetName: substitution.target.name,
        replacementName: substitution.replacement.name,
      });
    }
  }

  return replacementByKey.size > 0 || symbolNameReplacements.length > 0
    ? { replacementByKey, symbolNameReplacements }
    : null;
}

function isReplaceableSymbolExpr(expr: Expr): boolean {
  return (
    (expr.kind === "symbol" && isReplaceableSymbolName(expr.name)) ||
    (expr.kind === "special_font" &&
      expr.value.kind === "symbol" &&
      isReplaceableSymbolName(expr.value.name))
  );
}

function isReplaceableSymbolName(name: string): boolean {
  return /[A-Za-z\\]/.test(name);
}

function walkExpr(expr: Expr, visit: (expr: Expr) => void): void {
  visit(expr);
  if (isReplaceableSymbolExpr(expr) && expr.kind !== "symbol") return;

  switch (expr.kind) {
    case "number":
    case "symbol":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return;
    case "add":
      expr.terms.forEach((term) => walkExpr(term, visit));
      return;
    case "multiply":
      expr.factors.forEach((factor) => walkExpr(factor, visit));
      return;
    case "power":
      walkExpr(expr.base, visit);
      walkExpr(expr.exponent, visit);
      return;
    case "negate":
      walkExpr(expr.value, visit);
      return;
    case "divide":
      walkExpr(expr.numerator, visit);
      walkExpr(expr.denominator, visit);
      return;
    case "root":
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      walkExpr(expr.value, visit);
      return;
    case "equation":
      expr.sides.forEach((side) => walkExpr(side, visit));
      return;
    case "inequality":
      walkExpr(expr.lhs, visit);
      walkExpr(expr.rhs, visit);
      return;
    case "call":
      expr.args.forEach((arg) => walkExpr(arg, visit));
      return;
    case "user_function":
      walkExpr(expr.argument, visit);
      return;
    case "inner_product":
    case "outer_product":
      expr.factors.forEach((factor) => walkExpr(factor, visit));
      return;
    case "big_sum":
      walkExpr(expr.summand, visit);
      if (expr.lowerBound) walkExpr(expr.lowerBound, visit);
      if (expr.upperBound) walkExpr(expr.upperBound, visit);
      return;
    case "big_prod":
      walkExpr(expr.muliplicand, visit);
      if (expr.lowerBound) walkExpr(expr.lowerBound, visit);
      if (expr.upperBound) walkExpr(expr.upperBound, visit);
      return;
    case "limit":
      walkExpr(expr.expression, visit);
      if (expr.lowerBound) walkExpr(expr.lowerBound, visit);
      return;
    case "integral":
      walkExpr(expr.integrand, visit);
      if (expr.lowerBound) walkExpr(expr.lowerBound, visit);
      if (expr.upperBound) walkExpr(expr.upperBound, visit);
      return;
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      walkExpr(expr.integrand, visit);
      return;
    case "differential":
      walkExpr(expr.variable, visit);
      return;
    case "partial_derivative":
      walkExpr(expr.quantity, visit);
      walkExpr(expr.variable, visit);
      return;
    case "full_derivative_operator":
    case "partial_derivative_operator":
      walkExpr(expr.variable, visit);
      walkExpr(expr.operand, visit);
      return;
    case "display_group":
      walkExpr(expr.expression, visit);
      return;
    case "second_order_partial_derivative":
      walkExpr(expr.dependentVariable, visit);
      expr.independentVariables.forEach((variable) => walkExpr(variable, visit));
      return;
    case "partial_at_const_quantity":
      walkExpr(expr.quantity, visit);
      walkExpr(expr.variable, visit);
      walkExpr(expr.constantQuantity, visit);
      return;
  }
}

function replaceSymbolicSubscript(name: string, targetName: string, replacementName: string): string | null {
  const separatorIndex = name.lastIndexOf("_");
  if (separatorIndex <= 0) return null;

  const baseName = name.slice(0, separatorIndex);
  const subscriptName = name.slice(separatorIndex + 1);
  if (!baseName || subscriptName !== targetName) return null;

  return `${baseName}_${replacementName}`;
}

function replaceSymbolicSubscriptFromPlan(name: string, replacements: SymbolNameReplacement[]): string | null {
  for (const replacement of replacements) {
    const renamed = replaceSymbolicSubscript(name, replacement.targetName, replacement.replacementName);
    if (renamed) return renamed;
  }
  return null;
}

function replaceSymbolFromPlan(name: string, replacements: SymbolNameReplacement[]): string | null {
  for (const replacement of replacements) {
    if (name === replacement.targetName) return replacement.replacementName;
  }
  return null;
}

