import type { TermSelection } from "../../selection/types";
import {
  absoluteValue,
  add,
  call,
  differential,
  displayGroup,
  divide,
  multiply,
  num,
  partialAtConstQuantity,
  partialDerivative,
  partialDerivativeOperator,
  fullDerivativeOperator,
  power,
  secondOrderPartialDerivative,
  sym,
  type Expr,
} from "../ast";
import { cloneExpr } from "../ast/utils";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
import { flipSign, splitSign, structuralKeyIgnoringDisplayGroups } from "./algebraUtils";
import { getSelectionRewriteTarget, replaceSelectionWithExpr } from "./selectionRewrite";

export type IdentityRewrite = {
  id: string;
  label: string;
  latex: string;
  caveat?: string;
  defaultPriority: number;
  apply: (expr: Expr) => Expr | null;
};

export type IdentityRewriteOption = Omit<IdentityRewrite, "apply">;

const POSITIVE_LOG_CAVEAT = "Assumes the log arguments are positive.";
const POWER_BRANCH_CAVEAT = "Branch/domain-sensitive; generally safe for positive real bases.";
const ANGLE_IDENTITY_CAVEAT = "Uses the standard angle identity.";
const POSITIVE_BASE_CAVEAT = "Assumes the squared expression is positive.";

const IDENTITY_REWRITES: IdentityRewrite[] = [
  {
    id: "pythagorean-trig-identity",
    label: "sin^2(theta) + cos^2(theta) -> 1",
    latex: String.raw`\sin^{2}\theta + \cos^{2}\theta \to 1`,
    defaultPriority: 110,
    apply: pythagoreanTrigIdentity,
  },
  {
    id: "cos-square-power-reduction",
    label: "cos^2(theta) -> (1 + cos(2 theta))/2",
    latex: String.raw`\cos^{2}\theta \to \frac{1 + \cos\left(2\theta\right)}{2}`,
    defaultPriority: 45,
    apply: cosSquarePowerReduction,
  },
  {
    id: "sin-square-power-reduction",
    label: "sin^2(theta) -> (1 - cos(2 theta))/2",
    latex: String.raw`\sin^{2}\theta \to \frac{1 - \cos\left(2\theta\right)}{2}`,
    defaultPriority: 45,
    apply: sinSquarePowerReduction,
  },
  {
    id: "integral-sum-rule",
    label: "int(f + g) dx -> int f dx + int g dx",
    latex: String.raw`\int \left(f + g\right)\,dx \to \int f\,dx + \int g\,dx`,
    defaultPriority: 99,
    apply: integralSumRule,
  },
  {
    id: "differential-sum-rule",
    label: "d(f + g) -> df + dg",
    latex: String.raw`\mathrm{d}\left(f + g\right) \to \mathrm{d}{f} + \mathrm{d}{g}`,
    defaultPriority: 98,
    apply: differentialSumRule,
  },
  {
    id: "simplify-grouped-differential-operand",
    label: "d(x) -> dx",
    latex: String.raw`\mathrm{d}\left(x\right) \to \mathrm{d}{x}`,
    defaultPriority: 98,
    apply: simplifyGroupedDifferentialOperand,
  },
  {
    id: "derivative-sum-rule",
    label: "d(f + g) -> df + dg",
    latex: String.raw`\frac{d}{dx}\left(f + g\right) \to \frac{df}{dx} + \frac{dg}{dx}`,
    defaultPriority: 97,
    apply: derivativeSumRule,
  },
  {
    id: "nested-partial-to-second-partial",
    label: "d/dx(df/dx) -> d^2f/dx^2",
    latex: String.raw`\frac{\partial}{\partial x}\left(\frac{\partial f}{\partial x}\right) \to \frac{\partial^{2}f}{\partial x^{2}}`,
    defaultPriority: 96,
    apply: nestedPartialToSecondPartial,
  },
  {
    id: "partial-at-constant-reciprocal",
    label: "(dS/dU)_L -> 1/(dU/dS)_L",
    latex: String.raw`\left(\frac{\partial S}{\partial U}\right)_{L} \to \frac{1}{\left(\frac{\partial U}{\partial S}\right)_{L}}`,
    defaultPriority: 96,
    apply: partialAtConstantReciprocal,
  },
  {
    id: "derivative-product-rule",
    label: "d(f g) -> g df + f dg",
    latex: String.raw`\frac{d}{dx}\left(fg\right) \to g\frac{df}{dx} + f\frac{dg}{dx}`,
    defaultPriority: 95,
    apply: derivativeProductRule,
  },
  {
    id: "differential-product-rule",
    label: "d(f g) -> g df + f dg",
    latex: String.raw`\mathrm{d}\left(fg\right) \to g\,\mathrm{d}{f} + f\,\mathrm{d}{g}`,
    defaultPriority: 95,
    apply: differentialProductRule,
  },
  {
    id: "derivative-quotient-as-product-rule",
    label: "d(f / g) -> 1/g df + f d(1/g)",
    latex: String.raw`\frac{d}{dx}\left(\frac{f}{g}\right) \to \frac{1}{g}\frac{df}{dx} + f\frac{d}{dx}\left(\frac{1}{g}\right)`,
    defaultPriority: 94,
    apply: derivativeQuotientAsProductRule,
  },
  {
    id: "differential-quotient-rule",
    label: "d(f / g) -> 1/g df - f/g^2 dg",
    latex: String.raw`\mathrm{d}\left(\frac{f}{g}\right) \to \frac{1}{g}\mathrm{d}{f} - \frac{f}{g^{2}}\mathrm{d}{g}`,
    defaultPriority: 94,
    apply: differentialQuotientRule,
  },
  {
    id: "derivative-reciprocal-rule",
    label: "d(1/f) -> -1/f^2 df",
    latex: String.raw`\frac{d}{dx}\left(\frac{1}{f}\right) \to -\frac{1}{f^{2}}\frac{df}{dx}`,
    defaultPriority: 93,
    apply: derivativeReciprocalRule,
  },
  {
    id: "distribute-sum-over-denominator",
    label: "(a + b + c) / e -> a/e + b/e + c/e",
    latex: String.raw`\frac{a + b + c}{e} \to \frac{a}{e} + \frac{b}{e} + \frac{c}{e}`,
    defaultPriority: 92,
    apply: distributeSumOverDenominator,
  },
  {
    id: "combine-natural-logs",
    label: "ln a + ln b -> ln(a b)",
    latex: String.raw`\ln a + \ln b \to \ln\left(ab\right)`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 100,
    apply: combineNaturalLogs,
  },
  {
    id: "combine-natural-log-quotient",
    label: "ln a - ln b -> ln(a / b)",
    latex: String.raw`\ln a - \ln b \to \ln\left(\frac{a}{b}\right)`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 100,
    apply: combineNaturalLogQuotient,
  },
  {
    id: "expand-natural-log-product",
    label: "ln(a b) -> ln a + ln b",
    latex: String.raw`\ln\left(ab\right) \to \ln a + \ln b`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 90,
    apply: expandNaturalLogProduct,
  },
  {
    id: "expand-natural-log-quotient",
    label: "ln(a / b) -> ln a - ln b",
    latex: String.raw`\ln\left(\frac{a}{b}\right) \to \ln a - \ln b`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 90,
    apply: expandNaturalLogQuotient,
  },
  {
    id: "combine-log-coefficient",
    label: "a ln b -> ln(b^a)",
    latex: String.raw`a\ln b \to \ln\left(b^{a}\right)`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 85,
    apply: combineLogCoefficient,
  },
  {
    id: "exponential-natural-log-inverse",
    label: "e^(ln x) -> x",
    latex: String.raw`e^{\ln x} \to x`,
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 82,
    apply: exponentialNaturalLogInverse,
  },
  {
    id: "expand-exponential-sum",
    label: "exp(x + y) -> exp(x) exp(y)",
    latex: String.raw`\exp\left(x + y\right) \to \exp\left(x\right)\exp\left(y\right)`,
    defaultPriority: 80,
    apply: expandExponentialSum,
  },
  {
    id: "combine-exponential-product",
    label: "exp(x) exp(y) -> exp(x + y)",
    latex: String.raw`\exp\left(x\right)\exp\left(y\right) \to \exp\left(x + y\right)`,
    defaultPriority: 70,
    apply: combineExponentialProduct,
  },
  {
    id: "power-of-power",
    label: "(a^b)^c -> a^(b c)",
    latex: String.raw`\left(a^{b}\right)^{c} \to a^{bc}`,
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 60,
    apply: flattenPowerOfPower,
  },
  {
    id: "power-of-product",
    label: "(a b)^n -> a^n b^n",
    latex: String.raw`\left(ab\right)^{n} \to a^{n}b^{n}`,
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 59,
    apply: expandPowerOfProduct,
  },
  {
    id: "combine-product-powers",
    label: "a^n b^n -> (a b)^n",
    latex: String.raw`a^{n}b^{n} \to \left(ab\right)^{n}`,
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 58,
    apply: combineProductPowers,
  },
  {
    id: "reciprocal-to-negative-power",
    label: "1 / x <-> x^(-1)",
    latex: String.raw`\frac{1}{x} \leftrightarrow x^{-1}`,
    defaultPriority: 57,
    apply: reciprocalToNegativePower,
  },
  {
    id: "sqrt-square-to-absolute-value",
    label: "sqrt(x^2) -> |x|",
    latex: String.raw`\sqrt{x^{2}} \to \left|x\right|`,
    defaultPriority: 55,
    apply: sqrtSquareToAbsoluteValue,
  },
  {
    id: "sqrt-square-to-positive-base",
    label: "sqrt(x^2) -> x",
    latex: String.raw`\sqrt{x^{2}} \to x`,
    caveat: POSITIVE_BASE_CAVEAT,
    defaultPriority: 54,
    apply: sqrtSquareToPositiveBase,
  },
  {
    id: "sin-complement-to-cos",
    label: "sin(pi/2 - theta) -> cos(theta)",
    latex: String.raw`\sin\left(\frac{\pi}{2} - \theta\right) \to \cos\theta`,
    caveat: ANGLE_IDENTITY_CAVEAT,
    defaultPriority: 50,
    apply: sinComplementToCos,
  },
  {
    id: "cos-to-sin-complement",
    label: "cos(theta) -> sin(pi/2 - theta)",
    latex: String.raw`\cos\theta \to \sin\left(\frac{\pi}{2} - \theta\right)`,
    caveat: ANGLE_IDENTITY_CAVEAT,
    defaultPriority: 10,
    apply: cosToSinComplement,
  },
];

export function getApplicableIdentityRewrites(expr: Expr): IdentityRewriteOption[] {
  return IDENTITY_REWRITES.filter((rewrite) => rewrite.apply(expr) !== null)
    .sort((left, right) => right.defaultPriority - left.defaultPriority)
    .map(({ id, label, latex, caveat, defaultPriority }) => ({
      id,
      label,
      latex,
      caveat,
      defaultPriority,
    }));
}

export function applyIdentityRewrite(expr: Expr, id: string): Expr | null {
  const rewrite = IDENTITY_REWRITES.find((candidate) => candidate.id === id);
  return rewrite?.apply(expr) ?? null;
}

export function applyDefaultIdentityRewrite(expr: Expr): Expr | null {
  const rewrite = [...IDENTITY_REWRITES]
    .sort((left, right) => right.defaultPriority - left.defaultPriority)
    .find((candidate) => candidate.apply(expr) !== null);
  return rewrite?.apply(expr) ?? null;
}

export function getApplicableIdentityRewritesForSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): IdentityRewriteOption[] {
  const target = getSelectionRewriteTarget(document, selection);
  const directOptions = target ? getApplicableIdentityRewrites(target.expr) : [];
  if (directOptions.length > 0) return directOptions;

  const contextualTarget = getContextualIdentityRewriteTarget(document, selection);
  return contextualTarget ? getApplicableIdentityRewrites(contextualTarget.expr) : [];
}

export function canApplyIdentityRewriteToSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): boolean {
  return getApplicableIdentityRewritesForSelection(document, selection).length > 0;
}

export function applyIdentityRewriteToSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
  id: string,
): Expr | null {
  if (!selection) return null;
  const target = getSelectionRewriteTarget(document, selection);
  const rewritten = target ? applyIdentityRewrite(target.expr, id) : null;
  if (rewritten) return replaceSelectionWithExpr(document, selection, rewritten);

  const contextualTarget = getContextualIdentityRewriteTarget(document, selection);
  if (!contextualTarget) return null;
  const contextualRewritten = applyIdentityRewrite(contextualTarget.expr, id);
  if (!contextualRewritten) return null;
  return replaceSelectionWithExpr(document, contextualTarget.selection, contextualRewritten);
}

export function applyDefaultIdentityRewriteToSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): Expr | null {
  if (!selection) return null;
  const target = getSelectionRewriteTarget(document, selection);
  const rewritten = target ? applyDefaultIdentityRewrite(target.expr) : null;
  if (rewritten) return replaceSelectionWithExpr(document, selection, rewritten);

  const contextualTarget = getContextualIdentityRewriteTarget(document, selection);
  if (!contextualTarget) return null;
  const contextualRewritten = applyDefaultIdentityRewrite(contextualTarget.expr);
  if (!contextualRewritten) return null;
  return replaceSelectionWithExpr(document, contextualTarget.selection, contextualRewritten);
}

function getContextualIdentityRewriteTarget(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): { expr: Expr; selection: TermSelection } | null {
  if (selection?.kind !== "single") return null;

  const contextualNodeId = differentialNodeIdForSelectedArgument(document, selection.nodeId);
  if (!contextualNodeId) return null;

  const expr = document.index.nodeById[contextualNodeId];
  return expr ? { expr: cloneExpr(expr), selection: { kind: "single", nodeId: contextualNodeId } } : null;
}

function differentialNodeIdForSelectedArgument(document: CompiledMathDocument, nodeId: string): string | null {
  const location = document.index.locationById[nodeId];
  if (!location?.parentId) return null;

  const parent = document.index.nodeById[location.parentId];
  if (parent?.kind === "differential" && location.field === "variable") {
    return location.parentId;
  }

  const parentLocation = document.index.locationById[location.parentId];
  if (!parentLocation?.parentId || parent?.kind !== "display_group" || location.field !== "expression") {
    return null;
  }

  const grandparent = document.index.nodeById[parentLocation.parentId];
  return grandparent?.kind === "differential" && parentLocation.field === "variable"
    ? parentLocation.parentId
    : null;
}

function combineNaturalLogs(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "add" || unwrapped.terms.length !== 2) return null;
  const [leftTerm, rightTerm] = unwrapped.terms;
  if (!leftTerm || !rightTerm || splitSign(leftTerm).sign !== 1 || splitSign(rightTerm).sign !== 1) return null;

  const args = unwrapped.terms.map((term) => naturalLogArgument(term));
  const [left, right] = args;
  if (!left || !right) return null;
  return naturalLog(displayGroup("paren", multiply([left, right])));
}

function differentialSumRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1 || signed.value.kind !== "differential") return null;

  const differentialExpr = signed.value;
  const sum = sumOperand(differentialExpr.variable);
  if (!sum || sum.terms.length < 2) return null;

  return add(
    sum.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const termDifferential = differential(groupedDifferentialSumOperand(signedTerm.value), {
        ...(differentialExpr.inexact ? { inexact: true } : {}),
      });
      return signedTerm.sign === -1 ? flipSign(termDifferential) : termDifferential;
    }),
  );
}

function groupedDifferentialSumOperand(expr: Expr): Expr {
  return expr.kind === "multiply" ? displayGroup("paren", expr) : cloneExpr(expr);
}

function simplifyGroupedDifferentialOperand(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.value.kind !== "differential") return null;

  const variable = signed.value.variable;
  if (variable.kind !== "display_group") return null;

  const unwrappedVariable = unwrapDisplayGroup(variable);
  if (!isSymbolLikeAtom(unwrappedVariable)) return null;

  const simplified = differential(
    unwrappedVariable,
    signed.value.inexact ? { inexact: true } : undefined,
  );
  return signed.sign === -1 ? flipSign(simplified) : simplified;
}

type IntegralLikeExpr = Extract<
  Expr,
  { kind: "integral" | "uniterated_integral" | "closed_integral" | "multiple_integral" }
>;

function integralSumRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1 || !isIntegralLike(signed.value)) return null;

  const integralExpr = signed.value;
  const split = integralSumIntegrand(integralExpr);
  if (!split || split.sum.terms.length < 2) return null;

  return add(
    split.sum.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const termIntegral = withIntegralIntegrand(
        integralExpr,
        split.integrandForTerm(signedTerm.value),
      );
      return signedTerm.sign === -1 ? flipSign(termIntegral) : termIntegral;
    }),
  );
}

function integralSumIntegrand(expr: IntegralLikeExpr): {
  sum: Extract<Expr, { kind: "add" }>;
  integrandForTerm: (term: Expr) => Expr;
} | null {
  const directSum = sumOperand(expr.integrand);
  if (directSum) {
    return {
      sum: directSum,
      integrandForTerm: cloneExpr,
    };
  }

  const integrand = unwrapDisplayGroup(expr.integrand);
  if (integrand.kind !== "multiply") return null;

  const sumFactorIndex = integrand.factors.findIndex((factor) => sumOperand(factor) !== null);
  if (sumFactorIndex < 0) return null;

  const sum = sumOperand(integrand.factors[sumFactorIndex]!);
  if (!sum) return null;

  return {
    sum,
    integrandForTerm: (term) => {
      const factors = integrand.factors.map((factor, index) =>
        index === sumFactorIndex ? cloneExpr(term) : cloneExpr(factor),
      );
      return collapseProduct(factors);
    },
  };
}

function isIntegralLike(expr: Expr): expr is IntegralLikeExpr {
  return (
    expr.kind === "integral" ||
    expr.kind === "uniterated_integral" ||
    expr.kind === "closed_integral" ||
    expr.kind === "multiple_integral"
  );
}

function withIntegralIntegrand(expr: IntegralLikeExpr, integrand: Expr): IntegralLikeExpr {
  return {
    ...expr,
    integrand: cloneExpr(integrand),
  };
}

function splitAdditiveTermSign(expr: Expr): { sign: 1 | -1; value: Expr } {
  const signed = splitSign(expr);
  if (signed.value.kind !== "multiply") return signed;

  let sign = signed.sign;
  const factors = signed.value.factors.map((factor) => {
    const signedFactor = splitSign(factor);
    sign = sign === signedFactor.sign ? 1 : -1;
    return signedFactor.value;
  });

  return {
    sign,
    value: collapseProduct(factors),
  };
}

function derivativeSumRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const sum = derivativeSumOperand(signed.value);
  if (!sum || sum.terms.length < 2) return null;

  return add(
    sum.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const derivative = derivativeWithOperand(signed.value, groupedDerivativeSumOperand(signedTerm.value));
      return signedTerm.sign === -1 ? flipSign(derivative) : derivative;
    }),
  );
}

function groupedDerivativeSumOperand(expr: Expr): Expr {
  return expr.kind === "multiply" ? displayGroup("paren", expr) : expr;
}

function nestedPartialToSecondPartial(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const outer = signed.value;
  const nested = nestedPartialDerivative(outer);
  if (!nested) return null;
  if (structuralKeyIgnoringDisplayGroups(nested.inner.variable) !== structuralKeyIgnoringDisplayGroups(nested.outerVariable)) {
    return null;
  }

  return secondOrderPartialDerivative(
    cloneExpr(nested.inner.quantity),
    [cloneExpr(nested.outerVariable)],
    2,
  );
}

function nestedPartialDerivative(expr: Expr): {
  inner: Extract<Expr, { kind: "partial_derivative" }>;
  outerVariable: Expr;
} | null {
  switch (expr.kind) {
    case "partial_derivative": {
      const quantity = unwrapDisplayGroup(expr.quantity);
      return quantity.kind === "partial_derivative"
        ? { inner: quantity, outerVariable: expr.variable }
        : null;
    }
    case "partial_derivative_operator": {
      const operand = unwrapDisplayGroup(expr.operand);
      return operand.kind === "partial_derivative"
        ? { inner: operand, outerVariable: expr.variable }
        : null;
    }
    default:
      return null;
  }
}

function partialAtConstantReciprocal(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const unwrapped = unwrapDisplayGroup(signed.value);
  if (unwrapped.kind !== "partial_at_const_quantity") return null;

  return divide(
    num(1),
    partialAtConstQuantity(
      cloneExpr(unwrapped.variable),
      cloneExpr(unwrapped.quantity),
      cloneExpr(unwrapped.constantQuantity),
    ),
  );
}

function derivativeProductRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const product = derivativeProductOperand(signed.value);
  if (!product || product.factors.length < 2) return null;

  return add(
    product.factors.map((factor, factorIndex) => {
      const outsideFactors = product.factors
        .filter((_, index) => index !== factorIndex)
        .map(cloneExpr);
      return multiply([
        ...outsideFactors,
        derivativeWithOperand(signed.value, factor),
      ]);
    }),
  );
}

function differentialProductRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.value.kind !== "differential") return null;

  const product = productOperand(signed.value.variable);
  if (!product || product.factors.length < 2) return null;

  return add(
    product.factors.map((factor, factorIndex) => {
      const outsideFactors = product.factors
        .filter((_, index) => index !== factorIndex)
        .map(cloneExpr);
      const term = multiply([
        ...outsideFactors,
        differential(cloneExpr(factor), {
          ...(signed.value.kind === "differential" && signed.value.inexact ? { inexact: true } : {}),
        }),
      ]);
      return signed.sign === -1 ? flipSign(term) : term;
    }),
  );
}

function derivativeQuotientAsProductRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const quotient = derivativeQuotientOperand(signed.value);
  if (!quotient) return null;

  const reciprocalDenominator = divide(num(1), quotient.denominator);
  return add([
    multiply([
      reciprocalDenominator,
      derivativeWithOperand(signed.value, quotient.numerator),
    ]),
    multiply([
      cloneExpr(quotient.numerator),
      derivativeWithOperand(signed.value, reciprocalDenominator),
    ]),
  ]);
}

function differentialQuotientRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.value.kind !== "differential") return null;

  const quotient = quotientOperand(signed.value.variable);
  if (!quotient) return null;

  const numerator = groupedDifferentialQuotientOperand(quotient.numerator);
  const denominator = groupedDifferentialQuotientOperand(quotient.denominator);
  const firstTerm = multiply([
    divide(num(1), denominator),
    differential(numerator, {
      ...(signed.value.inexact ? { inexact: true } : {}),
    }),
  ]);
  const secondTerm = flipSign(
    multiply([
      divide(cloneExpr(numerator), power(denominator, num(2))),
      differential(cloneExpr(denominator), {
        ...(signed.value.inexact ? { inexact: true } : {}),
      }),
    ]),
  );
  const terms = signed.sign === -1 ? [flipSign(firstTerm), flipSign(secondTerm)] : [firstTerm, secondTerm];
  return add(terms);
}

function groupedDifferentialQuotientOperand(expr: Expr): Expr {
  return expr.kind === "add" ? displayGroup("paren", expr) : cloneExpr(expr);
}

function derivativeReciprocalRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) return null;

  const reciprocal = derivativeReciprocalOperand(signed.value);
  if (!reciprocal) return null;

  return flipSign(
    multiply([
      divide(num(1), power(reciprocal.denominator, num(2))),
      derivativeWithOperand(signed.value, reciprocal.denominator),
    ]),
  );
}

function distributeSumOverDenominator(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  const quotient = quotientOperand(signed.value);
  if (!quotient) return null;

  const numerator = sumOperand(quotient.numerator);
  if (!numerator || numerator.terms.length < 2) return null;

  return add(
    numerator.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const fraction = divide(cloneExpr(signedTerm.value), cloneExpr(quotient.denominator));
      const termSign = signed.sign === signedTerm.sign ? 1 : -1;
      return termSign === -1 ? flipSign(fraction) : fraction;
    }),
  );
}

function derivativeProductOperand(expr: Expr): Extract<Expr, { kind: "multiply" }> | null {
  switch (expr.kind) {
    case "partial_derivative":
      return productOperand(expr.quantity);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return productOperand(expr.operand);
    default:
      return null;
  }
}

function derivativeQuotientOperand(expr: Expr): Extract<Expr, { kind: "divide" }> | null {
  switch (expr.kind) {
    case "partial_derivative":
      return quotientOperand(expr.quantity);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return quotientOperand(expr.operand);
    default:
      return null;
  }
}

function derivativeSumOperand(expr: Expr): Extract<Expr, { kind: "add" }> | null {
  switch (expr.kind) {
    case "partial_derivative":
      return sumOperand(expr.quantity);
    case "full_derivative_operator":
    case "partial_derivative_operator":
      return sumOperand(expr.operand);
    default:
      return null;
  }
}

function derivativeReciprocalOperand(expr: Expr): Extract<Expr, { kind: "divide" }> | null {
  const quotient = derivativeQuotientOperand(expr);
  if (!quotient) return null;
  const signedNumerator = splitSign(quotient.numerator);
  if (signedNumerator.sign !== 1 || !isNumberOne(signedNumerator.value)) return null;
  return quotient;
}

function sumOperand(expr: Expr): Extract<Expr, { kind: "add" }> | null {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "add" ? unwrapped : null;
}

function productOperand(expr: Expr): Extract<Expr, { kind: "multiply" }> | null {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "multiply" ? unwrapped : null;
}

function quotientOperand(expr: Expr): Extract<Expr, { kind: "divide" }> | null {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "divide" ? unwrapped : null;
}

function derivativeWithOperand(expr: Expr, operand: Expr): Expr {
  switch (expr.kind) {
    case "partial_derivative":
      return partialDerivative(cloneExpr(operand), cloneExpr(expr.variable));
    case "full_derivative_operator":
      return fullDerivativeOperator(cloneExpr(expr.variable), cloneExpr(operand));
    case "partial_derivative_operator":
      return partialDerivativeOperator(cloneExpr(expr.variable), cloneExpr(operand));
    default:
      return cloneExpr(expr);
  }
}

function combineNaturalLogQuotient(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "add" || unwrapped.terms.length !== 2) return null;

  const [leftTerm, rightTerm] = unwrapped.terms;
  if (!leftTerm || !rightTerm) return null;
  const signedRight = splitSign(rightTerm);
  if (signedRight.sign !== -1) return null;

  const numerator = naturalLogArgument(leftTerm);
  const denominator = naturalLogArgument(signedRight.value);
  if (!numerator || !denominator) return null;
  return naturalLog(displayGroup("paren", divide(numerator, denominator)));
}

function pythagoreanTrigIdentity(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "add" || unwrapped.terms.length !== 2) return null;

  const terms = unwrapped.terms.map(squaredTrigCall);
  const [left, right] = terms;
  if (!left || !right) return null;
  if (left.name === right.name) return null;
  if (!((left.name === "sin" && right.name === "cos") || (left.name === "cos" && right.name === "sin"))) {
    return null;
  }
  return structuralKeyIgnoringDisplayGroups(left.argument) === structuralKeyIgnoringDisplayGroups(right.argument)
    ? num(1)
    : null;
}

function expandNaturalLogProduct(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1) {
    const expanded = expandNaturalLogProduct(signed.value);
    if (!expanded || expanded.kind !== "add") return null;
    return add(expanded.terms.map(flipSign));
  }

  const argument = naturalLogArgument(expr);
  if (!argument) return null;

  const unwrappedArgument = unwrapDisplayGroup(argument);
  if (unwrappedArgument.kind !== "multiply" || unwrappedArgument.factors.length !== 2) return null;
  const [left, right] = unwrappedArgument.factors;
  if (!left || !right) return null;
  return add([naturalLog(left), naturalLog(right)]);
}

function expandNaturalLogQuotient(expr: Expr): Expr | null {
  const argument = naturalLogArgument(expr);
  if (!argument) return null;

  const unwrappedArgument = unwrapDisplayGroup(argument);
  if (unwrappedArgument.kind !== "divide") return null;
  return add([
    naturalLogWithCompoundParens(unwrappedArgument.numerator),
    flipSign(naturalLogWithCompoundParens(unwrappedArgument.denominator)),
  ]);
}

function combineLogCoefficient(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  const unwrapped = unwrapDisplayGroup(signed.value);
  if (unwrapped.kind !== "multiply" || unwrapped.factors.length < 2) return null;

  const logEntries = unwrapped.factors
    .map((factor, index) => {
      const argument = naturalLogArgument(factor);
      return argument ? { index, argument } : null;
    })
    .filter((entry): entry is { index: number; argument: Expr } => entry !== null);
  if (logEntries.length !== 1) return null;

  const [logEntry] = logEntries;
  const coefficientFactors = unwrapped.factors.filter((_, index) => index !== logEntry.index).map(cloneExpr);
  if (coefficientFactors.length === 0) return null;

  const exponent = signed.sign === -1
    ? flipSign(collapseProduct(coefficientFactors))
    : collapseProduct(coefficientFactors);
  return naturalLogWithCompoundParens(power(unwrapDisplayGroup(logEntry.argument), exponent));
}

function exponentialNaturalLogInverse(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  const exponential = exponentialArgument(signed.value);
  if (!exponential) return null;

  const argument = naturalLogArgument(exponential.argument);
  if (!argument) return null;
  return signed.sign === -1 ? flipSign(argument) : argument;
}

function expandExponentialSum(expr: Expr): Expr | null {
  const exponential = exponentialArgument(expr);
  if (!exponential) return null;

  const unwrappedArgument = unwrapDisplayGroup(exponential.argument);
  if (unwrappedArgument.kind !== "add" || unwrappedArgument.terms.length !== 2) return null;
  const [left, right] = unwrappedArgument.terms;
  if (!left || !right) return null;

  return multiply([
    buildExponentialLike(expr, left),
    buildExponentialLike(expr, right),
  ]);
}

function combineExponentialProduct(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "multiply" || unwrapped.factors.length !== 2) return null;

  const exponentials = unwrapped.factors.map(exponentialArgument);
  const [left, right] = exponentials;
  if (!left || !right || left.kind !== right.kind) return null;
  return buildExponentialKind(left.kind, add([left.argument, right.argument]));
}

function flattenPowerOfPower(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "power") return null;

  const base = unwrapDisplayGroup(unwrapped.base);
  if (base.kind !== "power") return null;

  return power(base.base, multiply([base.exponent, unwrapped.exponent]));
}

function expandPowerOfProduct(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "power") return null;

  const base = unwrapDisplayGroup(unwrapped.base);
  if (base.kind !== "multiply" || base.factors.length < 2) return null;

  return multiply(base.factors.map((factor) => power(factor, unwrapped.exponent)));
}

function combineProductPowers(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "multiply" || unwrapped.factors.length < 2) return null;

  const powers = unwrapped.factors.map((factor) => {
    const unwrappedFactor = unwrapDisplayGroup(factor);
    return unwrappedFactor.kind === "power" ? unwrappedFactor : null;
  });
  if (powers.some((factor): factor is null => factor === null)) return null;

  const [firstPower] = powers;
  if (!firstPower) return null;
  const exponentKey = structuralKeyIgnoringDisplayGroups(firstPower.exponent);
  if (!powers.every((factor) => factor && structuralKeyIgnoringDisplayGroups(factor.exponent) === exponentKey)) {
    return null;
  }

  return power(
    displayGroup("paren", multiply(powers.map((factor) => cloneExpr(factor!.base)))),
    firstPower.exponent,
  );
}

function reciprocalToNegativePower(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  const unwrapped = unwrapDisplayGroup(signed.value);
  if (unwrapped.kind === "power") {
    const fraction = negativePowerToReciprocal(unwrapped);
    return fraction ? applyOuterSign(signed.sign, fraction) : null;
  }
  if (unwrapped.kind !== "divide") return null;

  const numerator = unwrapDisplayGroup(unwrapped.numerator);
  if (splitSign(numerator).sign !== 1 || !isNumberOne(splitSign(numerator).value)) return null;

  const denominator = unwrapDisplayGroup(unwrapped.denominator);
  const inverted = denominatorNegativePower(denominator);
  return inverted ? applyOuterSign(signed.sign, inverted) : null;
}

function denominatorNegativePower(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind === "power") {
    const exponent = numericValue(unwrapped.exponent);
    if (exponent === null || !isAllowedReciprocalBase(unwrapped.base)) return null;
    return power(cloneExpr(unwrapped.base), num(-exponent));
  }
  if (!isAllowedReciprocalBase(unwrapped)) return null;
  return power(cloneExpr(unwrapped), num(-1));
}

function negativePowerToReciprocal(expr: Extract<Expr, { kind: "power" }>): Expr | null {
  const exponent = numericValue(expr.exponent);
  if (exponent === null || exponent >= 0 || !isAllowedReciprocalBase(expr.base)) return null;
  const positiveExponent = -exponent;
  const denominator = positiveExponent === 1
    ? cloneExpr(expr.base)
    : power(cloneExpr(expr.base), num(positiveExponent));
  return divide(num(1), denominator);
}

function isAllowedReciprocalBase(expr: Expr): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  if (isSymbolLikeAtom(unwrapped)) return true;
  return trigCallArgument(unwrapped) !== null;
}

function isSymbolLikeAtom(expr: Expr): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  switch (unwrapped.kind) {
    case "symbol":
      return true;
    case "special_font":
    case "vector":
    case "hat":
    case "dotted_expr":
    case "primed":
      return isSymbolLikeAtom(unwrapped.value);
    default:
      return false;
  }
}

function trigCallArgument(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "call" || unwrapped.args.length !== 1) return null;
  if (!trigName(unwrapped.callee)) return null;
  return unwrapped.args[0] ? cloneExpr(unwrapped.args[0]) : null;
}

function applyOuterSign(sign: 1 | -1, expr: Expr): Expr {
  return sign === -1 ? flipSign(expr) : expr;
}

function sqrtSquareToAbsoluteValue(expr: Expr): Expr | null {
  const base = sqrtSquareBase(expr);
  return base ? absoluteValue(base) : null;
}

function sqrtSquareToPositiveBase(expr: Expr): Expr | null {
  return sqrtSquareBase(expr);
}

function sinComplementToCos(expr: Expr): Expr | null {
  const arg = singleNamedCallArgument(expr, "sin");
  if (!arg) return null;

  const complement = complementArgument(arg);
  return complement ? namedCall("cos", complement) : null;
}

function cosToSinComplement(expr: Expr): Expr | null {
  const arg = singleNamedCallArgument(expr, "cos");
  if (!arg) return null;

  return namedCall("sin", add([piOverTwo(), flipSign(arg)]));
}

function cosSquarePowerReduction(expr: Expr): Expr | null {
  const squared = squaredTrigCall(expr);
  if (!squared || squared.name !== "cos") return null;
  return divide(
    displayGroup("paren", add([num(1), namedCallWithDelimiter("cos", multiply([num(2), squared.argument]), "paren")])),
    num(2),
  );
}

function sinSquarePowerReduction(expr: Expr): Expr | null {
  const squared = squaredTrigCall(expr);
  if (!squared || squared.name !== "sin") return null;
  return divide(
    displayGroup(
      "paren",
      add([num(1), flipSign(namedCallWithDelimiter("cos", multiply([num(2), squared.argument]), "paren"))]),
    ),
    num(2),
  );
}

function sqrtSquareBase(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "root" || unwrapped.degree !== 2) return null;

  const value = unwrapDisplayGroup(unwrapped.value);
  if (value.kind !== "power" || !isNumberTwo(value.exponent)) return null;
  return cloneExpr(value.base);
}

function squaredTrigCall(expr: Expr): { name: "sin" | "cos"; argument: Expr } | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "power") return null;
  if (!isNumberTwo(unwrapped.exponent)) return null;

  const base = unwrapDisplayGroup(unwrapped.base);
  if (base.kind !== "call" || base.args.length !== 1) return null;
  const name = trigName(base.callee);
  if (name !== "sin" && name !== "cos") return null;
  const [argument] = base.args;
  return name && argument ? { name, argument: cloneExpr(argument) } : null;
}

function trigName(expr: Expr): "sin" | "cos" | "tan" | null {
  if (isNamedSymbol(expr, "sin")) return "sin";
  if (isNamedSymbol(expr, "cos")) return "cos";
  if (isNamedSymbol(expr, "tan")) return "tan";
  return null;
}

function naturalLogArgument(expr: Expr): Expr | null {
  return singleNamedCallArgument(expr, "ln");
}

function naturalLog(argument: Expr): Expr {
  return namedCall("ln", argument);
}

function naturalLogWithCompoundParens(argument: Expr): Expr {
  const unwrapped = unwrapDisplayGroup(argument);
  return unwrapped.kind === "multiply" || unwrapped.kind === "divide" || unwrapped.kind === "add" || unwrapped.kind === "power"
    ? namedCallWithDelimiter("ln", argument, "paren")
    : naturalLog(argument);
}

function singleNamedCallArgument(expr: Expr, name: string): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "call" || unwrapped.args.length !== 1) return null;
  if (!isNamedSymbol(unwrapped.callee, name)) return null;
  const [arg] = unwrapped.args;
  return arg ? cloneExpr(arg) : null;
}

type ExponentialArgument = {
  kind: "exp-call" | "e-power";
  argument: Expr;
};

function exponentialArgument(expr: Expr): ExponentialArgument | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind === "call" && unwrapped.args.length === 1 && isNamedSymbol(unwrapped.callee, "exp")) {
    const [arg] = unwrapped.args;
    return arg ? { kind: "exp-call", argument: cloneExpr(arg) } : null;
  }

  if (unwrapped.kind === "power" && isNamedSymbol(unwrapped.base, "e")) {
    return { kind: "e-power", argument: cloneExpr(unwrapped.exponent) };
  }

  return null;
}

function buildExponentialLike(original: Expr, argument: Expr): Expr {
  const exponential = exponentialArgument(original);
  return buildExponentialKind(exponential?.kind ?? "exp-call", argument);
}

function buildExponentialKind(kind: ExponentialArgument["kind"], argument: Expr): Expr {
  return kind === "e-power" ? power(sym("e"), cloneExpr(argument)) : namedCall("exp", argument);
}

function namedCall(name: string, argument: Expr): Expr {
  return namedCallWithDelimiter(name, argument, "bare");
}

function namedCallWithDelimiter(name: string, argument: Expr, delimiter: "paren" | "bracket" | "bare"): Expr {
  return call(sym(name), [cloneExpr(argument)], delimiter);
}

function collapseProduct(factors: Expr[]): Expr {
  if (factors.length === 0) return num(1);
  if (factors.length === 1) return cloneExpr(factors[0]);
  return multiply(factors.map(cloneExpr));
}

function complementArgument(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "add" || unwrapped.terms.length !== 2) return null;

  const [first, second] = unwrapped.terms;
  if (!first || !second) return null;

  const firstSigned = splitSign(first);
  const secondSigned = splitSign(second);
  if (isPiOverTwo(firstSigned.value) && secondSigned.sign === -1) return cloneExpr(secondSigned.value);
  if (isPiOverTwo(secondSigned.value) && firstSigned.sign === -1) return cloneExpr(firstSigned.value);
  return null;
}

function isPiOverTwo(expr: Expr): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "divide") return false;
  return isNamedSymbol(unwrapped.numerator, String.raw`\pi`) && isNumberTwo(unwrapped.denominator);
}

function piOverTwo(): Expr {
  return {
    kind: "divide",
    numerator: sym(String.raw`\pi`),
    denominator: num(2),
  };
}

function isNumberTwo(expr: Expr): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "number" && Number(unwrapped.value) === 2;
}

function isNumberOne(expr: Expr): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "number" && Number(unwrapped.value) === 1;
}

function numericValue(expr: Expr): number | null {
  const signed = splitSign(expr);
  const unwrapped = unwrapDisplayGroup(signed.value);
  if (unwrapped.kind !== "number") return null;
  const value = Number(unwrapped.value);
  return Number.isFinite(value) ? signed.sign * value : null;
}

function isNamedSymbol(expr: Expr, name: string): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "symbol" && unwrapped.name === name;
}

function unwrapDisplayGroup(expr: Expr): Expr {
  return expr.kind === "display_group" ? unwrapDisplayGroup(expr.expression) : cloneExpr(expr);
}
