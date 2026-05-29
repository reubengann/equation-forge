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
