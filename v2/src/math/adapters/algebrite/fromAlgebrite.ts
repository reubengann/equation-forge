import Algebrite, { type AlgebriteNode } from "algebrite";
import {
  absoluteValue,
  add,
  call,
  divide,
  equation,
  invalidInput,
  multiply,
  negate,
  num,
  power,
  sym,
  type Expr,
} from "../../ast";
import type { SymbolSubstitution } from "./toAlgebrite";

const ALGE_BRITE_EULER_SYMBOL = "~";

function fallbackInvalid(reason: string, value: AlgebriteNode): Expr {
  return invalidInput(`Unsupported Algebrite: ${reason}`, value.toString());
}

export function fromAlgebrite(value: AlgebriteNode, symbols?: SymbolSubstitution): Expr {
  if (Algebrite.isrational(value)) {
    const numerator = value.q?.a.toString();
    const denominator = value.q?.b.toString();
    if (!numerator || !denominator) return fallbackInvalid("malformed_rational", value);
    if (denominator === "1") return num(parseNumericAtom(numerator));
    const numeratorValue = parseNumericAtom(numerator);
    const denominatorValue = parseNumericAtom(denominator);
    if (isNegativeNumericAtom(numeratorValue) && isPositiveNumericAtom(denominatorValue)) {
      return negate(divide(num(absNumericAtom(numeratorValue)), num(denominatorValue)), "subtraction");
    }
    return divide(num(numeratorValue), num(denominatorValue));
  }

  if (Algebrite.isdouble(value)) {
    return num(value.d ?? Number(value.toString()));
  }

  if (Algebrite.issymbol(value)) {
    const name = value.printname ?? value.toString();
    return sym(symbols?.originalBySafe.get(name) ?? normalizeSymbolName(name));
  }

  if (!Algebrite.iscons(value)) {
    return fallbackInvalid("unsupported_atom", value);
  }

  const [head, ...args] = consItems(value);
  const headName = head?.printname ?? head?.toString();
  if (!headName) return fallbackInvalid("missing_head", value);

  return mapHeadCall(headName, args, value, symbols);
}

function mapHeadCall(
  head: string,
  args: AlgebriteNode[],
  original: AlgebriteNode,
  symbols: SymbolSubstitution | undefined,
): Expr {
  switch (head) {
    case "add":
      return add(args.map((arg) => fromAlgebrite(arg, symbols)));
    case "multiply":
      return mapMultiply(args, symbols);
    case "power":
      if (args.length !== 2) return fallbackInvalid("power_arity_mismatch", original);
      return power(fromAlgebrite(args[0]!, symbols), fromAlgebrite(args[1]!, symbols));
    case "equals":
      return equation(args.map((arg) => fromAlgebrite(arg, symbols)));
    case "sin":
    case "cos":
    case "tan":
      return call(sym(head), args.map((arg) => fromAlgebrite(arg, symbols)), "paren");
    case "log":
      return call(sym("ln"), args.map((arg) => fromAlgebrite(arg, symbols)), "paren");
    case "abs":
      if (args.length !== 1) return fallbackInvalid("abs_arity_mismatch", original);
      return absoluteValue(fromAlgebrite(args[0]!, symbols));
    default:
      return call(sym(head), args.map((arg) => fromAlgebrite(arg, symbols)), "paren");
  }
}

function mapMultiply(args: AlgebriteNode[], symbols: SymbolSubstitution | undefined): Expr {
  const factors = args.map((arg) => fromAlgebrite(arg, symbols));
  const denominatorFactors: Expr[] = [];
  const numeratorFactors: Expr[] = [];

  for (const factor of factors) {
    if (
      factor.kind === "power" &&
      factor.exponent.kind === "number" &&
      numericValue(factor.exponent.value) === -1
    ) {
      denominatorFactors.push(factor.base);
    } else {
      numeratorFactors.push(factor);
    }
  }

  if (denominatorFactors.length === 0) return normalizeProduct(numeratorFactors);
  const numerator = numeratorFactors.length === 0 ? num(1) : normalizeProduct(numeratorFactors);
  const denominator = denominatorFactors.length === 1 ? denominatorFactors[0]! : multiply(denominatorFactors);
  return divide(numerator, denominator);
}

function normalizeProduct(factors: Expr[]): Expr {
  if (factors.length === 0) return num(1);
  const [first, ...rest] = factors;
  if (first && isNumberValue(first, -1)) {
    if (rest.length === 0) return num(-1);
    const value = rest.length === 1 ? rest[0]! : multiply(rest);
    return negate(value, "subtraction");
  }
  if (first?.kind === "negate") {
    const value = rest.length === 0 ? first.value : multiply([first.value, ...rest]);
    return negate(value, "subtraction");
  }
  if (factors.length === 1) return factors[0]!;
  return multiply(factors);
}

function consItems(value: AlgebriteNode): AlgebriteNode[] {
  const items: AlgebriteNode[] = [];
  let cursor = value;
  while (Algebrite.iscons(cursor)) {
    items.push(Algebrite.car(cursor));
    cursor = Algebrite.cdr(cursor);
  }
  return items;
}

function parseNumericAtom(value: string): number | string {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) || value.includes(".") ? numeric : value;
}

function isNegativeNumericAtom(value: number | string): boolean {
  return typeof value === "number" ? value < 0 : value.startsWith("-");
}

function isPositiveNumericAtom(value: number | string): boolean {
  return typeof value === "number" ? value > 0 : !value.startsWith("-");
}

function absNumericAtom(value: number | string): number | string {
  return typeof value === "number" ? Math.abs(value) : value.replace(/^-/, "");
}

function numericValue(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function isNumberValue(expr: Expr, value: number): boolean {
  return expr.kind === "number" && Number(expr.value) === value;
}

function normalizeSymbolName(value: string): string {
  if (value === "pi") return String.raw`\pi`;
  if (value === ALGE_BRITE_EULER_SYMBOL) return "e";
  return value;
}
