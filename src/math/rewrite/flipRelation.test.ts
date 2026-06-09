import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../adapters/latex";
import { add, sym } from "../ast";
import { canRun, run } from "./flipRelation";

function flipLatex(latex: string): string {
  return exprToLatex(run(parseLatexToExpr(latex)), false);
}

describe("flipRelation", () => {
  it("can run on equations and inequalities", () => {
    expect(canRun(parseLatexToExpr("a=b"))).toBe(true);
    expect(canRun(parseLatexToExpr("a<b"))).toBe(true);
    expect(canRun(add([sym("a"), sym("b")]))).toBe(false);
  });

  it("flips the sides of a two-sided equation", () => {
    expect(flipLatex("a=b")).toBe("b = a");
  });

  it("reverses all sides of a multi-sided equation", () => {
    expect(flipLatex("a=b=c=d")).toBe("d = c = b = a");
  });

  it("keeps the middle side in place for a three-sided equation", () => {
    expect(flipLatex("a=b=c")).toBe("c = b = a");
  });

  it("flips inequality sides and directions", () => {
    expect(flipLatex(String.raw`a \leq b`)).toBe(String.raw`b \geq a`);
    expect(flipLatex(String.raw`a \geq b`)).toBe(String.raw`b \leq a`);
    expect(flipLatex("a < b")).toBe("b > a");
    expect(flipLatex("a > b")).toBe("b < a");
  });
});
