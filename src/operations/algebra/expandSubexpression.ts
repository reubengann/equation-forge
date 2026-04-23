import { box, normalizeMathJson, parse } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

function normalizeRoundTripAliases(expr: MJ): MJ {
  if (expr === "d_upright") return "DifferentialD";
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((child) => normalizeRoundTripAliases(child as MJ));
  if (
    op === "Subscript" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "Differential"
  ) {
    const diffInner = (kids[0] as MJ[])[1] as MJ;
    return ["InvisibleOperator", "DifferentialD", ["Subscript", diffInner, kids[1] as MJ]] as MJ;
  }
  if (
    (op === "InvisibleOperator" || op === "Multiply") &&
    kids.length === 2 &&
    typeof kids[0] === "string" &&
    Array.isArray(kids[1]) &&
    ((kids[1] as MJ[])[0] === "Delimiter" || (kids[1] as MJ[])[0] === "List") &&
    (kids[1] as MJ[]).length >= 2
  ) {
    // Treat fn(arg) reparsed as implicit product the same as Apply(fn,arg).
    return ["Apply", kids[0] as MJ, ((kids[1] as MJ[])[1] as MJ)] as MJ;
  }
  if (op === "InvisibleOperator" || op === "Multiply") {
    const collapsed: MJ[] = [];
    for (let i = 0; i < kids.length; i += 1) {
      const cur = kids[i] as MJ;
      const next = i + 1 < kids.length ? (kids[i + 1] as MJ) : null;
      if (
        typeof cur === "string" &&
        next &&
        Array.isArray(next) &&
        (next[0] === "Delimiter" || next[0] === "List") &&
        next.length >= 2
      ) {
        collapsed.push(["Apply", cur, next[1] as MJ] as MJ);
        i += 1;
        continue;
      }
      collapsed.push(cur);
    }
    return [op, ...collapsed] as MJ;
  }
  return [op, ...kids] as MJ;
}

function assertExpandRoundTripInvariant(next: ExpressionTree): void {
  if (process.env.NODE_ENV === "production") return;
  const reparsed = parse(next.latexPlain);
  if (!reparsed) {
    throw new Error(
      `Round-trip parse failed for expand result latex: ${next.latexPlain}`
    );
  }

  const canonicalize = (root: MJ): MJ =>
    normalizeRoundTripAliases((normalizeMathJson(root) ?? root) as MJ);

  const canonicalCurrent = canonicalize(next.rootJson);
  const canonicalReparsed = canonicalize(reparsed);
  if (!deepEqualMJ(canonicalCurrent, canonicalReparsed)) {
    throw new Error(
      [
        "Expand result failed round-trip tree invariant.",
        `latex: ${next.latexPlain}`,
        `current: ${JSON.stringify(canonicalCurrent)}`,
        `reparsed: ${JSON.stringify(canonicalReparsed)}`,
      ].join("\n")
    );
  }
}

function toComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const mappedOp =
    op === "InvisibleOperator"
      ? ("Multiply" as const)
      : op === "List"
        ? ("Delimiter" as const)
        : op;
  return [mappedOp, ...expr.slice(1).map(toComputeEngine)] as MJ;
}

function fromComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const mappedOp = op === "Multiply" ? ("InvisibleOperator" as const) : op;
  return [mappedOp, ...expr.slice(1).map(fromComputeEngine)] as MJ;
}

function isAdd(node: MJ): node is MJ & [string, ...MJ[]] {
  return Array.isArray(node) && node[0] === "Add";
}

function containsOp(expr: MJ, op: string): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] === op) return true;
  return expr.slice(1).some((c) => containsOp(c as MJ, op));
}

function isIntegerExponent(expr: MJ): boolean {
  if (typeof expr === "number") return Number.isInteger(expr);
  if (typeof expr === "string") return /^-?\d+$/.test(expr.trim());
  return false;
}

function containsUnsafePowerExpansion(expr: MJ): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Power" && expr.length >= 3) {
    const exponent = expr[2] as MJ;
    if (!isIntegerExponent(exponent)) return true;
  }
  return expr.slice(1).some((c) => containsUnsafePowerExpansion(c as MJ));
}

function unwrapDelimiter(expr: MJ): MJ {
  if (Array.isArray(expr) && expr.length >= 2) {
    const op = expr[0];
    if (op === "Delimiter" || op === "List") {
      return unwrapDelimiter(expr[1] as MJ);
    }
    if (op === "Sequence" && expr.length === 2) {
      return unwrapDelimiter(expr[1] as MJ);
    }
  }
  return expr;
}

function distributeDotProduct(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeDotProduct);

  if (op === "DotProduct" && kids.length >= 2) {
    const left = unwrapDelimiter(kids[0]);
    const right = unwrapDelimiter(kids[1]);

    if (isAdd(left)) {
      const leftTerms = left.slice(1) as MJ[];
      return [
        "Add",
        ...leftTerms.map((term: MJ) =>
          distributeDotProduct(["DotProduct", term, right] as MJ)
        ),
      ] as MJ;
    }

    if (isAdd(right)) {
      const rightTerms = right.slice(1) as MJ[];
      return [
        "Add",
        ...rightTerms.map((term: MJ) =>
          distributeDotProduct(["DotProduct", left, term] as MJ)
        ),
      ] as MJ;
    }

    return ["DotProduct", left, right] as MJ;
  }

  return [op, ...kids] as MJ;
}

function distributeInvisibleOperator(expr: MJ, insideIntegrate = false): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const nextInsideIntegrate = insideIntegrate || op === "Integrate";
  const kids = expr
    .slice(1)
    .map((child) => distributeInvisibleOperator(child as MJ, nextInsideIntegrate)) as MJ[];

  if (op !== "InvisibleOperator") {
    return [op, ...kids] as MJ;
  }

  const addIndex = kids.findIndex((kid) => {
    const unwrapped = unwrapDelimiter(kid);
    return isAdd(unwrapped);
  });
  if (addIndex < 0) {
    return [op, ...kids] as MJ;
  }

  const candidateFactor = kids[addIndex];
  const candidateIsExplicitlyDelimitedAdd =
    Array.isArray(candidateFactor) &&
    (candidateFactor[0] === "Delimiter" || candidateFactor[0] === "List") &&
    isAdd(unwrapDelimiter(candidateFactor));
  const hasDifferentialSibling = kids.some(
    (kid, idx) =>
      idx !== addIndex &&
      Array.isArray(kid) &&
      (kid[0] === "Differential" || kid[0] === "InexactDifferential")
  );
  // Keep grouped additive factors intact in differential products, e.g.
  // [v - T(...)] dP should remain grouped instead of distributing to v dP - T(...) dP.
  if (
    insideIntegrate &&
    candidateIsExplicitlyDelimitedAdd &&
    hasDifferentialSibling
  ) {
    return [op, ...kids] as MJ;
  }

  const addNode = unwrapDelimiter(kids[addIndex]) as MJ;
  const addTerms = (addNode as [string, ...MJ[]]).slice(1) as MJ[];
  const expandedTerms = addTerms.map((term) => {
    const productKids = kids.map((kid, idx) => (idx === addIndex ? term : kid));
    const productExpr =
      productKids.length === 1
        ? productKids[0]
        : (["InvisibleOperator", ...productKids] as MJ);
    return distributeInvisibleOperator(productExpr);
  });
  return ["Add", ...expandedTerms] as MJ;
}

function distributeNegateOverAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeNegateOverAdd) as MJ[];

  if (op === "Negate" && kids.length >= 1) {
    const inner = unwrapDelimiter(kids[0] as MJ);
    if (isAdd(inner)) {
      const terms = (inner as [string, ...MJ[]]).slice(1) as MJ[];
      return [
        "Add",
        ...terms.map((term) => {
          const mapped = distributeNegateOverAdd(["Negate", term] as MJ);
          // Avoid double-negative additive terms like "- -T_1" after distribution.
          if (Array.isArray(mapped) && mapped[0] === "Negate") {
            const innerNeg = mapped[1] as MJ;
            if (Array.isArray(innerNeg) && innerNeg[0] === "Negate") {
              return innerNeg[1] as MJ;
            }
          }
          return mapped;
        }),
      ] as MJ;
    }
    return ["Negate", kids[0] as MJ] as MJ;
  }

  return [op, ...kids] as MJ;
}

function normalizeMul(factors: MJ[]): MJ {
  const flattened: MJ[] = [];
  for (const factor of factors) {
    if (
      Array.isArray(factor) &&
      (factor[0] === "InvisibleOperator" || factor[0] === "Multiply")
    ) {
      flattened.push(...(factor.slice(1) as MJ[]));
    } else {
      flattened.push(factor);
    }
  }
  if (flattened.length === 0) return 1;
  if (flattened.length === 1) return flattened[0];
  return ["InvisibleOperator", ...flattened] as MJ;
}

function distributeIntegrateOverAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeIntegrateOverAdd) as MJ[];

  if (op !== "Integrate" || kids.length < 2) {
    return [op, ...kids] as MJ;
  }

  const integrandRaw = kids[0] as MJ;
  const domain = kids[1] as MJ;
  const integrand = unwrapDelimiter(integrandRaw);
  if (!isAdd(integrand)) {
    return ["Integrate", integrandRaw, domain] as MJ;
  }

  const terms = (integrand as [string, ...MJ[]]).slice(1) as MJ[];
  return [
    "Add",
    ...terms.map((term) => {
      if (Array.isArray(term) && term[0] === "Negate" && term.length >= 2) {
        return [
          "Negate",
          distributeIntegrateOverAdd(["Integrate", term[1] as MJ, domain] as MJ),
        ] as MJ;
      }
      return distributeIntegrateOverAdd(["Integrate", term, domain] as MJ);
    }),
  ] as MJ;
}

function distributePowerOverMulDiv(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributePowerOverMulDiv) as MJ[];

  if (op === "Power" && kids.length >= 2) {
    const baseRaw = kids[0] as MJ;
    const exponent = kids[1] as MJ;
    const base = unwrapDelimiter(baseRaw);

    if (
      Array.isArray(base) &&
      (base[0] === "InvisibleOperator" || base[0] === "Multiply")
    ) {
      const factors = (base.slice(1) as MJ[]).map(
        (factor) => ["Power", factor, exponent] as MJ
      );
      return normalizeMul(factors);
    }

    if (Array.isArray(base) && base[0] === "Divide" && base.length >= 3) {
      const numerator = distributePowerOverMulDiv([
        "Power",
        base[1] as MJ,
        exponent,
      ] as MJ);
      const denominator = distributePowerOverMulDiv([
        "Power",
        base[2] as MJ,
        exponent,
      ] as MJ);
      return ["Divide", numerator, denominator] as MJ;
    }
  }

  return [op, ...kids] as MJ;
}

function distributeDivideOverAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeDivideOverAdd) as MJ[];

  if (op === "Divide" && kids.length >= 2) {
    const numeratorRaw = kids[0] as MJ;
    const denominator = kids[1] as MJ;
    const numerator = unwrapDelimiter(numeratorRaw);
    if (isAdd(numerator)) {
      const terms = (numerator as [string, ...MJ[]]).slice(1) as MJ[];
      return [
        "Add",
        ...terms.map((term) =>
          distributeDivideOverAdd(["Divide", term, denominator] as MJ)
        ),
      ] as MJ;
    }
    return ["Divide", numeratorRaw, denominator] as MJ;
  }

  return [op, ...kids] as MJ;
}

function distributeExpOverAdd(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeExpOverAdd) as MJ[];

  if (op === "Exp" && kids.length >= 1) {
    const argRaw = kids[0] as MJ;
    const arg = unwrapDelimiter(argRaw);
    if (isAdd(arg)) {
      const terms = (arg as [string, ...MJ[]]).slice(1) as MJ[];
      return normalizeMul(terms.map((term) => ["Exp", term] as MJ));
    }
    return ["Exp", argRaw] as MJ;
  }

  return [op, ...kids] as MJ;
}

function distributeDifferential(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeDifferential) as MJ[];

  if (op === "Differential" && kids.length >= 1) {
    const innerRaw = kids[0] as MJ;
    const inner = unwrapDelimiter(innerRaw);
    if (isAdd(inner)) {
      const terms = (inner as [string, ...MJ[]]).slice(1) as MJ[];
      return [
        "Add",
        ...terms.map((term) =>
          distributeDifferential(["Differential", term] as MJ)
        ),
      ] as MJ;
    }
    if (
      Array.isArray(inner) &&
      (inner[0] === "InvisibleOperator" || inner[0] === "Multiply")
    ) {
      const factors = inner.slice(1) as MJ[];
      if (factors.length >= 2) {
        return [
          "Add",
          ...factors.map((_, idx) =>
            distributeDifferential(
              normalizeMul(
                factors.map((factor, j) =>
                  j === idx ? (["Differential", factor] as MJ) : factor
                )
              )
            )
          ),
        ] as MJ;
      }
    }
    if (Array.isArray(inner) && inner[0] === "Negate" && inner.length >= 2) {
      return [
        "Negate",
        distributeDifferential(["Differential", inner[1] as MJ] as MJ),
      ] as MJ;
    }
    return ["Differential", innerRaw] as MJ;
  }

  return [op, ...kids] as MJ;
}

export function expandSubexpression(
  tree: ExpressionTree,
  targetId: string
): ExpressionTree | null {
  const path = tree.pathById[targetId];
  if (!path) return null;
  let effectivePath = path;
  let target = getAtPath(tree.rootJson, effectivePath) as MJ;

  // If the selected node is the grouped child under a Negate, expand the Negate
  // expression so bracket-selection behaves like direct negated-group expansion.
  const parentId = tree.parentById[targetId];
  if (
    parentId &&
    tree.nodesById[parentId]?.op === "Negate" &&
    tree.childrenById[parentId]?.[0] === targetId
  ) {
    const parentPath = tree.pathById[parentId];
    if (parentPath) {
      effectivePath = parentPath;
      target = getAtPath(tree.rootJson, effectivePath) as MJ;
    }
  }
  if (
    parentId &&
    tree.nodesById[parentId]?.op === "Differential" &&
    tree.childrenById[parentId]?.[0] === targetId
  ) {
    const parentPath = tree.pathById[parentId];
    if (parentPath) {
      effectivePath = parentPath;
      target = getAtPath(tree.rootJson, effectivePath) as MJ;
    }
  }
  if (
    parentId &&
    tree.nodesById[parentId]?.op === "Power" &&
    tree.childrenById[parentId]?.[0] === targetId
  ) {
    const parentPath = tree.pathById[parentId];
    if (parentPath) {
      effectivePath = parentPath;
      target = getAtPath(tree.rootJson, effectivePath) as MJ;
    }
  }

  // Step 1: custom bilinear/distributive passes in our dialect.
  const distributedDot = distributeDotProduct(target);
  const distributedMul = distributeInvisibleOperator(distributedDot);
  const distributedNegate = distributeNegateOverAdd(distributedMul);
  const distributedPower = distributePowerOverMulDiv(distributedNegate);
  const distributedDivide = distributeDivideOverAdd(distributedPower);
  const distributedExp = distributeExpOverAdd(distributedDivide);
  const distributedDifferential = distributeDifferential(distributedExp);
  const distributed = distributeIntegrateOverAdd(distributedDifferential);
  const customChanged = !deepEqualMJ(distributed, target);

  // Step 2: let the Compute Engine do standard expansion where safe.
  let back: MJ;
  if (customChanged) {
    back = distributed;
  } else {
    const ceReady = toComputeEngine(distributed);
    const skipCeExpand =
      containsOp(distributed, "DotProduct") || containsUnsafePowerExpansion(distributed);
    let expanded: MJ = ceReady;
    if (!skipCeExpand) {
      try {
        const expandedBox = box(ceReady)?.expand?.();
        expanded = (expandedBox?.json as MJ) ?? ceReady;
      } catch {
        // Some CE expansions emit unsupported array forms for our tree dialect.
        return null;
      }
    }
    back = fromComputeEngine(expanded as MJ);
  }

  // Step 3: translate back to our dialect and normalize.
  if (containsOp(back, "Error")) return null;
  let normalized: MJ | null = null;
  try {
    normalized = normalizeMathJson(back);
  } catch {
    return null;
  }
  if (!normalized) {
    return null;
  }

  // If nothing changed, treat as no-op.
  if (deepEqualMJ(normalized, target)) return null;

  const nextRoot = setAtPath(tree.rootJson, effectivePath, normalized) as MJ;
  let next: ExpressionTree;
  try {
    next = ExpressionTree.create(nextRoot);
  } catch {
    return null;
  }
  assertExpandRoundTripInvariant(next);
  return next;
}
