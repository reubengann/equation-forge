import { describe, expect, it } from "vitest";
import { multiply, sym, type Expr } from "../ast";
import { flipSign, normalizeLegacyNegates, splitSign, withSign } from "./algebraUtils";

describe("algebraUtils sign helpers", () => {
  it("stores sign as expression metadata", () => {
    expect(flipSign(sym("a"))).toEqual({ kind: "symbol", name: "a", sign: -1 });
    expect(flipSign(sym("a", { sign: -1 }))).toEqual({ kind: "symbol", name: "a" });
  });

  it("splits sign from the unsigned expression shape", () => {
    const expr = multiply([sym("a"), sym("b")], { sign: -1 });

    expect(splitSign(expr)).toEqual({
      sign: -1,
      value: { kind: "multiply", factors: [{ kind: "symbol", name: "a" }, { kind: "symbol", name: "b" }] },
    });
  });

  it("normalizes legacy negate wrappers into sign metadata", () => {
    const legacy = {
      kind: "negate",
      value: withSign(sym("a"), -1),
    } satisfies Expr;

    expect(normalizeLegacyNegates(legacy)).toEqual({ kind: "symbol", name: "a" });
  });
});
