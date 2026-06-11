import { add, displayGroup, multiply, power, type Expr } from "../ast";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { cloneExpr, replaceCompiledNode } from "../ast/utils";
import { flipSign, splitSign } from "./algebraUtils";

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

  if (selected.kind === "power") {
    const replacement = toggleNegatedPowerBase(selected);
    if (replacement) return { nodeId, replacement };
  }

  const selectedLocation = document.index.locationById[nodeId];
  const selectedParent = selectedLocation?.parentId ? document.index.nodeById[selectedLocation.parentId] : null;
  const selectedParentLocation = selectedLocation?.parentId ? document.index.locationById[selectedLocation.parentId] : null;
  const selectedGrandparent = selectedParentLocation?.parentId ? document.index.nodeById[selectedParentLocation.parentId] : null;
  const selectedGrandparentLocation = selectedParentLocation?.parentId
    ? document.index.locationById[selectedParentLocation.parentId]
    : null;
  const selectedGreatGrandparent = selectedGrandparentLocation?.parentId
    ? document.index.nodeById[selectedGrandparentLocation.parentId]
    : null;
  if (
    selectedParent?.kind === "add" &&
    selectedParentLocation?.field === "expression" &&
    selectedGrandparent?.kind === "display_group" &&
    selectedGrandparentLocation?.field === "factors" &&
    selectedGrandparentLocation.index != null &&
    selectedGreatGrandparent?.kind === "multiply"
  ) {
    const flippedGroup = displayGroup(selectedGrandparent.delimiter, flipAdditiveSigns(selectedParent));
    return {
      nodeId: selectedGrandparentLocation.parentId!,
      replacement: flipSign(
        multiply(
          selectedGreatGrandparent.factors.map((factor, index) =>
            index === selectedGrandparentLocation.index ? flippedGroup : cloneExpr(factor),
          ),
        ),
      ),
    };
  }

  const signedSelected = splitSign(selected);
  if (signedSelected.value.kind !== "display_group" || signedSelected.value.expression.kind !== "add") return null;
  if (signedSelected.sign === -1) {
    return {
      nodeId,
      replacement: displayGroup(signedSelected.value.delimiter, flipAdditiveSigns(signedSelected.value.expression)),
    };
  }

  const parentId = document.index.parentById[nodeId];
  const parent = parentId ? document.index.nodeById[parentId] : null;
  const location = document.index.locationById[nodeId];
  const flippedGroup = displayGroup(signedSelected.value.delimiter, flipAdditiveSigns(signedSelected.value.expression));

  if (parentId && parent?.kind === "power" && location?.field === "base") {
    const exponentParity = positiveIntegerParity(parent.exponent);
    if (exponentParity === "even") {
      return {
        nodeId,
        replacement: flippedGroup,
      };
    }
    if (exponentParity === "odd") {
      return {
        nodeId: parentId,
        replacement: flipSign(power(flippedGroup, cloneExpr(parent.exponent))),
      };
    }
  }

  if (parentId && parent?.kind === "multiply" && location?.field === "factors" && location.index != null) {
    const grandparentId = document.index.parentById[parentId];
    const grandparent = grandparentId ? document.index.nodeById[grandparentId] : null;
    if (parent.sign === -1) {
      return {
        nodeId: parentId,
        replacement: multiply(
          parent.factors.map((factor, index) => (index === location.index ? flippedGroup : cloneExpr(factor))),
        ),
      };
    }
    if (grandparent?.kind === "add") {
      const flippedProduct = multiply(
        parent.factors.map((factor, index) => (index === location.index ? flippedGroup : cloneExpr(factor))),
      );
      return {
        nodeId: parentId,
        replacement: flipSign(flippedProduct),
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
    replacement: flipSign(flippedGroup),
  };
}

function flipAdditiveSigns(expr: Extract<Expr, { kind: "add" }>): Expr {
  return add(expr.terms.map(flipTermSign));
}

function flipTermSign(term: Expr): Expr {
  return flipSign(term);
}

function toggleNegatedPowerBase(expr: Extract<Expr, { kind: "power" }>): Expr | null {
  const exponentParity = positiveIntegerParity(expr.exponent);
  if (!exponentParity) return null;

  const signedBase = splitSign(expr.base);
  if (signedBase.value.kind !== "display_group" || signedBase.value.expression.kind !== "add") return null;

  const flippedPower = power(
    displayGroup(signedBase.value.delimiter, flipAdditiveSigns(signedBase.value.expression)),
    cloneExpr(expr.exponent),
  );
  return exponentParity === "even" ? flippedPower : flipSign(flippedPower);
}

function positiveIntegerParity(expr: Expr): "even" | "odd" | null {
  if (expr.kind !== "number") return null;
  const value = Number(expr.value);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value % 2 === 0 ? "even" : "odd";
}
