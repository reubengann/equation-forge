import {
  ComputeEngine,
  type Expression,
  type LatexDictionaryEntry,
} from "@cortex-js/compute-engine";
import type { MJ } from "./ExpressionTree";
import { toMathLiveLatex } from "./infra/mathlive/differentialLatex";

function normalizeVectorMacros(latex: string): string {
  // MathLive macros render \vec as \mathbf{...}; the CE interprets this as a
  // 1x1 Matrix, which our renderer does not support. Rewrite those bold macros
  // back into explicit \vec commands before parsing so we consistently get
  // the Vector shape.
  const withBraces = latex.replace(
    /\\mathbf\s*{([^{}]+)}/g,
    (_m, inner) => String.raw`\\vec{${inner}}`
  );
  return withBraces.replace(
    /\\mathbf\s+([A-Za-z])/g,
    (_m, sym) => String.raw`\\vec{${sym}}`
  );
}

function parseIntegralWithDifferentialOnly(latex: string): MJ | null {
  // Handles forms like:
  // \int_{a}^{b}\differentialD(expr)
  // \int_{a}^{b}\mathrm{d}'{Q}
  // \int d'Q
  const reMacro =
    /^\\int\s*_({[^}]*}|[^\s^]+)?\s*\^({[^}]*}|[^\s^]+)?\s*(?:\\differentialD|\\inexactDifferentialD|\\mathrm\{d\}')\s*(?:\\left\((.+)\\right\)|\{(.+)\}|(.+))\s*$/s;
  const reTightPrime =
    /^\\int\s*_({[^}]*}|[^\s^]+)?\s*\^({[^}]*}|[^\s^]+)?\s*d'([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?)\s*$/s;
  const mMacro = latex.match(reMacro);
  const mTight = latex.match(reTightPrime);
  const m = mMacro ?? mTight;
  if (!m) return null;

  const strip = (s: string) =>
    s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s;

  const lowerLatex = strip(m[1]?.trim() ?? "");
  const upperLatex = strip(m[2]?.trim() ?? "");
  const operandLatex = strip((m[3] || m[4] || m[5] || "").trim());

  const normalizeFragment = (expr: MJ | null): MJ | null => {
    if (expr === null || expr === undefined) return expr;
    if (typeof expr === "string") {
      const m = /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(expr);
      if (!m) return expr;
      const sub = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
      return ["Subscript", m[1], sub] as MJ;
    }
    if (!Array.isArray(expr)) return expr;
    const op = expr[0];
    const kids = expr.slice(1).map((child) => normalizeFragment(child as MJ)) as MJ[];
    if (
      (op === "InvisibleOperator" || op === "Multiply") &&
      kids.length === 2 &&
      Array.isArray(kids[0]) &&
      (kids[0] as MJ[])[0] === "Power" &&
      ((kids[0] as MJ[])[2] as MJ) === "t"
    ) {
      return ["Power", ["OverDot", (kids[0] as MJ[])[1] as MJ, 1], kids[1] as MJ] as MJ;
    }
    return [op, ...kids] as MJ;
  };

  const parseFragment = (fragment: string): MJ | null => {
    if (!fragment) return null;
    const parsed =
      parse(fragment) ??
      ((ce.parse(fragment, { canonical: false })?.json as MJ) ??
        null);
    return normalizeFragment(parsed);
  };

  const lower = parseFragment(lowerLatex) ?? 0;
  const upper = parseFragment(upperLatex) ?? 0;
  const operand = parseFragment(operandLatex) ?? (operandLatex || "Nothing");

  // Integrand defaults to 1 when only a differential is provided.
  return normalizeMathJson([
    "Integrate",
    1,
    ["Tuple", operand, lower, upper],
  ] as MJ);
}

function injectImplicitOneInIntegrals(latex: string): string {
  // Normalize spacing and avoid double-underscore when lower is missing.
  // Patterns to catch:
  // \int_{0}^{x0} \,\mathrm{d}{x}
  // \int^{x0} \,\mathrm{d}{x}
  // \int \,\mathrm{d}{x}
  // Allow optional \, between bounds and differential.
  const boundToken = String.raw`(?:\{(?:[^{}]|\{[^{}]*\})*\}|[A-Za-z0-9]+(?:_\{[^}]+\}|_[A-Za-z0-9]+)?)`;
  const groupedOperand = String.raw`\{((?:[^{}]|\{[^{}]*\})+)\}`;
  const simpleOperand = String.raw`([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?)`;
  const re = new RegExp(
    String.raw`\\int\s*(?:_(${boundToken}))?\s*(?:\^(${boundToken}))?\s*(?:\\,|\s)*\\mathrm\{d\}(?!')\s*(?:${groupedOperand}|${simpleOperand})`,
    "g"
  );
  const withExact = latex.replace(re, (_m, lower, upper, grouped, simple) => {
    const lowerPart = lower ? `_${lower}` : "";
    const upperPart = upper ? `^${upper}` : "";
    const operand = grouped ?? simple;
    return String.raw`\int${lowerPart}${upperPart} 1 \,\mathrm{d}{${operand}}`;
  });

  // Also handle inexact differentials: \int \mathrm{d}'{Q} and \int d'Q.
  const inexactRe = new RegExp(
    String.raw`\\int\s*(?:_(${boundToken}))?\s*(?:\^(${boundToken}))?\s*(?:\\,|\s)*(?:\\mathrm\{d\}'\s*(?:${groupedOperand}|${simpleOperand})|d'\s*([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?))`,
    "g"
  );
  return withExact.replace(inexactRe, (_m, lower, upper, grouped, simple, tight) => {
    const lowerPart = lower ? `_${lower}` : "";
    const upperPart = upper ? `^${upper}` : "";
    const v = grouped ?? simple ?? tight;
    return String.raw`\int${lowerPart}${upperPart} 1 \,\mathrm{d}'{${v}}`;
  });
}

function promotePartialFracToDfrac(latex: string): string {
  // Ensure \frac{\partial ...}{\partial ...} hits our custom derivative parser.
  // The CE built-in \frac path can collapse this shape in larger expressions.
  return latex.replace(/\\frac(?=\s*\{\s*\\partial\b)/g, "\\dfrac");
}

function promoteTightPlainDifferentials(latex: string): string {
  // Spacing rule:
  // - `dX` (no space) is interpreted as a differential token.
  // - `d X` (space) stays as multiplicative product.
  //
  // We rewrite tight forms before CE parsing because CE tokenization loses the
  // spacing distinction and normalizes both forms to InvisibleOperator("d","X").
  const tightDifferential =
    /(^|[^\\A-Za-z0-9_'])d([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?)(?![A-Za-z0-9_])/g;
  return latex.replace(tightDifferential, (_m, prefix: string, operand: string) => {
    return `${prefix}\\differentialD{${operand}}`;
  });
}

function promoteInexactDifferentials(latex: string): string {
  const fromCanonical = latex.replace(
    /\\mathrm\{d\}'\s*\{([^{}]+)\}/g,
    (_m, operand) => String.raw`\inexactDifferentialD{${operand}}`
  );
  const tightPrime =
    /(^|[^\\A-Za-z0-9_])d'([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?)(?![A-Za-z0-9_])/g;
  return fromCanonical.replace(tightPrime, (_m, prefix: string, operand: string) => {
    return `${prefix}${String.raw`\inexactDifferentialD{${operand}}`}`;
  });
}

function parseMixedSecondOrderPartialFraction(latex: string): MJ | null {
  const simpleOperand =
    String.raw`(?:\{([^{}]+)\}|([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)?))`;
  const pattern = new RegExp(
    String.raw`^\\(?:dfrac|frac)\s*\{\s*\\partial\^2\s*${simpleOperand}\s*\}\s*\{\s*\\partial\s*${simpleOperand}\s*\\partial\s*${simpleOperand}\s*\}\s*$`,
    "s"
  );
  const match = latex.match(pattern);
  if (!match) return null;

  const parseOperand = (fragment: string): MJ => {
    const parsed = (ce.parse(fragment, { canonical: false })?.json as MJ) ?? fragment;
    return normalizeMathJson(parsed) ?? fragment;
  };

  const numeratorLatex = (match[1] ?? match[2] ?? "").trim();
  const denominatorFirstLatex = (match[3] ?? match[4] ?? "").trim();
  const denominatorSecondLatex = (match[5] ?? match[6] ?? "").trim();
  if (!numeratorLatex || !denominatorFirstLatex || !denominatorSecondLatex) {
    return null;
  }

  const numerator = parseOperand(numeratorLatex);
  const denominatorFirst = parseOperand(denominatorFirstLatex);
  const denominatorSecond = parseOperand(denominatorSecondLatex);

  return [
    "Divide",
    ["Partial", ["Partial", numerator] as MJ] as MJ,
    [
      "InvisibleOperator",
      ["Partial", denominatorFirst] as MJ,
      ["Partial", denominatorSecond] as MJ,
    ] as MJ,
  ] as MJ;
}

export function parse(latex: string): MJ | null {
  const prefilled = injectImplicitOneInIntegrals(latex);
  const withPartialFractionsPromoted = promotePartialFracToDfrac(prefilled);
  const withTightDifferentials = promoteTightPlainDifferentials(
    withPartialFractionsPromoted
  );
  const withInexactDifferentials = promoteInexactDifferentials(withTightDifferentials);

  // Special-case bare differential integrals before general parsing.
  const special = parseIntegralWithDifferentialOnly(withInexactDifferentials);
  if (special) return special;
  const mixedSecondOrderPartial = parseMixedSecondOrderPartialFraction(
    withInexactDifferentials
  );
  if (mixedSecondOrderPartial) return mixedSecondOrderPartial;

  const prepared = normalizeVectorMacros(
    toMathLiveLatex(withInexactDifferentials)
  );
  const mj = (ce.parse(prepared, { canonical: false })?.json as MJ) ?? null;
  // Some rewrites (e.g. subscript rebinding after derivative-shape lowering)
  // become available only after an initial normalization pass.
  return normalizeMathJson(normalizeMathJson(mj));
}

export function normalizeMathJson(mj: MJ | null): MJ | null {
  return normalizeAssociativeMul(
    normalizeAssociativeAdd(
      collapseSingletonAdd(
        fixBlankIntegrals(
          normalizeTimeDerivatives(
            normalizeSubscriptLikeSymbols(
              normalizeSequenceEquationTail(
                normalizeSymbolHeadApplication(
                  normalizeLegacyExpNodes(
                    normalizeDotProducts(
                      normalizePrimeDifferentials(
                        rewriteNegateToFrontOfProduct(
                          normalizeDivideSigns(
                          normalizeDeltaOfQuantity(
                            normalizeDifferentialOperands(
                              normalizePrimeDifferentials(
                                normalizePlainDifferentials(
                                  normalizeIntegralTrailingDifferentialFactor(
                                    normalizeTrailingDerivativeSubscriptBinding(
                                      normalizePartialDerivativeForms(
                                        normalizeProducts(normalizeVectors(mj))
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
}

function normalizeTrailingDerivativeSubscriptBinding(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeTrailingDerivativeSubscriptBinding(child as MJ)) as MJ[];

  if (op !== "Subscript" || kids.length < 2) {
    return [op, ...kids] as MJ;
  }

  const base = kids[0] as MJ;
  const sub = kids[1] as MJ;
  if (
    !Array.isArray(base) ||
    (base[0] !== "InvisibleOperator" && base[0] !== "Multiply") ||
    base.length < 3
  ) {
    return [op, ...kids] as MJ;
  }

  const factors = base.slice(1) as MJ[];
  const trailing = factors[factors.length - 1] as MJ;
  const isTrailingDerivative =
    Array.isArray(trailing) &&
    (trailing[0] === "FractionPartialDerivative" ||
      trailing[0] === "FractionDerivative");
  if (!isTrailingDerivative) {
    return [op, ...kids] as MJ;
  }

  const reboundTarget =
    Array.isArray(trailing) && (trailing[0] === "Delimiter" || trailing[0] === "List")
      ? trailing
      : (["Delimiter", trailing] as MJ);
  const rebound = ["Subscript", reboundTarget, sub] as MJ;
  return ["InvisibleOperator", ...(factors.slice(0, -1) as MJ[]), rebound] as MJ;
}

function peelNegation(expr: MJ): { expr: MJ; isNegated: boolean } {
  let current: MJ = expr;
  while (Array.isArray(current) && current[0] === "Add" && current.length === 2) {
    current = current[1] as MJ;
  }
  if (Array.isArray(current) && current[0] === "Negate" && current.length >= 2) {
    return { expr: current[1] as MJ, isNegated: true };
  }
  return { expr: current, isNegated: false };
}

function normalizeDivideSigns(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeDivideSigns(child as MJ)) as MJ[];

  if (op === "Divide" && kids.length >= 2) {
    const num = peelNegation(kids[0] as MJ);
    const den = peelNegation(kids[1] as MJ);
    const divide = ["Divide", num.expr, den.expr] as MJ;
    return num.isNegated !== den.isNegated
      ? (["Negate", divide] as MJ)
      : divide;
  }

  return [op, ...kids] as MJ;
}

function normalizeSubscriptLikeSymbols(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (typeof mj === "string") {
    // Preserve style tokens such as H_script / H_calligraphic as atomic symbols.
    if (/^[A-Z]_(calligraphic|script)$/.test(mj)) return mj;
    const m = /^([A-Za-z]+)_([A-Za-z0-9_]+)$/.exec(mj);
    if (m) {
      const sub = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
      return ["Subscript", m[1], sub] as MJ;
    }
    // CE may compact some greek-with-numeric-subscript forms, e.g. \mu_0 -> "mu0".
    const compactGreekWithNumericSubscript =
      /^(alpha|beta|gamma|EulerGamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(\d+)$/.exec(
        mj
      );
    if (compactGreekWithNumericSubscript) {
      return [
        "Subscript",
        compactGreekWithNumericSubscript[1],
        Number(compactGreekWithNumericSubscript[2]),
      ] as MJ;
    }
    return mj;
  }
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeSubscriptLikeSymbols(child as MJ));
  return [op, ...kids] as MJ;
}

function normalizeTimeDerivatives(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeTimeDerivatives(child as MJ)) as MJ[];
  if (op === "D" && kids.length >= 2 && kids[1] === "t") {
    const inner = kids[0] as MJ;
    if (Array.isArray(inner) && inner[0] === "OverDot" && inner.length >= 2) {
      const existingCount =
        typeof inner[2] === "number" ? Number(inner[2]) : 1;
      return ["OverDot", inner[1] as MJ, existingCount + 1] as MJ;
    }
    if (
      Array.isArray(inner) &&
      inner[0] === "D" &&
      inner.length >= 3 &&
      (inner[2] as MJ) === "t"
    ) {
      return ["OverDot", inner[1] as MJ, 2] as MJ;
    }
    return ["OverDot", inner, 1] as MJ;
  }
  if (
    (op === "InvisibleOperator" || op === "Multiply") &&
    kids.length >= 3 &&
    kids[0] === "D" &&
    Array.isArray(kids[1]) &&
    (kids[1] as MJ[])[0] === "D" &&
    (kids[1] as MJ[]).length >= 3 &&
    (kids[1] as MJ[])[2] === "t" &&
    kids[2] === "t"
  ) {
    return ["OverDot", (kids[1] as MJ[])[1] as MJ, 2] as MJ;
  }
  if (
    (op === "InvisibleOperator" || op === "Multiply") &&
    kids.length >= 3 &&
    kids[0] === "D" &&
    kids[2] === "t"
  ) {
    return ["OverDot", kids[1] as MJ, 1] as MJ;
  }
  return [op, ...kids] as MJ;
}

function normalizeSymbolHeadApplication(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = String(mj[0]);
  const kids = mj
    .slice(1)
    .map((child) => normalizeSymbolHeadApplication(child as MJ)) as MJ[];
  if (
    op === "Power" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    /^[A-Za-z]$/.test(String((kids[0] as MJ[])[0])) &&
    (kids[0] as MJ[]).length >= 2
  ) {
    const baseApply = kids[0] as MJ[];
    return [
      "InvisibleOperator",
      baseApply[0] as MJ,
      ["Power", baseApply[1] as MJ, kids[1] as MJ] as MJ,
    ] as MJ;
  }
  if (
    op === "Power" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "InvisibleOperator" &&
    (kids[0] as MJ[]).length === 3 &&
    typeof (kids[0] as MJ[])[1] === "string" &&
    /^[A-Za-z]$/.test((kids[0] as MJ[])[1] as string)
  ) {
    const mulBase = kids[0] as MJ[];
    return [
      "InvisibleOperator",
      mulBase[1] as MJ,
      ["Power", mulBase[2] as MJ, kids[1] as MJ] as MJ,
    ] as MJ;
  }
  if (op === "D") {
    return [op, ...kids] as MJ;
  }
  if (/^[A-Za-z]$/.test(op) && kids.length >= 1) {
    return ["InvisibleOperator", op, ...kids] as MJ;
  }
  return [op, ...kids] as MJ;
}

function normalizeSequenceEquationTail(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeSequenceEquationTail(child as MJ)) as MJ[];
  if (
    op === "Sequence" &&
    kids.length >= 2 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "Equal" &&
    (kids[0] as MJ[]).length >= 3
  ) {
    const eq = kids[0] as MJ[];
    const rhsFactors: MJ[] = [eq[2] as MJ, ...(kids.slice(1) as MJ[])];
    const rhs =
      rhsFactors.length === 1
        ? rhsFactors[0]
        : (["InvisibleOperator", ...rhsFactors] as MJ);
    return ["Equal", eq[1] as MJ, rhs] as MJ;
  }
  return [op, ...kids] as MJ;
}

function normalizeLegacyExpNodes(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeLegacyExpNodes(child as MJ)) as MJ[];
  if (op === "Exp" && kids.length >= 1) {
    return ["InvisibleOperator", "Exp", kids[0] as MJ] as MJ;
  }
  return [op, ...kids] as MJ;
}

function normalizePrimeDifferentials(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizePrimeDifferentials(child as MJ)) as MJ[];

  if (op !== "InvisibleOperator" && op !== "Multiply") {
    return [op, ...kids] as MJ;
  }

  const out: MJ[] = [];
  const isDifferentialDLike = (expr: MJ): boolean => {
    if (expr === "d" || expr === "DifferentialD" || expr === "d_upright") return true;
    if (
      Array.isArray(expr) &&
      expr[0] === "Subscript" &&
      expr.length >= 3 &&
      expr[1] === "d" &&
      expr[2] === "upright"
    ) {
      return true;
    }
    return false;
  };
  const isPrimeDToken = (expr: MJ): boolean =>
    Array.isArray(expr) &&
    expr[0] === "Prime" &&
    isDifferentialDLike((expr as MJ[])[1] as MJ);

  const isPrimeDifferentialNode = (expr: MJ): expr is MJ =>
    Array.isArray(expr) &&
    expr[0] === "Prime" &&
    Array.isArray(expr[1]) &&
    (expr[1] as MJ[])[0] === "Differential" &&
    (expr[1] as MJ[])[1] !== undefined;

  for (let i = 0; i < kids.length; i += 1) {
    const cur = kids[i] as MJ;
    const next = kids[i + 1] as MJ | undefined;

    if (isPrimeDifferentialNode(cur)) {
      const primeNode = cur as MJ[];
      out.push(["InexactDifferential", (primeNode[1] as MJ[])[1] as MJ] as MJ);
      continue;
    }
    if (isPrimeDToken(cur) && next !== undefined) {
      out.push(["InexactDifferential", next] as MJ);
      i += 1;
      continue;
    }
    if (next !== undefined && isPrimeDToken(next)) {
      out.push(["InexactDifferential", cur] as MJ);
      i += 1;
      continue;
    }
    out.push(cur);
  }

  if (out.length === 1) return out[0] as MJ;
  return ["InvisibleOperator", ...out] as MJ;
}

function collapseSingletonAdd(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => collapseSingletonAdd(child as MJ)) as MJ[];
  if (op === "Add" && kids.length === 1) return kids[0] as MJ;
  return [op, ...kids] as MJ;
}

function unwrapSingleDelimiter(expr: MJ): MJ {
  if (
    Array.isArray(expr) &&
    (expr[0] === "Delimiter" || expr[0] === "List") &&
    expr.length >= 2
  ) {
    return expr[1] as MJ;
  }
  return expr;
}

function normalizeDifferentialOperands(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeDifferentialOperands(child as MJ)) as MJ[];

  if ((op === "Differential" || op === "InexactDifferential") && kids.length >= 1) {
    return [op, kids[0] as MJ] as MJ;
  }
  return [op, ...kids] as MJ;
}

function normalizeAssociativeAdd(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeAssociativeAdd(child as MJ)) as MJ[];
  if (op !== "Add") return [op, ...kids] as MJ;

  const flat: MJ[] = [];
  for (const child of kids) {
    if (Array.isArray(child) && child[0] === "Add") {
      flat.push(...(child.slice(1) as MJ[]));
    } else {
      flat.push(child);
    }
  }
  if (flat.length === 0) return 0;
  if (flat.length === 1) return flat[0];
  return ["Add", ...flat] as MJ;
}

function normalizeAssociativeMul(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeAssociativeMul(child as MJ)) as MJ[];
  if (op !== "InvisibleOperator" && op !== "Multiply") {
    return [op, ...kids] as MJ;
  }

  const flat: MJ[] = [];
  for (const child of kids) {
    if (
      Array.isArray(child) &&
      (child[0] === "InvisibleOperator" || child[0] === "Multiply")
    ) {
      flat.push(...(child.slice(1) as MJ[]));
    } else {
      flat.push(child);
    }
  }
  if (flat.length === 0) return 1;
  if (flat.length === 1) return flat[0];
  return ["InvisibleOperator", ...flat] as MJ;
}

function unwrapNothingPair(expr: MJ): MJ {
  if (
    Array.isArray(expr) &&
    expr.length >= 2 &&
    expr[1] === "Nothing" &&
    typeof expr[0] === "string"
  ) {
    return expr[0] as MJ;
  }
  return expr;
}

function normalizePartialDerivativeForms(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj.slice(1).map((child) =>
    normalizePartialDerivativeForms(child as MJ)
  ) as MJ[];

  const isPartial = (expr: MJ | null | undefined): expr is MJ =>
    Array.isArray(expr) && expr[0] === "Partial";
  const isDifferential = (expr: MJ | null | undefined): expr is MJ =>
    Array.isArray(expr) && expr[0] === "Differential";
  const extractPartialOperand = (expr: MJ | null | undefined): MJ | null => {
    if (expr == null) return null;
    const unwrapped = unwrapNothingPair(expr);
    if (!Array.isArray(unwrapped)) return null;

    if (unwrapped[0] === "Partial") {
      return (unwrapped[1] ?? null) as MJ | null;
    }
    if (unwrapped[0] === "PartialDerivative") {
      const raw = unwrapNothingPair((unwrapped[1] ?? "Nothing") as MJ);
      return raw === "Nothing" ? null : (raw as MJ);
    }
    if (unwrapped[0] === "InvisibleOperator" || unwrapped[0] === "Multiply") {
      const factors = unwrapped.slice(1) as MJ[];
      if (factors.length < 2) return null;
      const first = unwrapNothingPair(factors[0] as MJ);
      if (first === "PartialD") return factors[1] as MJ;
      if (Array.isArray(first) && first[0] === "Partial") {
        return (first[1] ?? null) as MJ | null;
      }
      if (Array.isArray(first) && first[0] === "PartialDerivative") {
        return factors[1] as MJ;
      }
    }
    return null;
  };

  if (op === "Divide" && kids.length >= 2) {
    const num = kids[0] as MJ;
    const den = kids[1] as MJ;
    const numPartialOperand = extractPartialOperand(num);
    const denPartialOperand = extractPartialOperand(den);
    if (numPartialOperand && denPartialOperand) {
      return [
        "FractionPartialDerivative",
        ["Partial", numPartialOperand] as MJ,
        ["Partial", denPartialOperand] as MJ,
      ] as MJ;
    }
    if (isPartial(num) && isPartial(den)) {
      return ["FractionPartialDerivative", num, den] as MJ;
    }
    if (isDifferential(num) && isDifferential(den)) {
      return ["FractionDerivative", num, den] as MJ;
    }
  }

  if (op === "PartialDerivative") {
    const rawNumerator = unwrapNothingPair((kids[0] ?? "Nothing") as MJ);
    const rawDenominator = unwrapNothingPair((kids[1] ?? "Nothing") as MJ);
    const hasNumerator = rawNumerator !== "Nothing";
    const hasDenominator = rawDenominator !== "Nothing";

    if (!hasNumerator) return "PartialD";
    if (hasDenominator) {
      return [
        "FractionPartialDerivative",
        ["Partial", rawNumerator] as MJ,
        ["Partial", rawDenominator] as MJ,
      ] as MJ;
    }
    return ["Partial", rawNumerator] as MJ;
  }

  if ((op === "InvisibleOperator" || op === "Multiply") && kids.length >= 2) {
    const first = unwrapNothingPair((kids[0] ?? null) as MJ);
    if (first === "PartialD") {
      return ["Partial", kids[1] as MJ] as MJ;
    }
  }

  return [op, ...kids] as MJ;
}

function normalizePlainDifferentials(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj.slice(1).map((child) =>
    normalizePlainDifferentials(child as MJ)
  ) as MJ[];

  if (op !== "InvisibleOperator" && op !== "Multiply") {
    return [op, ...kids] as MJ;
  }

  const out: MJ[] = [];
  const isDifferentialDLike = (expr: MJ): boolean => {
    if (expr === "d" || expr === "DifferentialD" || expr === "d_upright") return true;
    if (
      Array.isArray(expr) &&
      expr[0] === "Subscript" &&
      expr.length >= 3 &&
      expr[1] === "d" &&
      expr[2] === "upright"
    ) {
      return true;
    }
    return false;
  };
  const isUppercaseDifferentialOperand = (expr: MJ | null | undefined): boolean => {
    if (expr == null) return false;
    if (typeof expr === "string") return /^[A-Z]$/.test(expr);
    if (
      Array.isArray(expr) &&
      expr[0] === "Subscript" &&
      typeof expr[1] === "string"
    ) {
      return /^[A-Z]$/.test(expr[1] as string);
    }
    return false;
  };
  const isFactorLike = (expr: MJ | null): boolean => {
    if (expr == null) return false;
    if (!Array.isArray(expr)) return true;
    const op = expr[0];
    return (
      op !== "Add" &&
      op !== "Equal" &&
      op !== "Tuple" &&
      op !== "HorizontalSpacing"
    );
  };
  for (let i = 0; i < kids.length; i += 1) {
    const cur = kids[i];
    const next = kids[i + 1];
    const prev = i > 0 ? kids[i - 1] : null;
    const curIsPlainD = cur === "d";
    const curIsPrimeD =
      Array.isArray(cur) &&
      cur[0] === "Prime" &&
      isDifferentialDLike(cur[1] as MJ);
    const curIsPrimeDifferentialNode =
      Array.isArray(cur) &&
      cur[0] === "Prime" &&
      Array.isArray(cur[1]) &&
      cur[1][0] === "Differential" &&
      cur[1][1] !== undefined;
    const canCombine = next !== undefined;
    const followsExplicitSpacing =
      Array.isArray(prev) && prev[0] === "HorizontalSpacing";
    // Plain "d x" with a literal space should remain multiplicative.
    // Tight forms (dX) are promoted earlier in parse() via \differentialD.
    // Do not infer a differential after an existing factor, otherwise
    // products like "c d e" get misread as c * d(e).
    const allowedContextForPlainD =
      followsExplicitSpacing || isUppercaseDifferentialOperand(next as MJ);
    if (curIsPrimeDifferentialNode) {
      out.push(["InexactDifferential", (cur[1] as MJ[])[1]] as MJ);
      continue;
    }

    if (
      curIsPrimeD &&
      canCombine
    ) {
      out.push(["InexactDifferential", next] as MJ);
      i += 1;
      continue;
    }

    if (
      curIsPlainD &&
      canCombine &&
      allowedContextForPlainD
    ) {
      out.push(["Differential", next] as MJ);
      i += 1;
      continue;
    }

    out.push(cur);
  }

  if (out.length === 1) return out[0];
  return ["InvisibleOperator", ...out] as MJ;
}

function normalizeIntegralTrailingDifferentialFactor(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj
    .slice(1)
    .map((child) => normalizeIntegralTrailingDifferentialFactor(child as MJ)) as MJ[];

  if (op !== "InvisibleOperator" && op !== "Multiply") {
    return [op, ...kids] as MJ;
  }

  const factors = [...kids];
  const isDiffOperandLike = (expr: MJ): boolean =>
    typeof expr === "string" ||
    (Array.isArray(expr) &&
      expr[0] === "Subscript" &&
      (typeof expr[1] === "string" || Array.isArray(expr[1])));

  const foldIntoIntegrate = (integral: MJ, operand: MJ): MJ | null => {
    if (!Array.isArray(integral) || integral[0] !== "Integrate") return null;
    if (integral.length < 3) return null;
    const integrand = integral[1] as MJ;
    const domain = integral[2] as MJ;

    if (domain === "Nothing") {
      return ["Integrate", integrand, operand] as MJ;
    }
    if (!Array.isArray(domain) || domain[0] !== "Tuple") return null;
    if ((domain[1] as MJ) !== "Nothing") return null;

    const updatedTuple = ["Tuple", operand, ...(domain.slice(2) as MJ[])] as MJ;
    return ["Integrate", integrand, updatedTuple] as MJ;
  };

  for (let i = 0; i < factors.length - 1; i += 1) {
    const integral = factors[i] as MJ;
    const candidateOperand = factors[i + 1] as MJ;
    if (!isDiffOperandLike(candidateOperand)) continue;
    const folded = foldIntoIntegrate(integral, candidateOperand);
    if (!folded) continue;
    factors.splice(i, 2, folded);
    i -= 1;
  }

  if (factors.length === 0) return 1;
  if (factors.length === 1) return factors[0] as MJ;
  return ["InvisibleOperator", ...factors] as MJ;
}

const inexactDifferentialEntry: LatexDictionaryEntry = {
  name: "InexactDifferential",
  kind: "expression",
  latexTrigger: "\\inexactDifferentialD",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return ["InexactDifferential", "Nothing"];
    return ["InexactDifferential", arg];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return String.raw`\mathrm{d}'`;
    const operand = (expr[1] ?? null) as Expression | null;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\mathrm{d}'{${inner}}`;
  },
};

function normalizeDeltaOfQuantity(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeDeltaOfQuantity(child as MJ));

  if (op !== "InvisibleOperator" && op !== "Multiply") {
    return [op, ...kids] as MJ;
  }

  const factors = [...(kids as MJ[])];
  const out: MJ[] = [];

  for (let i = 0; i < factors.length; i += 1) {
    const cur = factors[i];
    const next = factors[i + 1];
    const isCurDelta = cur === "Delta" || cur === String.raw`\Delta`;
    const hasNextQuantity = next !== undefined;
    if (isCurDelta && hasNextQuantity) {
      out.push(["DeltaOfQuantity", next] as MJ);
      i += 1;
      continue;
    }
    out.push(cur);
  }

  if (out.length === 1) return out[0];
  return ["InvisibleOperator", ...out] as MJ;
}

function rewriteNegateToFrontOfProduct(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];

  if (op === "Multiply" || op === "InvisibleOperator") {
    let negateCount = 0;
    const factors: MJ[] = [];

    for (let i = 1; i < mj.length; i += 1) {
      const rewritten = rewriteNegateToFrontOfProduct(mj[i] as MJ);
      let current = rewritten as MJ | null;
      while (Array.isArray(current) && current[0] === "Negate") {
        negateCount += 1;
        current = (current.length > 1 ? (current[1] as MJ) : null) ?? null;
      }
      factors.push(current as MJ);
    }

    const product = [op, ...factors] as MJ;
    return negateCount % 2 === 1 ? (["Negate", product] as MJ) : product;
  }

  const rewrittenKids = mj
    .slice(1)
    .map((child) => rewriteNegateToFrontOfProduct(child as MJ));
  return [op, ...rewrittenKids] as MJ;
}

function normalizeVectors(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeVectors(child as MJ));
  if (
    op === "Matrix" &&
    kids.length === 1 &&
    Array.isArray(kids[0]) &&
    (kids[0] as MJ[])[0] === "List"
  ) {
    const rows = (kids[0] as MJ[]).slice(1) as MJ[];
    if (
      rows.length === 1 &&
      Array.isArray(rows[0]) &&
      (rows[0] as MJ[])[0] === "List"
    ) {
      const cols = (rows[0] as MJ[]).slice(1) as MJ[];
      if (cols.length === 1) {
        return ["Vector", cols[0] as MJ] as MJ;
      }
    }
  }
  const newOp = op === "OverVector" ? ("Vector" as const) : op;
  return [newOp, ...kids] as MJ;
}

function normalizeProducts(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeProducts(child as MJ));
  if (op === "Multiply") {
    return ["InvisibleOperator", ...kids] as MJ;
  }
  return [op, ...kids] as MJ;
}

function containsVector(expr: MJ | null): boolean {
  if (expr === null || expr === undefined) return false;
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Vector" || expr[0] === "OverVector") return true;
  return expr.slice(1).some((c) => containsVector(c as MJ));
}

function buildProduct(factors: MJ[]): MJ | null {
  if (factors.length === 0) return null;
  if (factors.length === 1) return factors[0];
  return ["InvisibleOperator", ...factors] as MJ;
}

function normalizeDotProducts(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeDotProducts(child as MJ));

  // Preserve dot-product operand structure; avoid lifting scalar factors outward.
  if (op === "DotProduct") {
    return ["DotProduct", ...kids] as MJ;
  }

  // Convert implicit products that include (at least) two vector-containing factors
  // into a DotProduct, but keep scalars where they originally appeared.
  if (op === "InvisibleOperator") {
    const factors = kids as MJ[];
    const vectorIndexes = factors
      .map((f, i) => (containsVector(f) ? i : -1))
      .filter((i) => i >= 0);

    if (vectorIndexes.length >= 2) {
      const first = vectorIndexes[0];
      const last = vectorIndexes[vectorIndexes.length - 1];

      const left = factors[first];
      const rightFactors = factors.slice(first + 1);
      const right = buildProduct(rightFactors) ?? factors[last];

      const before = factors.slice(0, first);
      const after = factors.slice(last + 1);

      const dot: MJ = ["DotProduct", left, right];
      const combined: MJ[] = [...before, dot, ...after];

      if (combined.length === 1) return dot;
      return ["InvisibleOperator", ...combined] as MJ;
    }

    return [op, ...kids] as MJ;
  }

  return [op, ...kids] as MJ;
}

function findSubscriptX(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return null;
  if (!Array.isArray(mj)) return null;
  if (mj[0] === "Subscript" && mj[1] === "x") return mj;
  for (const child of mj.slice(1)) {
    const found = findSubscriptX(child as MJ);
    if (found) return found;
  }
  return null;
}

function fixBlankIntegrals(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => fixBlankIntegrals(child as MJ));

  if (op === "Integrate") {
    const integrand = kids[0];
    const badIntegrand =
      (Array.isArray(integrand) &&
        (integrand[0] === "LatexString" ||
          integrand[0] === "HorizontalSpacing" ||
          integrand[0] === "Error")) ||
      (typeof integrand === "string" &&
        integrand.toLowerCase().includes("unexpected-command"));

    if (badIntegrand) {
      kids[0] = 1;
    }
    if (
      Array.isArray(kids[0]) &&
      (kids[0][0] === "InvisibleOperator" || kids[0][0] === "Multiply")
    ) {
      const factors = (kids[0] as MJ[]).slice(1).filter((factor) => factor !== 1) as MJ[];
      if (factors.length === 0) {
        kids[0] = 1;
      } else if (factors.length === 1) {
        kids[0] = factors[0] as MJ;
      } else {
        kids[0] = ["InvisibleOperator", ...factors] as MJ;
      }
    }
    const tuple = kids[1];
    if (Array.isArray(tuple) && tuple[0] === "Tuple") {
      const upperCandidate = findSubscriptX(mj);
      const normalizedTuple: MJ[] = [
        "Tuple",
        tuple[1] !== undefined ? (tuple[1] as MJ) : ("Nothing" as MJ),
      ];
      if (tuple.length >= 3) {
        normalizedTuple.push(
          tuple[2] !== undefined ? (tuple[2] as MJ) : ("Nothing" as MJ)
        );
      }
      if (tuple.length >= 4) {
        normalizedTuple.push(
          tuple[3] !== undefined
            ? (tuple[3] as MJ)
            : ((upperCandidate ?? "Nothing") as MJ)
        );
      }

      kids[1] = normalizedTuple as MJ;
    }
    return ["Integrate", ...kids] as MJ;
  }

  return [op, ...kids] as MJ;
}

export function box(mj: MJ) {
  return ce.box(mj);
}

function collectSymbolsForScope(
  expr: MJ | null | undefined,
  acc: Set<string>,
  isHead = false
) {
  if (expr === null || expr === undefined) return;
  if (Array.isArray(expr)) {
    expr.forEach((child, i) => collectSymbolsForScope(child as MJ, acc, i === 0));
    return;
  }
  if (typeof expr === "string" && !isHead) {
    acc.add(expr);
  }
}

const CE_BUILTIN_CONSTANT_SYMBOLS = new Set<string>([
  "ExponentialE",
  "Pi",
  "ImaginaryUnit",
  "ComplexInfinity",
  "NotANumber",
  "EulerGamma",
  "CatalanConstant",
  "GoldenRatio",
]);

export function withRealScope<T>(expr: MJ, run: (ce: ComputeEngine) => T): T {
  const symbols = new Set<string>();
  collectSymbolsForScope(expr, symbols);

  ce.pushScope();
  try {
    for (const sym of symbols) {
      // Skip strings that look numeric to avoid redeclaring literals.
      if (/^-?\d+(?:\.\d+)?$/.test(sym)) continue;
      // Synthetic subscript placeholders are transport tokens, not symbols.
      if (sym.startsWith("__pd_sub__")) continue;
      // Preserve CE built-in mathematical constants.
      if (CE_BUILTIN_CONSTANT_SYMBOLS.has(sym)) continue;
      ce.declare(sym, "real");
    }
    return run(ce);
  } finally {
    ce.popScope();
  }
}

function unwrapGroup(expr: Expression | null): Expression | null {
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    return expr[1] as Expression;
  }
  return expr;
}

function extractDerivativeOperand(
  expr: Expression | null
): { kind: "d" | "partial"; operand: Expression } | null {
  const inner = unwrapGroup(expr);

  if (Array.isArray(inner) && inner[0] === "Differential") {
    return { kind: "d", operand: (inner[1] as Expression) ?? inner[1] };
  }

  if (Array.isArray(inner) && inner[0] === "Partial") {
    return { kind: "partial", operand: (inner[1] as Expression) ?? inner[1] };
  }

  if (
    Array.isArray(inner) &&
    inner[0] === "InvisibleOperator" &&
    Array.isArray(inner[1]) &&
    inner[1][0] === "PartialDerivative" &&
    inner.length >= 3
  ) {
    // CE base dictionary emits this shape for \partial f
    return { kind: "partial", operand: inner[2] as Expression };
  }

  if (Array.isArray(inner) && inner[0] === "Power") {
    const base = inner[1];
    const exp = inner[2];
    if (Array.isArray(base) && base[0] === "Differential") {
      return {
        kind: "d",
        operand: ["Power", base[1] as Expression, exp] as Expression,
      };
    }
    if (Array.isArray(base) && base[0] === "Partial") {
      return {
        kind: "partial",
        operand: ["Power", base[1] as Expression, exp] as Expression,
      };
    }
    if (base === "DifferentialD") {
      return { kind: "d", operand: ["Power", "1", exp] as Expression };
    }
  }

  if (
    Array.isArray(inner) &&
    (inner[0] === "Multiply" || inner[0] === "InvisibleOperator")
  ) {
    const factors = inner.slice(1);
    const first = factors[0];

    const isDiffD = first === "DifferentialD";
    const isDiffNode = Array.isArray(first) && first[0] === "Differential";
    const isPartial = Array.isArray(first) && first[0] === "Partial";

    if ((isDiffD || isDiffNode || isPartial) && factors.length >= 2) {
      const op = inner[0] as string;
      const base =
        isDiffNode && Array.isArray(first) && first[1]
          ? (first[1] as Expression)
          : isPartial && Array.isArray(first) && first[1]
          ? (first[1] as Expression)
          : (factors[1] as Expression);

      const kind = isPartial ? "partial" : "d";
      return { kind, operand: [op, base, ...factors.slice(1)] as Expression };
    }
  }

  if (Array.isArray(inner) && inner[0] === "DifferentialD" && inner[1]) {
    return { kind: "d", operand: inner[1] as Expression };
  }

  if (inner === "PartialD") {
    return { kind: "partial", operand: "1" as Expression };
  }

  return null;
}

const differentialEntry: LatexDictionaryEntry = {
  name: "Differential",
  kind: "expression",
  latexTrigger: "\\differentialD",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return "DifferentialD";
    return ["Differential", arg];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return "\\mathrm{d}";
    const operand = expr[1] as Expression;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\\mathrm{d}{${inner}}`;
  },
};

const partialEntry: LatexDictionaryEntry = {
  name: "Partial",
  kind: "expression",
  latexTrigger: "\\partial",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return "PartialD";
    return ["Partial", arg];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return "\\partial";
    const operand = expr[1] as Expression;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\\partial{${inner}}`;
  },
};

const fractionDerivativeEntry: LatexDictionaryEntry = {
  name: "FractionDerivative",
  kind: "expression",
  latexTrigger: "\\dfrac",
  parse: (parser) => {
    const numerator = parser.parseGroup() ?? parser.parseToken();
    const denominator = parser.parseGroup() ?? parser.parseToken();

    if (!numerator || !denominator) return null;

    const numOperand = extractDerivativeOperand(numerator);
    const denOperand = extractDerivativeOperand(denominator);

    if (
      numOperand &&
      denOperand &&
      numOperand.kind === "d" &&
      denOperand.kind === "d"
    ) {
      return [
        "FractionDerivative",
        ["Differential", numOperand.operand],
        ["Differential", denOperand.operand],
      ];
    }

    if (
      numOperand &&
      denOperand &&
      numOperand.kind === "partial" &&
      denOperand.kind === "partial"
    ) {
      return [
        "FractionPartialDerivative",
        ["Partial", numOperand.operand],
        ["Partial", denOperand.operand],
      ];
    }

    return ["Divide", numerator, denominator];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);

    const numerator = expr[1] as Expression;
    const denominator = expr[2] as Expression;

    const renderDifferential = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Differential") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\mathrm{d}{${innerLatex}}`;
      }
      // If it isn't wrapped, still render the operand and prepend d.
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\mathrm{d}{${innerLatex}}`;
    };

    const renderPartial = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Partial") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\partial{${innerLatex}}`;
      }
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\partial{${innerLatex}}`;
    };

    const isPartial =
      Array.isArray(expr) && expr[0] === "FractionPartialDerivative";

    const render = isPartial ? renderPartial : renderDifferential;

    const numLatex = render(numerator);
    const denLatex = render(denominator);

    return String.raw`\\dfrac{${numLatex}}{${denLatex}}`;
  },
};

const fractionDerivativeFracEntry: LatexDictionaryEntry = {
  name: "FractionDerivativeFrac",
  kind: "expression",
  latexTrigger: "\\frac",
  parse: fractionDerivativeEntry.parse,
  serialize: fractionDerivativeEntry.serialize,
};

const fractionPartialDerivativeEntry: LatexDictionaryEntry = {
  name: "FractionPartialDerivative",
  kind: "expression",
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);
    const numerator = expr[1] as Expression;
    const denominator = expr[2] as Expression;

    const renderPartial = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Partial") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\partial{${innerLatex}}`;
      }
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\partial{${innerLatex}}`;
    };

    const numLatex = renderPartial(numerator);
    const denLatex = renderPartial(denominator);

    return String.raw`\\dfrac{${numLatex}}{${denLatex}}`;
  },
};

const dotEntry: LatexDictionaryEntry = {
  name: "DotProduct",
  kind: "infix",
  latexTrigger: "\\cdot",
  precedence: 390,
  associativity: "left",
  parse: (
    parser: any,
    lhs: Expression | null
  ): Expression | null => {
    if (!lhs) return null;
    const rhs = parser.parseExpression({ minPrec: 390 }) as
      | Expression
      | null;
    if (!rhs) return null;
    return ["DotProduct", lhs, rhs] as unknown as Expression;
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);
    const lhs = serializer.wrap(expr[1] as Expression, 390);
    const rhs = serializer.wrap(expr[2] as Expression, 390);
    return `${lhs} \\\\cdot ${rhs}`;
  },
};

const overDotEntry: LatexDictionaryEntry = {
  name: "OverDot",
  kind: "expression",
  latexTrigger: "\\dot",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["OverDot", arg, 1];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) {
      const inner = serializer.wrap(expr, 0);
      return String.raw`\\dot{${inner}}`;
    }
    const inner = serializer.wrap(expr[1] as Expression, 0);
    const count = typeof expr[2] === "number" ? Number(expr[2]) : 1;
    return count >= 2
      ? String.raw`\\ddot{${inner}}`
      : String.raw`\\dot{${inner}}`;
  },
};

const vectorEntry: LatexDictionaryEntry = {
  name: "Vector",
  kind: "expression",
  latexTrigger: "\\vec",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["Vector", arg];
  },
  serialize: (serializer, expr) => {
    const inner = Array.isArray(expr)
      ? serializer.wrap(expr[1] as Expression, 0)
      : serializer.wrap(expr, 0);
    return String.raw`\\vec{${inner}}`;
  },
};

const ddotEntry: LatexDictionaryEntry = {
  name: "DoubleOverDot",
  kind: "expression",
  latexTrigger: "\\ddot",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["OverDot", arg, 2];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) {
      const inner = serializer.wrap(expr, 0);
      return String.raw`\\ddot{${inner}}`;
    }
    const inner = serializer.wrap(expr[1] as Expression, 0);
    return String.raw`\\ddot{${inner}}`;
  },
};

// Handle bare DifferentialD symbols (without an operand) to render upright d.
const differentialDSymbolEntry: LatexDictionaryEntry = {
  name: "DifferentialD",
  kind: "symbol",
  serialize: () => "\\mathrm{d}",
};

// Parse and serialize quantity deltas like \Delta E as one semantic object.
const deltaOfQuantityEntry: LatexDictionaryEntry = {
  name: "DeltaOfQuantity",
  kind: "expression",
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return String.raw`\Delta`;
    const operand = (expr[1] ?? null) as Expression | null;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\Delta ${inner}`;
  },
};

const ce = new ComputeEngine();

declare global {
  interface Window {
    __ce?: ComputeEngine;
  }
}

if (typeof window !== "undefined") {
  window.__ce = ce;
}

const baseDictionary = ComputeEngine.getLatexDictionary("all").filter(
  (entry) =>
    entry.name !== "Vector" &&
    entry.name !== "DifferentialD" &&
    (entry as any).latexTrigger !== "\\cdot"
);

export function evaluateRaw(mj: MJ) {
  const boxed = box(mj);
  return boxed?.evaluate();
}

ce.latexDictionary = [
  deltaOfQuantityEntry,
  inexactDifferentialEntry,
  vectorEntry,
  partialEntry,
  differentialEntry,
  fractionPartialDerivativeEntry,
  fractionDerivativeEntry,
  fractionDerivativeFracEntry,
  overDotEntry,
  dotEntry,
  ddotEntry,
  differentialDSymbolEntry,
  ...baseDictionary,
];
