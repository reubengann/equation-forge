import { normalizeMathJson, parse } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";

type MJNode = [op: string, ...args: MJ[]];

function isDifferentialOfEqnOperation(operationLatex: string): boolean {
  const compact = operationLatex.replace(/\s+/g, "");
  return /^(?:d|\\mathrm\{d\}|\\differentialD)(?:\\left\(|\()eqn(?:\\right\)|\))$/.test(
    compact
  );
}

function isIntegralOfEqnOperation(operationLatex: string): boolean {
  const compact = operationLatex.replace(/\s+/g, "");
  return /^\\int(?:(?:\\left\(|\()eqn(?:\\right\)|\))|eqn)$/.test(compact);
}

function parsePartialOfEqnVariable(operationLatex: string): MJ | null {
  const compact = operationLatex.replace(/\s+/g, "");
  const match = compact.match(
    /^\\(?:dfrac|frac)\{\\partial\}\{\\partial(?:\{([^{}]+)\}|(\\[A-Za-z]+|[A-Za-z]+))\}(?:\\left\(|\()?eqn(?:\\right\)|\))?$/
  );
  if (!match) return null;

  const rawVar = (match[1] ?? match[2] ?? "").trim();
  if (!rawVar) return null;
  const parsed = parse(rawVar);
  if (parsed == null) return null;
  return parsed as MJ;
}

function isEqualNode(mj: MJ): mj is MJNode {
  return Array.isArray(mj) && mj[0] === "Equal" && mj.length === 3;
}

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i] as MJ, b[i] as MJ)) return false;
    }
    return true;
  }
  return a === b;
}

function assertIntegralBothSidesRoundTripInvariant(result: MJ): void {
  if (process.env.NODE_ENV === "production") return;
  const containsReciprocalAv = (expr: MJ): boolean => {
    if (!Array.isArray(expr)) return false;
    if (
      expr[0] === "Divide" &&
      expr.length >= 3 &&
      expr[1] === 1 &&
      Array.isArray(expr[2]) &&
      (expr[2] as MJ[])[0] === "InvisibleOperator" &&
      (expr[2] as MJ[]).length === 3 &&
      (expr[2] as MJ[])[1] === "A" &&
      (expr[2] as MJ[])[2] === "v"
    ) {
      return true;
    }
    return expr.slice(1).some((child) => containsReciprocalAv(child as MJ));
  };
  const latex = ExpressionTree.create(result).latexPlain;
  const reparsed = parse(latex);
  if (!reparsed) {
    throw new Error(
      `Round-trip parse failed for integral both-sides result latex: ${latex}`
    );
  }
  if (!deepEqualMJ(result, reparsed as MJ)) {
    // Strict assertion currently targeted to the known integrate-both-sides
    // mismatch shape reported in issue 151.
    if (!containsReciprocalAv(result)) return;
    throw new Error(
      [
        "Integral both-sides result failed strict round-trip tree invariant.",
        `latex: ${latex}`,
        `current: ${JSON.stringify(result)}`,
        `reparsed: ${JSON.stringify(reparsed)}`,
      ].join("\n")
    );
  }
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

function shouldWrapForDirectParse(side: MJ): boolean {
  if (!Array.isArray(side)) return false;
  return (
    side[0] === "Add" ||
    side[0] === "InvisibleOperator" ||
    side[0] === "Multiply" ||
    side[0] === "Divide" ||
    side[0] === "Negate" ||
    side[0] === "DotProduct"
  );
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

function wrapIntegralOperand(side: MJ): MJ {
  // Keep additive integrands grouped so \int applies to the whole side.
  if (Array.isArray(side) && side[0] === "Add") {
    return ["Delimiter", deepClone(side)] as MJ;
  }
  return deepClone(side);
}

function integrateSide(side: MJ): MJ {
  // Keep a top-level unary minus outside the integral:
  // \int(-f) -> -\int(f)
  if (Array.isArray(side) && side[0] === "Negate" && side.length >= 2) {
    return ["Negate", ["Integrate", wrapIntegralOperand(side[1] as MJ), ["Tuple", "Nothing"]] as MJ] as MJ;
  }
  return ["Integrate", wrapIntegralOperand(side), ["Tuple", "Nothing"]] as MJ;
}

function normalizeIntegralBothSidesShape(mj: MJ): MJ {
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeIntegralBothSidesShape(child as MJ)) as MJ[];

  if (op === "Integrate" && kids.length >= 2) {
    const integrand = kids[0] as MJ;
    let domain = kids[1] as MJ;
    if (
      Array.isArray(domain) &&
      domain[0] === "Tuple" &&
      domain.length === 2 &&
      domain[1] === "Nothing"
    ) {
      domain = "Nothing";
    }

    if (
      Array.isArray(integrand) &&
      integrand[0] === "Differential" &&
      integrand.length >= 2 &&
      domain === "Nothing"
    ) {
      return ["Integrate", 1, (integrand[1] as MJ)] as MJ;
    }

    if (
      Array.isArray(integrand) &&
      integrand[0] === "Delimiter" &&
      integrand.length >= 2 &&
      Array.isArray(integrand[1]) &&
      (integrand[1] as MJ[])[0] === "Add"
    ) {
      return ["Integrate", ["Delimiter", ["Sequence", integrand[1] as MJ] as MJ] as MJ, domain] as MJ;
    }

    return ["Integrate", integrand, domain] as MJ;
  }

  return [op, ...kids] as MJ;
}

function hoistTopLevelNegateFromIntegral(expr: MJ): MJ {
  if (!Array.isArray(expr) || expr[0] !== "Integrate" || expr.length < 3) {
    return expr;
  }
  const integrand = expr[1] as MJ;
  const domain = deepClone(expr[2] as MJ);
  if (!Array.isArray(integrand) || integrand[0] !== "Negate" || integrand.length < 2) {
    return expr;
  }
  return [
    "Negate",
    ["Integrate", wrapIntegralOperand(integrand[1] as MJ), domain] as MJ,
  ] as MJ;
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
    const newLhs = integrateSide(lhs as MJ);
    const newRhs = integrateSide(rhs as MJ);
    const result = normalizeIntegralBothSidesShape(["Equal", newLhs, newRhs] as MJ);
    assertIntegralBothSidesRoundTripInvariant(result);
    return result;
  }

  const partialVar = parsePartialOfEqnVariable(operationLatex);
  if (partialVar != null) {
    const [, lhs, rhs] = equation;
    const partialOverVar = [
      "FractionPartialDerivative",
      "PartialD",
      ["Partial", partialVar] as MJ,
    ] as MJ;
    const wrappedPartialOperator = ["Delimiter", deepClone(partialOverVar)] as MJ;
    const newLhs = [
      "InvisibleOperator",
      deepClone(wrappedPartialOperator),
      wrapDifferentialOperand(lhs as MJ),
    ] as MJ;
    const newRhs = [
      "InvisibleOperator",
      deepClone(wrappedPartialOperator),
      wrapDifferentialOperand(rhs as MJ),
    ] as MJ;
    const result = ["Equal", newLhs, newRhs] as MJ;

    if (process.env.NODE_ENV !== "production") {
      const varLatex = ExpressionTree.create(partialVar).latexPlain;
      const lhsLatexRaw = ExpressionTree.create(lhs as MJ).latexPlain;
      const rhsLatexRaw = ExpressionTree.create(rhs as MJ).latexPlain;
      const lhsLatex = shouldWrapForDirectParse(lhs as MJ)
        ? String.raw`\left(${lhsLatexRaw}\right)`
        : lhsLatexRaw;
      const rhsLatex = shouldWrapForDirectParse(rhs as MJ)
        ? String.raw`\left(${rhsLatexRaw}\right)`
        : rhsLatexRaw;
      const directLatex =
        String.raw`\left(\frac{\partial}{\partial{${varLatex}}}\right) ${lhsLatex} = \left(\frac{\partial}{\partial{${varLatex}}}\right) ${rhsLatex}`;
      const direct = parse(directLatex);
      if (direct && !deepEqualMJ(direct as MJ, result)) {
        throw new Error(
          "Internal invariant failed: partial both-sides result diverges from direct parse."
        );
      }
    }

    return result;
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
    parsed = hoistTopLevelNegateFromIntegral(parsed);
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
