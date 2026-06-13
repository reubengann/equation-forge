import type { FunctionSymbolTag } from "../../EquationRowState";
import { exprToLatex } from "../adapters/latex";
import type { Expr } from "../ast";
import { multiply, power, userFunction } from "../ast";
import { cloneExpr } from "../ast/utils";
import type { CompiledMathDocument } from "./compileMathDocument";

export function getFunctionSymbolCandidate(
  document: CompiledMathDocument,
  nodeId: string | null,
): FunctionSymbolTag | null {
  if (!nodeId) return null;
  const expr = document.index.nodeById[nodeId];
  if (expr?.kind === "user_function") {
    return { nodeId, name: expr.name };
  }
  const location = document.index.locationById[nodeId];
  if (!expr || !location?.parentId || location.index == null) return null;
  const name = functionSymbolName(expr);
  if (!name) return null;

  const parent = document.index.nodeById[location.parentId];
  if (!parent || parent.kind !== "multiply") return null;
  const nextFactor = parent.factors[location.index + 1];
  if (!isParenthesizedFunctionArgument(nextFactor)) return null;

  return { nodeId, name };
}

export function canToggleFunctionSymbol(document: CompiledMathDocument, nodeId: string | null): boolean {
  return getFunctionSymbolCandidate(document, nodeId) !== null;
}

export function isFunctionSymbolTagged(functionSymbols: FunctionSymbolTag[], nodeId: string | null): boolean {
  return !!nodeId && functionSymbols.some((tag) => tag.nodeId === nodeId);
}

export function isFunctionSymbolSelectionTagged(
  document: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
  nodeId: string | null,
): boolean {
  if (!nodeId) return false;
  const expr = document.index.nodeById[nodeId];
  if (expr?.kind === "user_function") return functionSymbols.some((tag) => tag.name === expr.name);
  const candidate = getFunctionSymbolCandidate(document, nodeId);
  if (candidate) return functionSymbols.some((tag) => tag.name === candidate.name);
  return isFunctionSymbolTagged(functionSymbols, nodeId);
}

export function toggleFunctionSymbol(
  document: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
  nodeId: string,
): FunctionSymbolTag[] {
  const selectedExpr = document.index.nodeById[nodeId];
  if (selectedExpr?.kind === "user_function") {
    return functionSymbols.filter((tag) => tag.name !== selectedExpr.name);
  }
  const candidate = getFunctionSymbolCandidate(document, nodeId);
  if (!candidate) return functionSymbols;
  if (functionSymbols.some((tag) => tag.name === candidate.name)) {
    return functionSymbols.filter((tag) => tag.name !== candidate.name);
  }
  return pruneFunctionSymbols(document, [...functionSymbols, candidate]);
}

export function pruneFunctionSymbols(
  document: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
): FunctionSymbolTag[] {
  const seen = new Set<string>();
  const pruned: FunctionSymbolTag[] = [];
  for (const tag of functionSymbols) {
    if (seen.has(tag.name)) continue;
    const candidate = getFunctionSymbolCandidate(document, tag.nodeId);
    if (!candidate || candidate.name !== tag.name) continue;
    seen.add(tag.name);
    pruned.push(candidate);
  }
  return pruned;
}

export function remapFunctionSymbols(
  previousDocument: CompiledMathDocument,
  nextDocument: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
): FunctionSymbolTag[] {
  const nextCandidatesByName = new Map<string, FunctionSymbolTag[]>();
  for (const [nodeId, expr] of Object.entries(nextDocument.index.nodeById)) {
    if (!functionSymbolName(expr)) continue;
    const candidate = getFunctionSymbolCandidate(nextDocument, nodeId);
    if (!candidate) continue;
    nextCandidatesByName.set(candidate.name, [...(nextCandidatesByName.get(candidate.name) ?? []), candidate]);
  }

  const usedNodeIds = new Set<string>();
  const remapped: FunctionSymbolTag[] = [];
  for (const tag of pruneFunctionSymbols(previousDocument, functionSymbols)) {
    const previousSignature = functionSymbolApplicationSignature(previousDocument, tag.nodeId);
    const previousOccurrence = functionSymbolOccurrenceIndex(previousDocument, tag.nodeId);
    const candidates = nextCandidatesByName.get(tag.name) ?? [];
    const matchingCandidates = candidates.filter(
      (candidate) =>
        !usedNodeIds.has(candidate.nodeId) &&
        functionSymbolApplicationSignature(nextDocument, candidate.nodeId) === previousSignature,
    );
    const match =
      matchingCandidates.find((candidate) => functionSymbolOccurrenceIndex(nextDocument, candidate.nodeId) === previousOccurrence) ??
      matchingCandidates[0];
    if (!match) continue;
    usedNodeIds.add(match.nodeId);
    remapped.push(match);
  }
  return remapped;
}

export function functionSymbolApplicationNodeIds(
  document: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
): Set<string> {
  const nodeIds = new Set<string>();
  const tagNames = new Set(pruneFunctionSymbols(document, functionSymbols).map((tag) => tag.name));
  for (const [nodeId, expr] of Object.entries(document.index.nodeById)) {
    if (expr.kind === "user_function" && functionSymbols.some((tag) => tag.name === expr.name)) {
      nodeIds.add(nodeId);
      continue;
    }
    const candidate = getFunctionSymbolCandidate(document, nodeId);
    if (candidate && tagNames.has(candidate.name)) {
      const applicationIds = functionSymbolApplicationIds(document, nodeId);
      for (const applicationNodeId of applicationIds) nodeIds.add(applicationNodeId);
    }
  }
  return nodeIds;
}

export function applyFunctionSymbolSemantics(
  document: CompiledMathDocument,
  functionSymbols: FunctionSymbolTag[],
): Expr {
  const tagNames = new Set(pruneFunctionSymbols(document, functionSymbols).map((tag) => tag.name));
  if (tagNames.size === 0) return cloneExpr(document.expr);

  const transform = (expr: Expr, nodeId: string): Expr => {
    if (expr.kind === "multiply") {
      const nextFactors: Expr[] = [];
      const childIds = document.index.childrenById[nodeId] ?? [];
      for (let index = 0; index < expr.factors.length; index += 1) {
        const factor = expr.factors[index];
        const factorNodeId = childIds[index];
        const nextFactor = expr.factors[index + 1];
        const name = factor ? functionSymbolName(factor) : null;
        if (factor && factorNodeId && name && tagNames.has(name) && isParenthesizedFunctionArgument(nextFactor)) {
          const nextFactorNodeId = childIds[index + 1];
          const argument = functionArgumentExpression(nextFactor);
          const argumentNodeId = nextFactorArgumentNodeId(document, nextFactor, nextFactorNodeId);
          const transformedFunction = userFunction(name, transform(argument, argumentNodeId ?? ""), {
            ...(factor.sign === -1 ? { sign: -1 } : {}),
          });
          nextFactors.push(
            nextFactor.kind === "power"
              ? power(transformedFunction, transform(nextFactor.exponent, exponentNodeId(document, nextFactorNodeId) ?? ""))
              : transformedFunction,
          );
          index += 1;
          continue;
        }
        if (factor && factorNodeId) nextFactors.push(transform(factor, factorNodeId));
      }
      if (nextFactors.length === 1) {
        const [singleFactor] = nextFactors;
        return expr.sign === -1 ? { ...singleFactor, sign: -1 } : singleFactor;
      }
      return { ...expr, factors: nextFactors };
    }

    return cloneExprWithTransformedChildren(expr, document.index.childrenById[nodeId] ?? [], transform);
  };

  return transform(document.expr, document.index.rootId);
}

function functionSymbolName(expr: Expr): string | null {
  if (expr.kind === "symbol") return expr.name;
  if (expr.kind === "special_font" && expr.value.kind === "symbol") return expr.value.name;
  return null;
}

function isParenthesizedFunctionArgument(expr: Expr | undefined): expr is Expr {
  if (!expr) return false;
  if (expr.kind === "display_group") return expr.delimiter === "paren";
  return expr.kind === "power" && expr.base.kind === "display_group" && expr.base.delimiter === "paren";
}

function functionArgumentExpression(expr: Expr): Expr {
  return expr.kind === "power" && expr.base.kind === "display_group"
    ? expr.base.expression
    : (expr as Extract<Expr, { kind: "display_group" }>).expression;
}

function nextFactorArgumentNodeId(
  document: CompiledMathDocument,
  nextFactor: Expr,
  nextFactorNodeId: string | undefined,
): string | null {
  if (!nextFactorNodeId) return null;
  if (nextFactor.kind === "display_group") return document.index.childrenById[nextFactorNodeId]?.[0] ?? null;
  if (nextFactor.kind !== "power") return null;
  const [baseNodeId] = document.index.childrenById[nextFactorNodeId] ?? [];
  return baseNodeId ? (document.index.childrenById[baseNodeId]?.[0] ?? null) : null;
}

function exponentNodeId(document: CompiledMathDocument, powerNodeId: string | undefined): string | null {
  if (!powerNodeId) return null;
  return document.index.childrenById[powerNodeId]?.[1] ?? null;
}

function functionSymbolApplicationIds(document: CompiledMathDocument, nodeId: string): string[] {
  if (document.index.nodeById[nodeId]?.kind === "user_function") return [nodeId];
  const location = document.index.locationById[nodeId];
  if (!location?.parentId || location.index == null) return [nodeId];
  const parentChildren = document.index.childrenById[location.parentId] ?? [];
  const groupNodeId = parentChildren[location.index + 1];
  if (!groupNodeId) return [nodeId];
  return [nodeId, groupNodeId, ...descendantNodeIds(document, groupNodeId)];
}

function descendantNodeIds(document: CompiledMathDocument, nodeId: string): string[] {
  const children = document.index.childrenById[nodeId] ?? [];
  return children.flatMap((childId) => [childId, ...descendantNodeIds(document, childId)]);
}

function functionSymbolApplicationSignature(document: CompiledMathDocument, nodeId: string): string | null {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId || location.index == null) return null;
  const parent = document.index.nodeById[location.parentId];
  if (!parent || parent.kind !== "multiply") return null;
  const symbol = parent.factors[location.index];
  const group = parent.factors[location.index + 1];
  if (!symbol || !isParenthesizedFunctionArgument(group)) return null;
  return exprToLatex(multiply([cloneExpr(symbol), cloneExpr(group)]), false);
}

function functionSymbolOccurrenceIndex(document: CompiledMathDocument, nodeId: string): number | null {
  const candidate = getFunctionSymbolCandidate(document, nodeId);
  if (!candidate) return null;
  const sameNameCandidates = Object.keys(document.index.nodeById).filter((candidateId) => {
    return getFunctionSymbolCandidate(document, candidateId)?.name === candidate.name;
  });
  const index = sameNameCandidates.indexOf(nodeId);
  return index >= 0 ? index : null;
}

function cloneExprWithTransformedChildren(
  expr: Expr,
  childIds: string[],
  transform: (expr: Expr, nodeId: string) => Expr,
): Expr {
  switch (expr.kind) {
    case "number":
    case "symbol":
    case "text":
    case "immutable_expression":
    case "invalid_input":
      return cloneExpr(expr);
    case "user_function":
      return { ...expr, argument: transform(expr.argument, childIds[0] ?? "") };
    case "add":
      return { ...expr, terms: expr.terms.map((term, index) => transform(term, childIds[index] ?? "")) };
    case "power":
      return { ...expr, base: transform(expr.base, childIds[0] ?? ""), exponent: transform(expr.exponent, childIds[1] ?? "") };
    case "negate":
      return { ...expr, value: transform(expr.value, childIds[0] ?? "") };
    case "divide":
      return {
        ...expr,
        numerator: transform(expr.numerator, childIds[0] ?? ""),
        denominator: transform(expr.denominator, childIds[1] ?? ""),
      };
    case "root":
      return { ...expr, value: transform(expr.value, childIds[0] ?? "") };
    case "equation":
      return { ...expr, sides: expr.sides.map((side, index) => transform(side, childIds[index] ?? "")) };
    case "inequality":
      return { ...expr, lhs: transform(expr.lhs, childIds[0] ?? ""), rhs: transform(expr.rhs, childIds[1] ?? "") };
    case "call": {
      const [calleeId, ...argIds] = childIds;
      return {
        ...expr,
        callee: transform(expr.callee, calleeId ?? ""),
        args: expr.args.map((arg, index) => transform(arg, argIds[index] ?? "")),
      };
    }
    case "absolute_value":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
    case "special_font":
      return { ...expr, value: transform(expr.value, childIds[0] ?? "") };
    case "inner_product":
    case "outer_product":
      return { ...expr, factors: expr.factors.map((factor, index) => transform(factor, childIds[index] ?? "")) };
    case "big_sum": {
      let cursor = 0;
      const lowerBound = expr.lowerBound ? transform(expr.lowerBound, childIds[cursor++] ?? "") : null;
      const upperBound = expr.upperBound ? transform(expr.upperBound, childIds[cursor++] ?? "") : null;
      return { ...expr, lowerBound, upperBound, summand: transform(expr.summand, childIds[cursor] ?? "") };
    }
    case "big_prod": {
      let cursor = 0;
      const lowerBound = expr.lowerBound ? transform(expr.lowerBound, childIds[cursor++] ?? "") : null;
      const upperBound = expr.upperBound ? transform(expr.upperBound, childIds[cursor++] ?? "") : null;
      return { ...expr, lowerBound, upperBound, muliplicand: transform(expr.muliplicand, childIds[cursor] ?? "") };
    }
    case "limit": {
      let cursor = 0;
      const lowerBound = expr.lowerBound ? transform(expr.lowerBound, childIds[cursor++] ?? "") : null;
      return { ...expr, lowerBound, expression: transform(expr.expression, childIds[cursor] ?? "") };
    }
    case "integral": {
      let cursor = 0;
      const lowerBound = expr.lowerBound ? transform(expr.lowerBound, childIds[cursor++] ?? "") : null;
      const upperBound = expr.upperBound ? transform(expr.upperBound, childIds[cursor++] ?? "") : null;
      return { ...expr, lowerBound, upperBound, integrand: transform(expr.integrand, childIds[cursor] ?? "") };
    }
    case "uniterated_integral":
    case "closed_integral":
    case "multiple_integral":
      return { ...expr, integrand: transform(expr.integrand, childIds[0] ?? "") };
    case "differential":
      return { ...expr, variable: transform(expr.variable, childIds[0] ?? "") };
    case "partial_derivative":
      return {
        ...expr,
        quantity: transform(expr.quantity, childIds[0] ?? ""),
        variable: transform(expr.variable, childIds[1] ?? ""),
      };
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return {
        ...expr,
        variable: transform(expr.variable, childIds[0] ?? ""),
        operand: transform(expr.operand, childIds[1] ?? ""),
      };
    case "display_group":
      return { ...expr, expression: transform(expr.expression, childIds[0] ?? "") };
    case "second_order_partial_derivative": {
      const [dependentVariableId, ...independentVariableIds] = childIds;
      return {
        ...expr,
        dependentVariable: transform(expr.dependentVariable, dependentVariableId ?? ""),
        independentVariables: expr.independentVariables.map((variable, index) =>
          transform(variable, independentVariableIds[index] ?? ""),
        ),
      };
    }
    case "partial_at_const_quantity":
      return {
        ...expr,
        quantity: transform(expr.quantity, childIds[0] ?? ""),
        variable: transform(expr.variable, childIds[1] ?? ""),
        constantQuantity: transform(expr.constantQuantity, childIds[2] ?? ""),
      };
  }
  return cloneExpr(expr);
}
