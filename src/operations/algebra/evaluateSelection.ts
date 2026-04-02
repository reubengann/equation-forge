import { normalizeMathJson, withRealScope } from "../../computeEngine";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { getAtPath, setAtPath } from "../../movePath";
import type { ExprSelection } from "../../selectionSemantics";

const SUBSCRIPT_PREFIX = "__pd_sub__";

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

function containsErrorNode(expr: MJ): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Error") return true;
  return expr.slice(1).some((child) => containsErrorNode(child as MJ));
}

function containsSyntheticDelimiterSymbol(expr: MJ): boolean {
  if (typeof expr === "string") {
    return expr.includes("Delimiter_") || expr.includes("List_");
  }
  if (!Array.isArray(expr)) return false;
  return expr.some((child) => containsSyntheticDelimiterSymbol(child as MJ));
}

function containsDifferentialAlias(expr: MJ): boolean {
  if (typeof expr === "string") return expr === "d_upright";
  if (!Array.isArray(expr)) return false;
  return expr.some((child) => containsDifferentialAlias(child as MJ));
}

function sanitizeSymbolPart(part: string): string {
  return part.replace(/[^A-Za-z0-9]/g, "_");
}

function encodeSubscriptSymbol(base: MJ, sub: MJ): string {
  const basePart = sanitizeSymbolPart(String(base));
  const subPart = sanitizeSymbolPart(String(sub));
  return `${SUBSCRIPT_PREFIX}${basePart}__${subPart}`;
}

function decodeSubscriptSymbol(value: MJ): MJ {
  if (typeof value === "string" && value.startsWith(SUBSCRIPT_PREFIX)) {
    const payload = value.slice(SUBSCRIPT_PREFIX.length);
    const pivot = payload.lastIndexOf("__");
    if (pivot > 0) {
      const base = payload.slice(0, pivot);
      const sub = payload.slice(pivot + 2);
      return ["Subscript", base, Number.isNaN(Number(sub)) ? sub : Number(sub)] as MJ;
    }
  }
  return value;
}

function toComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  // Delimiter/List are display-grouping wrappers in this app; evaluate on the inner expression.
  if ((expr[0] === "Delimiter" || expr[0] === "List") && expr.length >= 2) {
    return toComputeEngine(expr[1] as MJ);
  }
  if (expr[0] === "Subscript") {
    return encodeSubscriptSymbol(expr[1] as MJ, expr[2] as MJ);
  }
  const op = expr[0];
  const mappedOp = op === "InvisibleOperator" ? ("Multiply" as const) : op;
  return [mappedOp, ...expr.slice(1).map(toComputeEngine)] as MJ;
}

function fromComputeEngine(expr: MJ): MJ {
  if (
    expr &&
    typeof expr === "object" &&
    !Array.isArray(expr) &&
    typeof (expr as any).valueOf === "function"
  ) {
    const v = (expr as any).valueOf();
    if (typeof v === "number" || typeof v === "string") {
      return v as MJ;
    }
    if (typeof v === "object" && v !== null && "num" in (v as any)) {
      const num = (v as any).num;
      const parsed = typeof num === "string" ? Number(num) : num;
      if (typeof parsed === "number" && Number.isFinite(parsed)) {
        return parsed as MJ;
      }
    }
  }

  if (
    expr &&
    typeof expr === "object" &&
    !Array.isArray(expr) &&
    "num" in (expr as any)
  ) {
    const num = (expr as any).num;
    const parsed = typeof num === "string" ? Number(num) : num;
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return parsed as MJ;
    }
    const str = (expr as any).toString?.();
    if (typeof str === "string" && str !== "[object Object]") {
      return str as MJ;
    }
  }

  if (!Array.isArray(expr)) return decodeSubscriptSymbol(expr);
  const op = expr[0];
  if (op === "Rational") {
    const num = fromComputeEngine(expr[1] as MJ);
    const den = fromComputeEngine(expr[2] as MJ);
    return ["Divide", num, den] as MJ;
  }
  const mappedOp = op === "Multiply" ? ("InvisibleOperator" as const) : op;
  return [mappedOp, ...expr.slice(1).map(fromComputeEngine)] as MJ;
}

function rebuildGrouped(op: "Add" | "InvisibleOperator", parts: MJ[]): MJ {
  if (parts.length === 0) return op === "Add" ? 0 : 1;
  if (parts.length === 1) return parts[0];
  return [op, ...parts] as MJ;
}

function substituteSymbol(expr: MJ, needle: MJ, replacement: MJ): MJ {
  if (deepEqualMJ(expr, needle)) return replacement;
  if (!Array.isArray(expr)) return expr;
  return [expr[0], ...expr.slice(1).map((c) => substituteSymbol(c as MJ, needle, replacement))] as MJ;
}

function applyFunctionExpression(fn: MJ, value: MJ): MJ {
  if (Array.isArray(fn) && fn[0] === "Function") {
    const bodyRaw = fn[1] as MJ;
    const param = fn[2] as MJ | undefined;
    if (param !== undefined) {
      const body = Array.isArray(bodyRaw) && bodyRaw[0] === "Block" ? (bodyRaw[1] as MJ) : bodyRaw;
      const substituted = substituteSymbol(body, param, value);
      return normalizeMathJson(substituted) ?? substituted;
    }
  }
  return ["Apply", fn, value] as MJ;
}

function normalizeCanonicalCalculus(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;

  const op = expr[0];
  if (op === "Block") {
    return normalizeCanonicalCalculus((expr[1] as MJ) ?? expr[1]);
  }

  if (op === "Function") {
    const bodyRaw = expr[1] as MJ;
    const normalizedBody = normalizeCanonicalCalculus(
      Array.isArray(bodyRaw) && bodyRaw[0] === "Block" ? (bodyRaw[1] as MJ) : bodyRaw
    );
    const params = expr.slice(2).map((p) => normalizeCanonicalCalculus(p as MJ));
    return ["Function", normalizedBody, ...params] as MJ;
  }

  if (op === "Limits") {
    const sym = expr[1] as MJ;
    const lower = expr[2] as MJ;
    const upper = expr[3] as MJ;
    return [
      "Tuple",
      normalizeCanonicalCalculus(sym),
      normalizeCanonicalCalculus(lower),
      normalizeCanonicalCalculus(upper),
    ] as MJ;
  }

  if (op === "EvaluateAt") {
    const fn = normalizeCanonicalCalculus(expr[1] as MJ);
    const args = expr.slice(2).map((a) => normalizeCanonicalCalculus(a as MJ));
    const isZero = (v: MJ) => v === 0 || v === "0";

    if (args.length === 1) {
      return applyFunctionExpression(fn, args[0]);
    }

    if (args.length >= 2) {
      const lowerApplied = applyFunctionExpression(fn, args[0]);
      const upperApplied = applyFunctionExpression(fn, args[1]);

      if (isZero(lowerApplied)) {
        if (args.length === 2) return upperApplied;
        const extraFromUpper = args.slice(2).map((a) => applyFunctionExpression(fn, a));
        return rebuildGrouped("Add", [upperApplied, ...extraFromUpper]);
      }

      const terms: MJ[] = [upperApplied];
      if (!isZero(lowerApplied)) {
        terms.push(["Negate", lowerApplied] as MJ);
      }
      const diff = rebuildGrouped("Add", terms);

      if (args.length === 2) return diff;

      const extra = args.slice(2).map((a) => applyFunctionExpression(fn, a));
      return rebuildGrouped("Add", [diff, ...extra]);
    }
  }

  const kids = expr.slice(1).map((c) => normalizeCanonicalCalculus(c as MJ));
  return [op, ...kids] as MJ;
}

function evaluateExpression(expr: MJ): MJ | null {
  const ceReady = toComputeEngine(expr);
  return withRealScope(ceReady, (ce) => {
    const candidates = [
      ce.box(ceReady)?.evaluate?.(),
      ce.box(ceReady)?.simplify?.(),
      ce.box(ceReady)?.N?.(),
    ].filter(Boolean) as { json: MJ }[];

    for (const cand of candidates) {
      const fromCe = normalizeCanonicalCalculus(fromComputeEngine(cand.json));
      if (containsErrorNode(fromCe)) continue;
      if (containsSyntheticDelimiterSymbol(fromCe)) continue;
      if (containsDifferentialAlias(fromCe)) continue;

      const normalized = normalizeMathJson(fromCe) ?? fromCe;
      if (containsSyntheticDelimiterSymbol(normalized)) continue;
      if (containsDifferentialAlias(normalized)) continue;
      try {
        ExpressionTree.create(normalized);
      } catch {
        continue;
      }
      if (!deepEqualMJ(normalized, expr)) {
        return normalized;
      }
    }

    const multiplied = multiplyNumericFactors(expr);
    if (multiplied && !deepEqualMJ(multiplied, expr)) {
      return multiplied;
    }

    const reciprocalSimplified = simplifyReciprocalDivides(expr);
    if (!deepEqualMJ(reciprocalSimplified, expr)) {
      return reciprocalSimplified;
    }

    const zeroProductSimplified = simplifyZeroProducts(expr);
    const normalizedZeroProduct = normalizeMathJson(zeroProductSimplified) ?? zeroProductSimplified;
    if (!deepEqualMJ(normalizedZeroProduct, expr)) {
      return normalizedZeroProduct;
    }

    const differentialCanceled = simplifyDifferentialFractionProducts(expr);
    if (!deepEqualMJ(differentialCanceled, expr)) {
      return differentialCanceled;
    }

    return null;
  });
}

function multiplyNumericFactors(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return null;
  if (expr[0] !== "InvisibleOperator") return null;
  const factors = expr.slice(1) as MJ[];
  let product = 1;
  let numericCount = 0;
  const rest: MJ[] = [];
  for (const f of factors) {
    const numeric =
      typeof f === "number"
        ? f
        : typeof f === "string" && /^-?\d+(?:\.\d+)?$/.test(f)
        ? Number(f)
        : null;
    if (numeric === null) {
      rest.push(f);
      continue;
    }
    numericCount += 1;
    product *= numeric;
  }
  if (numericCount === 0) return null;
  const rebuilt = product === 1 && rest.length > 0 ? rest : [product, ...rest];
  return rebuildGrouped("InvisibleOperator", rebuilt);
}

function isOneLike(expr: MJ): boolean {
  return expr === 1 || expr === "1";
}

function simplifyReciprocalDivides(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => simplifyReciprocalDivides(c as MJ));
  if (op === "Divide" && kids.length >= 2) {
    const numerator = kids[0] as MJ;
    const denominator = kids[1] as MJ;
    if (
      Array.isArray(denominator) &&
      denominator[0] === "Divide" &&
      denominator.length >= 3 &&
      isOneLike(denominator[1] as MJ)
    ) {
      return rebuildGrouped("InvisibleOperator", [
        numerator,
        denominator[2] as MJ,
      ]);
    }
  }
  return [op, ...kids] as MJ;
}

function simplifyZeroProducts(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => simplifyZeroProducts(c as MJ));

  if (op === "InvisibleOperator") {
    if (kids.some((k) => k === 0 || k === "0")) return 0;
  }

  if (op === "Negate" && kids.length >= 1 && (kids[0] === 0 || kids[0] === "0")) {
    return 0;
  }

  return [op, ...kids] as MJ;
}

function canonicalizeDifferentialForm(expr: MJ): MJ {
  if (expr === "d_upright" || expr === "DifferentialD") return "DifferentialD";
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => canonicalizeDifferentialForm(c as MJ));

  if ((op === "InvisibleOperator" || op === "Multiply") && kids.length === 2) {
    const diffIdx = kids.findIndex((k) => k === "DifferentialD");
    if (diffIdx >= 0) {
      const other = kids[diffIdx === 0 ? 1 : 0] as MJ;
      return ["Differential", other] as MJ;
    }
  }
  if (
    op === "Subscript" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "Differential"
  ) {
    const inner = (kids[0] as MJ[])[1] as MJ;
    return ["Differential", ["Subscript", inner, kids[1] as MJ] as MJ] as MJ;
  }
  return [op, ...kids] as MJ;
}

function factorsEquivalent(a: MJ, b: MJ): boolean {
  const unwrap = (x: MJ): MJ =>
    Array.isArray(x) && (x[0] === "Delimiter" || x[0] === "List") && x.length >= 2
      ? (x[1] as MJ)
      : x;
  return deepEqualMJ(canonicalizeDifferentialForm(unwrap(a)), canonicalizeDifferentialForm(unwrap(b)));
}

function simplifyDifferentialFractionProducts(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => simplifyDifferentialFractionProducts(c as MJ));

  if ((op === "InvisibleOperator" || op === "Multiply") && kids.length >= 2) {
    const factors = [...kids] as MJ[];
    for (let i = 0; i < factors.length; i += 1) {
      const f = factors[i];
      if (
        !Array.isArray(f) ||
        (f[0] !== "Divide" &&
          f[0] !== "FractionDerivative" &&
          f[0] !== "FractionPartialDerivative") ||
        f.length < 3
      ) {
        continue;
      }
      const numerator = canonicalizeDifferentialForm(f[1] as MJ);
      const denominator = f[2] as MJ;
      const j = factors.findIndex((candidate, idx) => idx !== i && factorsEquivalent(candidate, denominator));
      if (j >= 0) {
        if (j > i) {
          factors[i] = numerator;
          factors.splice(j, 1);
        } else {
          factors[j] = numerator;
          factors.splice(i, 1);
        }
        return rebuildGrouped("InvisibleOperator", factors);
      }

      // Also support denominator represented as split factors, e.g. d_upright v_s.
      for (let k = 0; k < factors.length - 1; k += 1) {
        if (k === i || k + 1 === i) continue;
        const pairExpr = ["InvisibleOperator", factors[k], factors[k + 1]] as MJ;
        if (!factorsEquivalent(pairExpr, denominator)) continue;

        factors[i] = numerator;
        factors.splice(k, 2);
        return rebuildGrouped("InvisibleOperator", factors);
      }
    }
  }

  return [op, ...kids] as MJ;
}

function isZeroEquivalent(expr: MJ): boolean {
  const simplified = normalizeMathJson(simplifyZeroProducts(expr)) ?? simplifyZeroProducts(expr);
  if (simplified === 0 || simplified === "0") return true;
  if (Array.isArray(simplified) && simplified[0] === "Negate") {
    const inner = simplified[1] as MJ;
    if (inner === 0 || inner === "0") return true;
  }
  return false;
}

export function canEvaluateSelection(
  tree: ExpressionTree | null,
  sel: ExprSelection | null
): boolean {
  if (!tree || !sel) return false;
  if (sel.kind === "multi") return false;
  if (sel.kind === "span") {
    const parent = tree.nodesById[sel.parentId];
    if (!parent) return false;
    return parent.op === "Add" || parent.op === "InvisibleOperator";
  }
  return true;
}

export function evaluateSelection(
  tree: ExpressionTree,
  sel: ExprSelection
): ExpressionTree | null {
  if (sel.kind === "multi") return null;

  if (sel.kind === "node") {
    const path = tree.pathById[sel.nodeId];
    if (!path) return null;
    const target = getAtPath(tree.rootJson, path) as MJ;
    const evaluated = evaluateExpression(target);
    if (!evaluated) {
      if (!isZeroEquivalent(target)) return null;
      if (target === 0 || target === "0") return null;
      const nextRoot = setAtPath(tree.rootJson, path, 0) as MJ;
      return ExpressionTree.create(nextRoot);
    }
    const parentId = tree.parentById[sel.nodeId];
    const parentOp = parentId ? tree.nodesById[parentId]?.op : null;
    const needsGrouping =
      Array.isArray(evaluated) &&
      evaluated[0] === "Add" &&
      (parentOp === "InvisibleOperator" || parentOp === "Multiply");
    const replacement = needsGrouping ? (["Delimiter", evaluated] as MJ) : evaluated;
    const nextRoot = setAtPath(tree.rootJson, path, replacement) as MJ;
    return ExpressionTree.create(nextRoot);
  }

  // Span selection
  const parentPath = tree.pathById[sel.parentId];
  if (!parentPath) return null;

  const parentNode = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentNode)) return null;
  const op = parentNode[0];
  if (op !== "Add" && op !== "InvisibleOperator") return null;

  const kids = parentNode.slice(1) as MJ[];
  if (kids.length === 0) return null;

  const { start, end } = sel;
  if (start < 0 || end >= kids.length || start > end) return null;

  const segmentKids = kids.slice(start, end + 1);
  const segmentExpr = rebuildGrouped(op, segmentKids);

  const evaluatedSegment = evaluateExpression(segmentExpr);
  if (!evaluatedSegment) return null;

  const nextKids = [
    ...kids.slice(0, start),
    evaluatedSegment,
    ...kids.slice(end + 1),
  ];

  const rebuiltParent = rebuildGrouped(op, nextKids);
  const nextRoot = setAtPath(tree.rootJson, parentPath, rebuiltParent) as MJ;
  return ExpressionTree.create(nextRoot);
}
