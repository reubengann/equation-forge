import { describe, expect, it } from "vitest";
import { fromMathJson } from "./fromMathJson";

describe("fromMathJson", () => {
  it("maps core arithmetic/operator nodes into typed AST", () => {
    const expr = fromMathJson(["Equal", ["Add", "a", 2], ["Divide", "b", 3]]);
    expect(expr).toEqual({
      kind: "equation",
      sides: [
        {
          kind: "add",
          terms: [{ kind: "symbol", name: "a" }, { kind: "number", value: 2 }],
        },
        {
          kind: "divide",
          numerator: { kind: "symbol", name: "b" },
          denominator: { kind: "number", value: 3 },
        },
      ],
    });
  });

  it("preserves display grouping as distinct node type", () => {
    const expr = fromMathJson(["Delimiter", "(", ["Add", "x", 1], ")"]);
    expect(expr).toEqual({
      kind: "display_group",
      delimiter: "paren",
      expression: {
        kind: "add",
        terms: [{ kind: "symbol", name: "x" }, { kind: "number", value: 1 }],
      },
    });
  });

  it("maps unsupported forms to invalid_input", () => {
    const expr = fromMathJson({ something: "unknown" });
    expect(expr.kind).toBe("invalid_input");
    expect(expr.error).toContain("Unsupported MathJSON: unsupported_mathjson_record");
  });

  it("maps MathJSON negation and subtraction into signed expressions", () => {
    expect(fromMathJson(["Negate", "a"])).toEqual({ kind: "symbol", name: "a", sign: -1 });
    expect(fromMathJson(["Subtract", "a", "b"])).toEqual({
      kind: "add",
      terms: [
        { kind: "symbol", name: "a" },
        { kind: "symbol", name: "b", sign: -1 },
      ],
    });
  });

  it("maps CE rational and function heads back into internal AST", () => {
    const expr = fromMathJson(["Multiply", ["Rational", 1, 2], ["Sin", "x"]]);

    expect(expr).toEqual({
      kind: "multiply",
      factors: [
        {
          kind: "divide",
          numerator: { kind: "number", value: 1 },
          denominator: { kind: "number", value: 2 },
        },
        {
          kind: "call",
          callee: { kind: "symbol", name: "sin" },
          args: [{ kind: "symbol", name: "x" }],
          delimiter: "paren",
        },
      ],
    });
  });

  it("preserves parentheses for CE function calls with compound arguments", () => {
    const expr = fromMathJson(["Cos", ["Multiply", 2, "x"]]);

    expect(expr).toEqual({
      kind: "call",
      callee: { kind: "symbol", name: "cos" },
      args: [
        {
          kind: "multiply",
          factors: [{ kind: "number", value: 2 }, { kind: "symbol", name: "x" }],
        },
      ],
      delimiter: "paren",
    });
  });

  it("maps CE derivative and integral heads back into internal AST", () => {
    const derivative = fromMathJson(["D", ["Power", "x", 2], "x"]);
    const integral = fromMathJson(["Integrate", "x", ["Limits", "x", "Nothing", "Nothing"]]);

    expect(derivative.kind).toBe("full_derivative_operator");
    expect(integral.kind).toBe("integral");
    if (integral.kind === "integral") {
      expect(integral.lowerBound).toBeNull();
      expect(integral.upperBound).toBeNull();
      expect(integral.integrand).toEqual({
        kind: "multiply",
        factors: [
          { kind: "symbol", name: "x" },
          { kind: "differential", variable: { kind: "symbol", name: "x" } },
        ],
      });
    }
  });
});
