import { add, displayGroup, multiply, negate, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";

type ToggleNegateTarget = {
  nodeId: string;
  replacement: Expr;
};

export function canToggleNegateSelection(document: CompiledMathDocument, nodeId: string): boolean {
  return resolveToggleNegateTarget(document, nodeId) !== null;
}

export function toggleNegateSelection(document: CompiledMathDocument, nodeId: string): Expr | null {
  const target = resolveToggleNegateTarget(document, nodeId);
  if (!target) return null;
  return replaceCompiledNode(document, target.nodeId, target.replacement);
}

function resolveToggleNegateTarget(document: CompiledMathDocument, nodeId: string): ToggleNegateTarget | null {
  const selected = document.index.nodeById[nodeId];
  if (!selected) return null;

  if (selected.kind === "negate") {
    const innerGroup = selected.value;
    if (innerGroup.kind !== "display_group" || innerGroup.expression.kind !== "add") return null;
    return {
      nodeId,
      replacement: displayGroup(innerGroup.delimiter, flipAdditiveSigns(innerGroup.expression)),
    };
  }

  if (selected.kind !== "display_group" || selected.expression.kind !== "add") return null;

  const parentId = document.index.parentById[nodeId];
  const parent = parentId ? document.index.nodeById[parentId] : null;
  const location = document.index.locationById[nodeId];
  const flippedGroup = displayGroup(selected.delimiter, flipAdditiveSigns(selected.expression));

  if (parentId && parent?.kind === "multiply" && location?.field === "factors" && location.index != null) {
    const grandparentId = document.index.parentById[parentId];
    const grandparent = grandparentId ? document.index.nodeById[grandparentId] : null;
    if (grandparent?.kind === "negate") {
      return {
        nodeId: grandparentId,
        replacement: multiply(parent.factors.map((factor, index) => (index === location.index ? flippedGroup : cloneExpr(factor)))),
      };
    }
    if (grandparent?.kind === "add") {
      const flippedProduct = multiply(
        parent.factors.map((factor, index) => (index === location.index ? flippedGroup : cloneExpr(factor))),
      );
      return {
        nodeId: parentId,
        replacement: negate(flippedProduct, "subtraction"),
      };
    }
  }

  if (parentId && parent?.kind === "negate" && location?.field === "value") {
    return {
      nodeId: parentId,
      replacement: flippedGroup,
    };
  }

  return {
    nodeId,
    replacement: negate(flippedGroup),
  };
}

function flipAdditiveSigns(expr: Extract<Expr, { kind: "add" }>): Expr {
  return add(expr.terms.map(flipTermSign));
}

function flipTermSign(term: Expr): Expr {
  if (term.kind === "negate") return cloneExpr(term.value);
  return negate(cloneExpr(term), "subtraction");
}
