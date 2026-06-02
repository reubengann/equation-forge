import Algebrite from "algebrite";
import { describe, expect, it } from "vitest";
import { fromAlgebrite } from "./fromAlgebrite";
import { createSymbolSubstitution } from "./toAlgebrite";

describe("fromAlgebrite", () => {
  it("maps core arithmetic/operator nodes into typed AST", () => {
    const expr = fromAlgebrite(Algebrite.parse("x+1/2*y"));

    expect(expr).toEqual({
      kind: "add",
      terms: [
        { kind: "symbol", name: "x" },
        {
          kind: "multiply",
          factors: [
            {
              kind: "divide",
              numerator: { kind: "number", value: 1 },
              denominator: { kind: "number", value: 2 },
            },
            { kind: "symbol", name: "y" },
          ],
        },
      ],
    });
  });

  it("lifts negative rational product coefficients into a subtraction term", () => {
    const expr = fromAlgebrite(Algebrite.parse("-1/2*b*T_0^2"));

    expect(expr).toEqual({
      kind: "negate",
      notation: "subtraction",
      value: {
        kind: "multiply",
        factors: [
          {
            kind: "divide",
            numerator: { kind: "number", value: 1 },
            denominator: { kind: "number", value: 2 },
          },
          { kind: "symbol", name: "b" },
          {
            kind: "power",
            base: { kind: "symbol", name: "T_0" },
            exponent: { kind: "number", value: 2 },
          },
        ],
      },
    });
  });

  it("lifts negative fraction numerators into a subtraction term", () => {
    const expr = fromAlgebrite(Algebrite.parse("-2*a/v"));

    expect(expr).toEqual({
      kind: "negate",
      notation: "subtraction",
      value: {
        kind: "divide",
        numerator: {
          kind: "multiply",
          factors: [
            { kind: "number", value: 2 },
            { kind: "symbol", name: "a" },
          ],
        },
        denominator: { kind: "symbol", name: "v" },
      },
    });
  });

  it("restores substituted symbol names", () => {
    const symbols = createSymbolSubstitution();
    symbols.originalBySafe.set("__pdp0", String.raw`\mu_s`);

    expect(fromAlgebrite(Algebrite.usr_symbol("__pdp0"), symbols)).toEqual({
      kind: "symbol",
      name: String.raw`\mu_s`,
    });
  });

  it("maps Algebrite's Euler symbol back to app-level e", () => {
    expect(fromAlgebrite(Algebrite.parse("e"))).toEqual({
      kind: "symbol",
      name: "e",
    });
  });
});
