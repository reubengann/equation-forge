import type { TermSelection } from "../../selection/types";
import {
  add,
  call,
  displayGroup,
  multiply,
  negate,
  num,
  power,
  sym,
  type Expr,
} from "../ast";
import { cloneExpr } from "../ast/utils";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
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

const IDENTITY_REWRITES: IdentityRewrite[] = [
  {
    id: "combine-natural-logs",
    label: "ln a + ln b -> ln(a b)",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 100,
    apply: combineNaturalLogs,
  },
  {
    id: "expand-natural-log-product",
    label: "ln(a b) -> ln a + ln b",
    caveat: POSITIVE_LOG_CAVEAT,
    defaultPriority: 90,
    apply: expandNaturalLogProduct,
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

  const args = unwrapped.terms.map((term) => naturalLogArgument(term));
  const [left, right] = args;
  if (!left || !right) return null;
  return naturalLog(displayGroup("paren", multiply([left, right])));
}

function expandNaturalLogProduct(expr: Expr): Expr | null {
  const argument = naturalLogArgument(expr);
  if (!argument) return null;

  const unwrappedArgument = unwrapDisplayGroup(argument);
  if (unwrappedArgument.kind !== "multiply" || unwrappedArgument.factors.length !== 2) return null;
  const [left, right] = unwrappedArgument.factors;
  if (!left || !right) return null;
  return add([naturalLog(left), naturalLog(right)]);
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

function sinComplementToCos(expr: Expr): Expr | null {
  const arg = singleNamedCallArgument(expr, "sin");
  if (!arg) return null;

  const complement = complementArgument(arg);
  return complement ? namedCall("cos", complement) : null;
}

function cosToSinComplement(expr: Expr): Expr | null {
  const arg = singleNamedCallArgument(expr, "cos");
  if (!arg) return null;

  return namedCall("sin", add([piOverTwo(), negate(arg, "subtraction")]));
}

function naturalLogArgument(expr: Expr): Expr | null {
  return singleNamedCallArgument(expr, "ln");
}

function naturalLog(argument: Expr): Expr {
  return namedCall("ln", argument);
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
  return call(sym(name), [cloneExpr(argument)], "bare");
}

function complementArgument(expr: Expr): Expr | null {
  const unwrapped = unwrapDisplayGroup(expr);
  if (unwrapped.kind !== "add" || unwrapped.terms.length !== 2) return null;

  const [first, second] = unwrapped.terms;
  if (!first || !second) return null;

  if (isPiOverTwo(first) && second.kind === "negate") return cloneExpr(second.value);
  if (isPiOverTwo(second) && first.kind === "negate") return cloneExpr(first.value);
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

function isNamedSymbol(expr: Expr, name: string): boolean {
  const unwrapped = unwrapDisplayGroup(expr);
  return unwrapped.kind === "symbol" && unwrapped.name === name;
}

function unwrapDisplayGroup(expr: Expr): Expr {
  return expr.kind === "display_group" ? unwrapDisplayGroup(expr.expression) : cloneExpr(expr);
}
