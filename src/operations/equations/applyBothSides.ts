import { normalizeMathJson, parse } from "../../computeEngine";
import type { MJ } from "../../ExpressionTree";

type MJNode = [op: string, ...args: MJ[]];

function isDifferentialOfEqnOperation(operationLatex: string): boolean {
  const compact = operationLatex.replace(/\s+/g, "");
  return /^(?:d|\\mathrm\{d\}|\\differentialD)(?:\\left\(|\()eqn(?:\\right\)|\))$/.test(
    compact
  );
}

function isIntegralOfEqnOperation(operationLatex: string): boolean {
  const compact = operationLatex.replace(/\s+/g, "");
  return /^\\int(?:\\left\(|\()eqn(?:\\right\)|\))$/.test(compact);
}

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

function shouldGroupPowerBase(base: MJ): boolean {
  if (!Array.isArray(base)) return false;
  const op = base[0];
  return (
    op === "Add" ||
    op === "Power" ||
    op === "InvisibleOperator" ||
    op === "Multiply" ||
    op === "Divide" ||
    op === "Negate" ||
    op === "DotProduct"
  );
}

function normalizePowerBaseGrouping(mj: MJ): MJ {
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizePowerBaseGrouping(child as MJ)) as MJ[];

  if (op === "Power" && kids.length >= 2) {
    const base = kids[0] as MJ;
    const exponent = kids[1] as MJ;
    if (Array.isArray(base) && base[0] === "Delimiter") {
      return ["Power", base, exponent] as MJ;
    }
    if (shouldGroupPowerBase(base)) {
      return ["Power", ["Delimiter", base] as MJ, exponent] as MJ;
    }
  }

  return [op, ...kids] as MJ;
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

function wrapDifferentialOperand(side: MJ): MJ {
  if (
    Array.isArray(side) &&
    (side[0] === "Add" ||
      side[0] === "InvisibleOperator" ||
      side[0] === "Multiply" ||
      side[0] === "Divide" ||
      side[0] === "Negate" ||
      side[0] === "DotProduct")
  ) {
    return ["Delimiter", deepClone(side)] as MJ;
  }
  return deepClone(side);
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

  // Treat d(eqn) as a semantic differential operator over the whole side.
  // This avoids parser ambiguity that can collapse d(u+Pv) to du+Pv.
  if (isDifferentialOfEqnOperation(operationLatex)) {
    const [, lhs, rhs] = equation;
    const newLhs = ["Differential", wrapDifferentialOperand(lhs as MJ)] as MJ;
    const newRhs = ["Differential", wrapDifferentialOperand(rhs as MJ)] as MJ;
    return ["Equal", newLhs, newRhs];
  }

  // Treat \int(eqn) as an integral over the whole side while keeping
  // the variable unresolved until the user provides/derives one later.
  if (isIntegralOfEqnOperation(operationLatex)) {
    const [, lhs, rhs] = equation;
    const newLhs = ["Integrate", deepClone(lhs as MJ), ["Tuple", "Nothing"]] as MJ;
    const newRhs = ["Integrate", deepClone(rhs as MJ), ["Tuple", "Nothing"]] as MJ;
    return ["Equal", newLhs, newRhs];
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
    const groupedSubstituted = normalizePowerBaseGrouping(substituted);
    let parsed = normalizeMathJson(groupedSubstituted);
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
