import {
  add,
  call,
  differential,
  displayGroup,
  divide,
  equation,
  fullDerivativeOperator,
  invalidInput,
  integral,
  multiply,
  negate,
  num,
  partialDerivative,
  power,
  sym,
  type DelimiterKind,
  type Expr,
} from "../../ast";
import type { MathJsonRecord, MathJsonValue } from "./types";

function asRecord(value: unknown): MathJsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as MathJsonRecord;
}

function normalizeDelimiterKind(open: string, close: string): DelimiterKind {
  if (open === "(" && close === ")") return "paren";
  if (open === "[" && close === "]") return "bracket";
  if (open === "{" && close === "}") return "brace";
  if (open === "<" && close === ">") return "angle";
  return "other";
}

function fallbackInvalid(reason: string, value: unknown): Expr {
  const payload =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();
  return invalidInput(`Unsupported MathJSON: ${reason}`, payload);
}

function fromMathJsonRecord(record: MathJsonRecord): Expr {
  const numValue = record.num;
  if (typeof numValue === "number" || typeof numValue === "string") {
    return num(numValue);
  }

  const symValue = record.sym;
  if (typeof symValue === "string") {
    return sym(normalizeSymbolName(symValue));
  }

  const strValue = record.str;
  if (typeof strValue === "string") {
    return sym(strValue);
  }

  const fnValue = record.fn;
  if (Array.isArray(fnValue)) {
    return fromMathJson(fnValue);
  }

  return fallbackInvalid("unsupported_mathjson_record", record);
}

function mapHeadCall(head: string, args: MathJsonValue[]): Expr {
  switch (head) {
    case "Add":
      return add(args.map(fromMathJson));
    case "Multiply":
      return multiply(args.map(fromMathJson));
    case "Power":
      if (args.length !== 2) return fallbackInvalid("power_arity_mismatch", [head, ...args]);
      return power(fromMathJson(args[0]), fromMathJson(args[1]));
    case "Negate":
      if (args.length !== 1) return fallbackInvalid("negate_arity_mismatch", [head, ...args]);
      return negate(fromMathJson(args[0]));
    case "Divide":
      if (args.length !== 2) return fallbackInvalid("divide_arity_mismatch", [head, ...args]);
      return divide(fromMathJson(args[0]), fromMathJson(args[1]));
    case "Rational":
      if (args.length !== 2) return fallbackInvalid("rational_arity_mismatch", [head, ...args]);
      return divide(fromMathJson(args[0]), fromMathJson(args[1]));
    case "Subtract":
      if (args.length !== 2) return fallbackInvalid("subtract_arity_mismatch", [head, ...args]);
      return add([fromMathJson(args[0]), negate(fromMathJson(args[1]))]);
    case "Equal":
      return equation(args.map(fromMathJson));
    case "Delimiter":
      if (
        args.length === 3 &&
        typeof args[0] === "string" &&
        typeof args[2] === "string"
      ) {
        return displayGroup(
          normalizeDelimiterKind(args[0], args[2]),
          fromMathJson(args[1]),
        );
      }
      return fallbackInvalid("delimiter_shape_mismatch", [head, ...args]);
    case "Integrate": {
      if (args.length !== 2 || !Array.isArray(args[1])) {
        return fallbackInvalid("integrate_shape_mismatch", [head, ...args]);
      }
      const [limitsHead, variable, lowerBound, upperBound] = args[1];
      if (limitsHead !== "Limits" || variable == null) {
        return fallbackInvalid("integrate_limits_mismatch", [head, ...args]);
      }
      return integral(
        multiply([fromMathJson(args[0]), differential(fromMathJson(variable))]),
        lowerBound === "Nothing" ? null : fromMathJson(lowerBound),
        upperBound === "Nothing" ? null : fromMathJson(upperBound),
      );
    }
    case "D":
      if (args.length !== 2) return fallbackInvalid("d_arity_mismatch", [head, ...args]);
      return fullDerivativeOperator(fromMathJson(args[1]), fromMathJson(args[0]));
    case "PartialDerivative":
      if (args.length !== 2) return fallbackInvalid("partial_derivative_arity_mismatch", [head, ...args]);
      return partialDerivative(fromMathJson(args[0]), fromMathJson(args[1]));
    case "Sin":
    case "Cos":
    case "Tan":
    case "Log":
    case "Ln":
    case "Exp":
      return call(sym(head === "Ln" ? "ln" : head.toLowerCase()), args.map(fromMathJson), "paren");
    default:
      return call(sym(head), args.map(fromMathJson));
  }
}

export function fromMathJson(value: MathJsonValue): Expr {
  if (typeof value === "number") return num(value);
  if (typeof value === "string") return sym(normalizeSymbolName(value));
  if (value === null || typeof value === "boolean") {
    return fallbackInvalid("non_expression_atom", value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return fallbackInvalid("empty_mathjson_array", value);
    const [head, ...args] = value;
    if (typeof head === "string") {
      return mapHeadCall(head, args);
    }
    return call(fromMathJson(head), args.map(fromMathJson));
  }

  const record = asRecord(value);
  if (!record) return fallbackInvalid("invalid_mathjson_value", value);
  return fromMathJsonRecord(record);
}

function normalizeSymbolName(value: string): string {
  if (value === "Pi") return String.raw`\pi`;
  return value;
}
