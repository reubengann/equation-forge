import { normalizeMathJson, parse } from "../../computeEngine";
import type { MJ } from "../../ExpressionTree";

type MJNode = [op: string, ...args: MJ[]];

function isEqualNode(mj: MJ): mj is MJNode {
  return Array.isArray(mj) && mj[0] === "Equal" && mj.length === 3;
}

function deepClone(mj: MJ): MJ {
  if (Array.isArray(mj)) {
    return [mj[0] as string, ...mj.slice(1).map((c) => deepClone(c as MJ))];
  }
  return mj;
}

function isSymbolNode(mj: MJ, symbolName: string): boolean {
  return (
    Array.isArray(mj) &&
    mj[0] === "Symbol" &&
    typeof mj[1] === "string" &&
    mj[1] === symbolName
  );
}

function containsSymbol(mj: MJ, symbolName: string): boolean {
  if (typeof mj === "string") return mj === symbolName;
  if (isSymbolNode(mj, symbolName)) return true;
  if (!Array.isArray(mj)) return false;
  if (mj[0] === symbolName) return true;
  return mj
    .slice(1)
    .some((child) => containsSymbol(child as MJ, symbolName));
}

function containsOp(mj: MJ, opName: string): boolean {
  if (Array.isArray(mj)) {
    if (mj[0] === opName) return true;
    return mj.slice(1).some((child) => containsOp(child as MJ, opName));
  }
  return false;
}

function replaceSymbol(mj: MJ, symbolName: string, replacement: MJ): MJ {
  if (typeof mj === "string") {
    return mj === symbolName ? deepClone(replacement) : mj;
  }
  if (isSymbolNode(mj, symbolName)) {
    return deepClone(replacement);
  }
  if (!Array.isArray(mj)) return mj;
  if (mj[0] === symbolName && mj.length === 1) {
    return deepClone(replacement);
  }
  const replacedKids = mj.slice(1).map((child) =>
    replaceSymbol(child as MJ, symbolName, replacement)
  );
  return [mj[0] as string, ...replacedKids];
}

function normalizeMulExpr(factors: MJ[]): MJ {
  const flat: MJ[] = [];
  for (const f of factors) {
    if (
      Array.isArray(f) &&
      (f[0] === "InvisibleOperator" || f[0] === "Multiply")
    ) {
      flat.push(...(f.slice(1) as MJ[]));
    } else {
      flat.push(f);
    }
  }
  if (flat.length === 0) return 1;
  if (flat.length === 1) return flat[0];
  return ["InvisibleOperator", ...flat];
}

function distributeTopLevelMulOverAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  if (op !== "InvisibleOperator" && op !== "Multiply") return expr;
  const factors = expr.slice(1) as MJ[];
  const addIndex = factors.findIndex((f) => Array.isArray(f) && f[0] === "Add");
  if (addIndex < 0) return expr;

  const addExpr = factors[addIndex] as MJNode;
  const terms = addExpr.slice(1) as MJ[];
  if (terms.length === 0) return expr;

  const distributedTerms = terms.map((term) => {
    const termFactors = [...factors];
    termFactors[addIndex] = term;
    return normalizeMulExpr(termFactors);
  });
  return ["Add", ...distributedTerms];
}

/**
 * Apply a user-specified operation (containing the placeholder symbol "eqn")
 * to both sides of a top-level equality.
 *
 * The operation is parsed from LaTeX, the placeholder is substituted with each
 * side's MathJSON, and the result is normalized in MathJSON form (no LaTeX
 * round-trip) to preserve vector nodes.
 *
 * Throws an Error when validation or parsing fails.
 */
export function applyOperationToBothSides(
  equation: MJ,
  operationLatex: string
): MJ {
  if (!isEqualNode(equation)) {
    throw new Error("Operation requires a top-level equation.");
  }

  const hasPlaceholder = /\beqn\b/.test(operationLatex);
  if (!hasPlaceholder) {
    throw new Error("Operation must contain the placeholder 'eqn'.");
  }

  const preparedLatex = operationLatex.replace(/\beqn\b/g, "\\mathrm{eqn}");
  const shouldDistributeByExplicitMultiply =
    operationLatex.includes("*") ||
    /\\cdot|\\times|·|×/.test(operationLatex);

  const template = parse(preparedLatex);
  if (!template) {
    throw new Error("Could not parse operation.");
  }

  // If we still cannot find the placeholder after parsing, bail out early.
  if (!containsSymbol(template, "eqn")) {
    throw new Error("Operation must contain the placeholder 'eqn'.");
  }

  const [, lhs, rhs] = equation;

  const applyToSide = (side: MJ): MJ => {
    const substituted = replaceSymbol(template, "eqn", side);
    let parsed = normalizeMathJson(substituted);
    if (shouldDistributeByExplicitMultiply && parsed) {
      parsed = normalizeMathJson(distributeTopLevelMulOverAdd(parsed));
    }
    if (!parsed) {
      throw new Error("Could not parse applied expression.");
    }
    if (containsOp(parsed, "Equal")) {
      throw new Error("Operation result must not contain an equality.");
    }
    if (containsSymbol(parsed, "eqn")) {
      throw new Error("Operation left placeholder unreplaced.");
    }
    return parsed;
  };

  const newLhs = applyToSide(lhs as MJ);
  const newRhs = applyToSide(rhs as MJ);

  return ["Equal", newLhs, newRhs];
}
