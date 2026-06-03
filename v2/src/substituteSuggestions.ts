import { exprToLatex } from "./math/adapters/latex";
import type { CompiledMathDocument } from "./math/compile/compileMathDocument";
import type { Expr } from "./math/ast";
import { flipSign, splitSign, structuralKeyIgnoringDisplayGroups } from "./math/rewrite/algebraUtils";
import type { SubstitutionSelection } from "./math/rewrite/substitute";

export type PadDefinitionSource = {
  equationId: string;
  label: string;
  compiledDoc: CompiledMathDocument;
};

export type PadSubstituteSuggestion = {
  equationId: string;
  label: string;
  rhsLatex: string;
  rhsExpr: Expr;
};

function expressionsMatch(left: Expr, right: Expr): boolean {
  return structuralKeyIgnoringDisplayGroups(left) === structuralKeyIgnoringDisplayGroups(right);
}

function matchDefinitionRhs(lhs: Expr, rhs: Expr, selected: Expr): Expr | null {
  if (expressionsMatch(lhs, selected)) return rhs;
  const selectedSign = splitSign(selected);
  if (selectedSign.sign === -1 && expressionsMatch(lhs, selectedSign.value)) {
    return flipSign(rhs);
  }
  const lhsSign = splitSign(lhs);
  if (lhsSign.sign === -1 && expressionsMatch(lhsSign.value, selected)) {
    return flipSign(rhs);
  }
  return null;
}

export function buildPadSubstituteSuggestions(
  selection: SubstitutionSelection | null,
  sources: PadDefinitionSource[],
): PadSubstituteSuggestion[] {
  if (!selection) return [];

  const suggestions: PadSubstituteSuggestion[] = [];
  for (const source of sources) {
    const expr = source.compiledDoc.expr;
    if (expr.kind !== "equation" || expr.sides.length < 2) continue;

    const lhs = expr.sides[0];
    const rhs = expr.sides[1];
    const rhsExpr = matchDefinitionRhs(lhs, rhs, selection.expr);
    if (!rhsExpr) continue;

    suggestions.push({
      equationId: source.equationId,
      label: source.label,
      rhsExpr,
      rhsLatex: exprToLatex(rhsExpr, false),
    });
  }

  return suggestions;
}
