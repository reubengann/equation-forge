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
    defaultPriority: 110,
    apply: pythagoreanTrigIdentity,
  },
  {
    id: "cos-square-power-reduction",
    label: "cos^2(theta) -> (1 + cos(2 theta))/2",
    defaultPriority: 45,
    apply: cosSquarePowerReduction,
  },
  {
    id: "sin-square-power-reduction",
    label: "sin^2(theta) -> (1 - cos(2 theta))/2",
    defaultPriority: 45,
    apply: sinSquarePowerReduction,
  },
  {
    id: "integral-sum-rule",
    label: "int(f + g) dx -> int f dx + int g dx",
    defaultPriority: 99,
    apply: integralSumRule,
  },
  {
    id: "differential-sum-rule",
    label: "d(f + g) -> df + dg",
    defaultPriority: 98,
    apply: differentialSumRule,
  },
  {
    id: "derivative-sum-rule",
    label: "d(f + g) -> df + dg",
    defaultPriority: 97,
    apply: derivativeSumRule,
  },
  {
    id: "nested-partial-to-second-partial",
    label: "d/dx(df/dx) -> d^2f/dx^2",
    defaultPriority: 96,
    apply: nestedPartialToSecondPartial,
  },
  {
    id: "derivative-product-rule",
    label: "d(f g) -> g df + f dg",
    defaultPriority: 95,
    apply: derivativeProductRule,
  },
  {
    id: "derivative-quotient-as-product-rule",
    label: "d(f / g) -> 1/g df + f d(1/g)",
    defaultPriority: 94,
    apply: derivativeQuotientAsProductRule,
  },
  {
    id: "derivative-reciprocal-rule",
    label: "d(1/f) -> -1/f^2 df",
    defaultPriority: 93,
    apply: derivativeReciprocalRule,
  },
  {
    id: "combine-natural-logs",
    label: "ln a + ln b -> ln(a b)",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 100,
    apply: combineNaturalLogs,
  },
  {
    id: "combine-natural-log-quotient",
    label: "ln a - ln b -> ln(a / b)",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 100,
    apply: combineNaturalLogQuotient,
  },
  {
    id: "expand-natural-log-product",
    label: "ln(a b) -> ln a + ln b",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 90,
    apply: expandNaturalLogProduct,
  },
  {
    id: "expand-natural-log-quotient",
    label: "ln(a / b) -> ln a - ln b",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 90,
    apply: expandNaturalLogQuotient,
  },
  {
    id: "combine-log-coefficient",
    label: "a ln b -> ln(b^a)",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 85,
    apply: combineLogCoefficient,
  },
  {
    id: "expand-exponential-sum",
    label: "exp(x + y) -> exp(x) exp(y)",
    defaultPriority: 80,
    apply: expandExponentialSum,
  },
  {
    id: "combine-exponential-product",
    label: "exp(x) exp(y) -> exp(x + y)",
    defaultPriority: 70,
    apply: combineExponentialProduct,
  },
  {
    id: "power-of-power",
    label: "(a^b)^c -> a^(b c)",
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 60,
    apply: flattenPowerOfPower,
  },
  {
    id: "power-of-product",
    label: "(a b)^n -> a^n b^n",
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 59,
    apply: expandPowerOfProduct,
  },
  {
    id: "combine-product-powers",
    label: "a^n b^n -> (a b)^n",
    caveat: POWER_BRANCH_CAVEAT,
    defaultPriority: 58,
    apply: combineProductPowers,
  },
  {
    id: "reciprocal-to-negative-power",
    label: "1 / x <-> x^(-1)",
    defaultPriority: 57,
    apply: reciprocalToNegativePower,
  },
  {
    id: "sqrt-square-to-absolute-value",
    label: "sqrt(x^2) -> |x|",
    defaultPriority: 55,
    apply: sqrtSquareToAbsoluteValue,
  },
  {
    id: "sqrt-square-to-positive-base",
    label: "sqrt(x^2) -> x",
    caveat: POSITIVE_BASE_CAVEAT,
    defaultPriority: 54,
    apply: sqrtSquareToPositiveBase,
  },
  {
    id: "sin-complement-to-cos",
    label: "sin(pi/2 - theta) -> cos(theta)",
    caveat: ANGLE_IDENTITY_CAVEAT,
    defaultPriority: 50,
    apply: sinComplementToCos,
  },
  {
    id: "cos-to-sin-complement",
    label: "cos(theta) -> sin(pi/2 - theta)",
    caveat: ANGLE_IDENTITY_CAVEAT,
    defaultPriority: 10,
    apply: cosToSinComplement,
  },
];

export function getApplicableIdentityRewrites(expr: Expr): IdentityRewriteOption[] {
  return IDENTITY_REWRITES.filter((rewrite) => rewrite.apply(expr) !== null)
    .sort((left, right) => right.defaultPriority - left.defaultPriority)
    .map(({ id, label, caveat, defaultPriority }) => ({
      id,
      label,
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
  return target ? getApplicableIdentityRewrites(target.expr) : [];
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
  if (!target) return null;
  const rewritten = applyIdentityRewrite(target.expr, id);
  if (!rewritten) return null;
  return replaceSelectionWithExpr(document, selection, rewritten);
}

export function applyDefaultIdentityRewriteToSelection(
  document: CompiledMathDocument,
  selection: TermSelection | null,
): Expr | null {
  if (!selection) return null;
  const target = getSelectionRewriteTarget(document, selection);
  if (!target) return null;
  const rewritten = applyDefaultIdentityRewrite(target.expr);
  if (!rewritten) return null;
  return replaceSelectionWithExpr(document, selection, rewritten);
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

  const sum = sumOperand(signed.value.variable);
  if (!sum || sum.terms.length < 2) return null;

  return add(
    sum.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const termDifferential = differential(cloneExpr(signedTerm.value), {
        ...(signed.value.inexact ? { inexact: true } : {}),
      });
      return signedTerm.sign === -1 ? flipSign(termDifferential) : termDifferential;
    }),
  );
}

type IntegralLikeExpr = Extract<
  Expr,
  { kind: "integral" | "uniterated_integral" | "closed_integral" | "multiple_integral" }
>;

function integralSumRule(expr: Expr): Expr | null {
  const signed = splitSign(expr);
  if (signed.sign === -1 || !isIntegralLike(signed.value)) return null;

  const split = integralSumIntegrand(signed.value);
  if (!split || split.sum.terms.length < 2) return null;

  return add(
    split.sum.terms.map((term) => {
      const signedTerm = splitAdditiveTermSign(term);
      const termIntegral = withIntegralIntegrand(
        signed.value,
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
