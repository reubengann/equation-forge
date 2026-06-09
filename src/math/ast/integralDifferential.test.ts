import { describe, expect, it } from "vitest";
import {
  add,
  divide,
  differential,
  findIntegralDifferentialVariable,
  multiply,
  sym,
} from ".";

describe("findIntegralDifferentialVariable", () => {
  it("finds first differential variable in integrand structure", () => {
    const integrand = multiply([sym("x"), differential(sym("t"))]);
    const variable = findIntegralDifferentialVariable(integrand);
    expect(variable).toMatchObject({ kind: "symbol", name: "t" });
  });

  it("ignores malformed relation-level roots", () => {
    const malformedIntegrand = {
      kind: "inequality" as const,
      operator: "lt" as const,
      lhs: differential(sym("x")),
      rhs: sym("y"),
    };
    const variable = findIntegralDifferentialVariable(malformedIntegrand);
    expect(variable).toBeNull();
  });

  it("does not recurse beyond top-level multiply factors", () => {
    const nested = multiply([sym("x"), add([differential(sym("t")), sym("y")])]);
    const variable = findIntegralDifferentialVariable(nested);
    expect(variable).toBeNull();
  });

  it("finds differential in top-level divide numerator", () => {
    const integrand = divide(
      multiply([differential(sym("x")), sym("f")]),
      sym("g"),
    );
    const variable = findIntegralDifferentialVariable(integrand);
    expect(variable).toMatchObject({ kind: "symbol", name: "x" });
  });
});
