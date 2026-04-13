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

function isEvalDebugEnabled(): boolean {
  return true;
}

function debugEval(label: string, payload: MJ): void {
  if (!isEvalDebugEnabled()) return;
  console.debug(`[evaluateSelection] ${label}:`, JSON.stringify(payload));
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
  if (expr[0] === "Power" && expr.length >= 3 && expr[1] === "e") {
    return ["Power", "ExponentialE", toComputeEngine(expr[2] as MJ)] as MJ;
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

type EvalMode = "evaluate" | "simplify";

function evaluateSingleDefiniteIntegralByAntiderivative(
  ceExpr: MJ,
  ce: { box: (expr: MJ) => any }
): MJ | null {
  if (!Array.isArray(ceExpr) || ceExpr[0] !== "Integrate" || ceExpr.length < 3) return null;
  const integrand = ceExpr[1] as MJ;
  const rawBounds = ceExpr[2] as MJ;
  if (!Array.isArray(rawBounds) || rawBounds[0] !== "Tuple" || rawBounds.length < 4) {
    return null;
  }

  let variable = rawBounds[1] as MJ;
  const lower = rawBounds[2] as MJ;
  const upper = rawBounds[3] as MJ;

  // Infer variable when parser encodes differential in integrand.
  let normalizedIntegrand = integrand;
  if (variable === "Nothing" && Array.isArray(integrand)) {
    if (
      integrand[0] === "Divide" &&
      integrand.length >= 3 &&
      Array.isArray(integrand[1]) &&
      (integrand[1] as MJ[])[0] === "Differential"
    ) {
      const diffOperand = ((integrand[1] as MJ[])[1] ?? "Nothing") as MJ;
      const denominator = integrand[2] as MJ;
      if (
        typeof diffOperand === "string" &&
        typeof denominator === "string" &&
        diffOperand === denominator
      ) {
        variable = diffOperand;
        normalizedIntegrand = ["Divide", 1, denominator] as MJ;
      }
    } else if (
      integrand[0] === "Differential" &&
      integrand.length >= 2 &&
      typeof integrand[1] === "string"
    ) {
      variable = integrand[1] as MJ;
      normalizedIntegrand = 1;
    }
  }

  if (
    variable === "Nothing" ||
    lower === "Nothing" ||
    upper === "Nothing" ||
    typeof variable !== "string"
  ) {
    return null;
  }

  const antiDerivative = ce
    .box(["Integrate", normalizedIntegrand, variable] as MJ)
    ?.evaluate?.();
  if (antiDerivative?.json === undefined) return null;

  const antiBox = ce.box(antiDerivative.json as MJ);
  if (typeof antiBox?.subs !== "function") return null;

  const upperEval = antiBox.subs({ [variable]: upper });
  const lowerEval = antiBox.subs({ [variable]: lower });
  if (upperEval?.json === undefined || lowerEval?.json === undefined) return null;

  const diffBox = ce.box(["Subtract", upperEval.json as MJ, lowerEval.json as MJ] as MJ);
  const reduced = diffBox?.simplify?.() ?? diffBox?.evaluate?.();
  if (reduced?.json === undefined) return null;

  return reduced.json as MJ;
}

function rewriteDefiniteIntegralsByAntiderivative(
  ceExpr: MJ,
  ce: { box: (expr: MJ) => any }
): { rewritten: MJ; changed: boolean } {
  const replacement = evaluateSingleDefiniteIntegralByAntiderivative(ceExpr, ce);
  if (replacement !== null) return { rewritten: replacement, changed: true };
  if (!Array.isArray(ceExpr)) return { rewritten: ceExpr, changed: false };

  let changed = false;
  const kids = (ceExpr.slice(1) as MJ[]).map((child) => {
    const out = rewriteDefiniteIntegralsByAntiderivative(child, ce);
    if (out.changed) changed = true;
    return out.rewritten;
  });
  return { rewritten: [ceExpr[0], ...kids] as MJ, changed };
}

function evaluateExpression(expr: MJ, mode: EvalMode): MJ | null {
  const ceReady = toComputeEngine(expr);
  debugEval("input", expr);
  debugEval("ce-ready", ceReady);
  return withRealScope(ceReady, (ce) => {
    const boxed = ce.box(ceReady);
    const candidates: { json: MJ }[] = [];
    const tryCandidate = (
      label: "evaluate" | "simplify" | "N",
      fn: (() => { json: unknown } | undefined) | undefined
    ) => {
      if (!fn) return;
      try {
        const value = fn();
        if (value && value.json !== undefined) {
          candidates.push({ json: value.json as MJ });
          debugEval(`ce-${label}-out`, value.json as MJ);
        }
      } catch {
        // Keep evaluate robust: CE may throw for some symbolic integrals.
      }
    };
    if (mode === "simplify") {
      tryCandidate("simplify", boxed?.simplify?.bind(boxed));
      tryCandidate("evaluate", boxed?.evaluate?.bind(boxed));
    } else {
      tryCandidate("evaluate", boxed?.evaluate?.bind(boxed));
      tryCandidate("simplify", boxed?.simplify?.bind(boxed));
    }
    tryCandidate("N", boxed?.N?.bind(boxed));

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
        debugEval("result", normalized);
        return normalized;
      }
    }

    try {
      const viaAntiderivative = rewriteDefiniteIntegralsByAntiderivative(ceReady, ce);
      if (viaAntiderivative.changed) {
        debugEval("fallback-antiderivative-rewritten-ce", viaAntiderivative.rewritten);
        const fromCe = normalizeCanonicalCalculus(fromComputeEngine(viaAntiderivative.rewritten));
        const normalizedFromCe = normalizeMathJson(fromCe) ?? fromCe;
        if (
          !containsErrorNode(normalizedFromCe) &&
          !containsSyntheticDelimiterSymbol(normalizedFromCe) &&
          !containsDifferentialAlias(normalizedFromCe) &&
          !deepEqualMJ(normalizedFromCe, expr)
        ) {
          debugEval("fallback-antiderivative-result", normalizedFromCe);
          return normalizedFromCe;
        }
      }
    } catch {
      debugEval("fallback-antiderivative-error", ceReady);
    }

    const multiplied = multiplyNumericFactors(expr);
    if (multiplied && !deepEqualMJ(multiplied, expr)) {
      debugEval("result", multiplied);
      return multiplied;
    }

    const reciprocalSimplified = simplifyReciprocalDivides(expr);
    if (!deepEqualMJ(reciprocalSimplified, expr)) {
      debugEval("result", reciprocalSimplified);
      return reciprocalSimplified;
    }

    const zeroProductSimplified = simplifyZeroProducts(expr);
    const normalizedZeroProduct = normalizeMathJson(zeroProductSimplified) ?? zeroProductSimplified;
    if (!deepEqualMJ(normalizedZeroProduct, expr)) {
      debugEval("result", normalizedZeroProduct);
      return normalizedZeroProduct;
    }

    const differentialCanceled = simplifyDifferentialFractionProducts(expr);
    if (!deepEqualMJ(differentialCanceled, expr)) {
      debugEval("result", differentialCanceled);
      return differentialCanceled;
    }

    const negationSimplified = simplifyNegationPairs(expr);
    const normalizedNegation = normalizeMathJson(negationSimplified) ?? negationSimplified;
    if (!deepEqualMJ(normalizedNegation, expr)) {
      debugEval("result", normalizedNegation);
      return normalizedNegation;
    }

    if (mode === "simplify") {
      const logCombined = simplifyLogAddSub(expr);
      const normalizedLogCombined = normalizeMathJson(logCombined) ?? logCombined;
      if (!deepEqualMJ(normalizedLogCombined, expr)) {
        debugEval("result", normalizedLogCombined);
        return normalizedLogCombined;
      }
    }

    const definitePowerIntegral = evaluateDefinitePowerIntegral(expr);
    if (definitePowerIntegral && !deepEqualMJ(definitePowerIntegral, expr)) {
      debugEval("result", definitePowerIntegral);
      return definitePowerIntegral;
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

function simplifyNegationPairs(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => simplifyNegationPairs(c as MJ));

  if (op === "Negate" && kids.length >= 1) {
    const inner = kids[0] as MJ;
    if (Array.isArray(inner) && inner[0] === "Negate" && inner.length >= 2) {
      return inner[1] as MJ;
    }
    if (
      Array.isArray(inner) &&
      (inner[0] === "Delimiter" || inner[0] === "List") &&
      inner.length >= 2 &&
      Array.isArray(inner[1]) &&
      (inner[1] as MJ[])[0] === "Negate" &&
      (inner[1] as MJ[]).length >= 2
    ) {
      return (inner[1] as MJ[])[1] as MJ;
    }
  }

  return [op, ...kids] as MJ;
}

function parseSignedLnTerm(expr: MJ): { sign: 1 | -1; arg: MJ } | null {
  if (Array.isArray(expr) && expr[0] === "Ln" && expr.length >= 2) {
    return { sign: 1, arg: expr[1] as MJ };
  }
  if (
    Array.isArray(expr) &&
    expr[0] === "Negate" &&
    expr.length >= 2 &&
    Array.isArray(expr[1]) &&
    (expr[1] as MJ[])[0] === "Ln" &&
    (expr[1] as MJ[]).length >= 2
  ) {
    return { sign: -1, arg: (expr[1] as MJ[])[1] as MJ };
  }
  return null;
}

function simplifyLogAddSub(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map((c) => simplifyLogAddSub(c as MJ));
  if (op !== "Add" || kids.length !== 2) return [op, ...kids] as MJ;

  const left = parseSignedLnTerm(kids[0] as MJ);
  const right = parseSignedLnTerm(kids[1] as MJ);
  if (!left || !right) return [op, ...kids] as MJ;

  const buildProduct = (parts: MJ[]): MJ => {
    if (parts.length === 0) return 1;
    if (parts.length === 1) return parts[0] as MJ;
    return ["InvisibleOperator", ...parts] as MJ;
  };

  const positives: MJ[] = [];
  const negatives: MJ[] = [];
  for (const term of [left, right]) {
    if (term.sign > 0) positives.push(term.arg);
    else negatives.push(term.arg);
  }

  const numerator = buildProduct(positives);
  const denominator = buildProduct(negatives);
  const lnArg = negatives.length === 0 ? numerator : (["Divide", numerator, denominator] as MJ);
  return ["Ln", lnArg] as MJ;
}

function absoluteNumericMJ(value: MJ): MJ | null {
  if (typeof value === "number" && Number.isFinite(value) && value < 0) {
    return Math.abs(value);
  }
  if (typeof value === "string" && /^-\d+(?:\.\d+)?$/.test(value)) {
    return value.slice(1);
  }
  return null;
}

function normalizeNegativeAddTerm(expr: MJ): MJ {
  const absScalar = absoluteNumericMJ(expr);
  if (absScalar !== null) return ["Negate", absScalar] as MJ;

  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  if (op !== "InvisibleOperator" && op !== "Multiply") return expr;

  const factors = expr.slice(1) as MJ[];
  if (factors.length === 0) return expr;
  const firstAbs = absoluteNumericMJ(factors[0] as MJ);
  if (firstAbs === null) return expr;

  const rest = [firstAbs, ...factors.slice(1)] as MJ[];
  const product =
    rest.length === 1 ? rest[0] : ([op, ...rest] as MJ);
  return ["Negate", product] as MJ;
}

function numberFromMJ(expr: MJ): number | null {
  if (typeof expr === "number" && Number.isFinite(expr)) return expr;
  if (typeof expr === "string" && /^-?\d+(?:\.\d+)?$/.test(expr)) {
    const parsed = Number(expr);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function containsSymbol(expr: MJ, symbol: string): boolean {
  if (expr === symbol) return true;
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Subscript" && expr.length >= 2) {
    // Treat subscripts like c_v as symbolic labels; dependence follows the base only.
    return containsSymbol(expr[1] as MJ, symbol);
  }
  return expr.slice(1).some((child) => containsSymbol(child as MJ, symbol));
}

function rebuildProduct(parts: MJ[]): MJ {
  if (parts.length === 0) return 1;
  if (parts.length === 1) return parts[0] as MJ;
  return ["InvisibleOperator", ...parts] as MJ;
}

function extractConstantTimesPower(
  integrand: MJ,
  variable: string
): { constant: MJ; exponent: number } | null {
  const factorFromPower = (factor: MJ): number | null => {
    if (factor === variable) return 1;
    if (Array.isArray(factor) && factor[0] === "Power" && factor.length >= 3 && factor[1] === variable) {
      return numberFromMJ(factor[2] as MJ);
    }
    return null;
  };

  if (integrand === variable) return { constant: 1, exponent: 1 };
  if (Array.isArray(integrand) && integrand[0] === "Power" && integrand[1] === variable) {
    const n = numberFromMJ(integrand[2] as MJ);
    if (n !== null) return { constant: 1, exponent: n };
  }

  if (
    Array.isArray(integrand) &&
    (integrand[0] === "InvisibleOperator" || integrand[0] === "Multiply")
  ) {
    const factors = integrand.slice(1) as MJ[];
    let powerIdx = -1;
    let exponent: number | null = null;
    for (let i = 0; i < factors.length; i += 1) {
      const n = factorFromPower(factors[i] as MJ);
      if (n === null) continue;
      if (powerIdx >= 0) return null;
      powerIdx = i;
      exponent = n;
    }
    if (powerIdx >= 0 && exponent !== null) {
      const others = factors.filter((_, idx) => idx !== powerIdx) as MJ[];
      if (others.some((f) => containsSymbol(f, variable))) return null;
      return { constant: rebuildProduct(others), exponent };
    }
  }

  if (Array.isArray(integrand) && integrand[0] === "Divide" && integrand.length >= 3) {
    const numerator = integrand[1] as MJ;
    const denominator = integrand[2] as MJ;
    if (containsSymbol(numerator, variable)) return null;

    const denomFactors =
      Array.isArray(denominator) &&
      (denominator[0] === "InvisibleOperator" || denominator[0] === "Multiply")
        ? (denominator.slice(1) as MJ[])
        : [denominator];

    let varPowerIdx = -1;
    let varPower: number | null = null;
    for (let i = 0; i < denomFactors.length; i += 1) {
      const n = factorFromPower(denomFactors[i] as MJ);
      if (n === null) continue;
      if (varPowerIdx >= 0) return null;
      varPowerIdx = i;
      varPower = n;
    }
    if (varPowerIdx < 0 || varPower === null) return null;

    const otherDenominator = denomFactors.filter((_, idx) => idx !== varPowerIdx) as MJ[];
    if (otherDenominator.some((f) => containsSymbol(f, variable))) return null;

    const constantDen = rebuildProduct(otherDenominator);
    const constant =
      constantDen === 1 ? numerator : (["Divide", numerator, constantDen] as MJ);
    return { constant, exponent: -varPower };
  }

  return null;
}

function evaluateDefinitePowerIntegral(expr: MJ): MJ | null {
  if (!Array.isArray(expr) || expr[0] !== "Integrate" || expr.length < 3) return null;
  const integrand = expr[1] as MJ;
  const bounds = expr[2] as MJ;
  if (!Array.isArray(bounds) || bounds[0] !== "Tuple" || bounds.length < 4) return null;

  const variable = bounds[1] as MJ;
  const lower = bounds[2] as MJ;
  const upper = bounds[3] as MJ;
  if (typeof variable !== "string" || lower === "Nothing" || upper === "Nothing") return null;

  const extracted = extractConstantTimesPower(integrand, variable);
  if (!extracted) return null;

  const nPlus1 = extracted.exponent + 1;
  if (Math.abs(nPlus1) < 1e-12) return null; // n = -1 is logarithmic

  const makePow = (base: MJ): MJ => {
    if (Math.abs(nPlus1 - 1) < 1e-12) return base;
    return ["Power", base, nPlus1] as MJ;
  };
  const diff = ["Add", makePow(upper), ["Negate", makePow(lower)]] as MJ;
  const scaled = ["InvisibleOperator", extracted.constant, diff] as MJ;
  const result =
    Math.abs(nPlus1 - 1) < 1e-12 ? scaled : (["Divide", scaled, nPlus1] as MJ);

  return normalizeMathJson(result) ?? result;
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

function multiSelectionAsEvalSpan(
  tree: ExpressionTree,
  sel: Extract<ExprSelection, { kind: "multi" }>
): Extract<ExprSelection, { kind: "span" }> | null {
  const ids = Array.from(new Set(sel.nodeIds));
  if (ids.length < 2) return null;
  const firstParent = tree.parentById[ids[0]];
  if (!firstParent) return null;
  if (!ids.every((id) => tree.parentById[id] === firstParent)) return null;

  const parentOp = tree.nodesById[firstParent]?.op;
  if (parentOp !== "Add" && parentOp !== "InvisibleOperator") return null;

  const indices = ids
    .map((id) => tree.childIndexById[id])
    .filter((idx): idx is number => idx != null)
    .sort((a, b) => a - b);
  if (indices.length !== ids.length) return null;
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) return null;
  }

  return {
    kind: "span",
    parentId: firstParent,
    op: parentOp,
    start: indices[0],
    end: indices[indices.length - 1],
  };
}

export function canEvaluateSelection(
  tree: ExpressionTree | null,
  sel: ExprSelection | null
): boolean {
  if (!tree || !sel) return false;
  if (sel.kind === "multi") {
    const span = multiSelectionAsEvalSpan(tree, sel);
    return span != null;
  }
  if (sel.kind === "span") {
    const parent = tree.nodesById[sel.parentId];
    if (!parent) return false;
    return parent.op === "Add" || parent.op === "InvisibleOperator";
  }
  return true;
}

export function canSimplifySelection(
  tree: ExpressionTree | null,
  sel: ExprSelection | null
): boolean {
  return canEvaluateSelection(tree, sel);
}

function applyEvalLikeSelection(
  tree: ExpressionTree,
  sel: ExprSelection,
  mode: EvalMode
): ExpressionTree | null {
  let effectiveSel: ExprSelection = sel;
  if (sel.kind === "multi") {
    const span = multiSelectionAsEvalSpan(tree, sel);
    if (!span) return null;
    effectiveSel = span;
  }

  if (effectiveSel.kind === "node") {
    const path = tree.pathById[effectiveSel.nodeId];
    if (!path) return null;
    const target = getAtPath(tree.rootJson, path) as MJ;
    const evaluated = evaluateExpression(target, mode);
    if (!evaluated) {
      if (!isZeroEquivalent(target)) return null;
      if (target === 0 || target === "0") return null;
      const nextRoot = setAtPath(tree.rootJson, path, 0) as MJ;
      return ExpressionTree.create(nextRoot);
    }
    const parentId = tree.parentById[effectiveSel.nodeId];
    const parentOp = parentId ? tree.nodesById[parentId]?.op : null;
    const normalizedEvaluated = normalizeNegativeAddTerm(evaluated);
    const needsGrouping =
      Array.isArray(normalizedEvaluated) &&
      normalizedEvaluated[0] === "Add" &&
      (parentOp === "InvisibleOperator" || parentOp === "Multiply");
    const replacement = needsGrouping
      ? (["Delimiter", normalizedEvaluated] as MJ)
      : normalizedEvaluated;
    const nextRoot = setAtPath(tree.rootJson, path, replacement) as MJ;
    return ExpressionTree.create(nextRoot);
  }

  // Span selection
  const parentPath = tree.pathById[effectiveSel.parentId];
  if (!parentPath) return null;

  const parentNode = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentNode)) return null;
  const op = parentNode[0];
  if (op !== "Add" && op !== "InvisibleOperator") return null;

  const kids = parentNode.slice(1) as MJ[];
  if (kids.length === 0) return null;

  const { start, end } = effectiveSel;
  if (start < 0 || end >= kids.length || start > end) return null;

  const segmentKids = kids.slice(start, end + 1);
  const segmentExpr = rebuildGrouped(op, segmentKids);

  const evaluatedSegment = evaluateExpression(segmentExpr, mode);
  if (!evaluatedSegment) return null;
  const spanParentParentId = tree.parentById[effectiveSel.parentId] ?? null;
  const spanParentParentOp = spanParentParentId
    ? tree.nodesById[spanParentParentId]?.op
    : null;
  const shouldNormalizeSegmentSign =
    op === "Add" ||
    ((op === "InvisibleOperator" || op === "Multiply") && spanParentParentOp === "Add");
  const normalizedSegment = shouldNormalizeSegmentSign
    ? normalizeNegativeAddTerm(evaluatedSegment)
    : evaluatedSegment;

  const nextKids = [
    ...kids.slice(0, start),
    normalizedSegment,
    ...kids.slice(end + 1),
  ];

  const rebuiltParent = rebuildGrouped(op, nextKids);
  const nextRoot = setAtPath(tree.rootJson, parentPath, rebuiltParent) as MJ;
  return ExpressionTree.create(nextRoot);
}

export function evaluateSelection(
  tree: ExpressionTree,
  sel: ExprSelection
): ExpressionTree | null {
  return applyEvalLikeSelection(tree, sel, "evaluate");
}

export function simplifySelection(
  tree: ExpressionTree,
  sel: ExprSelection
): ExpressionTree | null {
  return applyEvalLikeSelection(tree, sel, "simplify");
}
