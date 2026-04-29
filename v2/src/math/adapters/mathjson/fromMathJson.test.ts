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

  it("wraps unsupported forms in raw_mathjson nodes instead of leaking MathJSON", () => {
    const expr = fromMathJson({ something: "unknown" });
    expect(expr).toEqual({
      kind: "raw_mathjson",
      reason: "unsupported_mathjson_record",
      value: { something: "unknown" },
    });
  });
});
