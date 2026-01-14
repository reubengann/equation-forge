import { describe, it, expect } from "vitest";
import { ce } from "./computeEngine";

const parse = (latex: string) =>
  ce.parse(latex, { canonical: false })?.json ?? null;

describe("computeEngine custom dictionary", () => {
  it("parses differential symbol", () => {
    expect(parse(String.raw`\differentialD x`)).toEqual([
      "Differential",
      "x",
    ]);
  });

  it("parses derivative fraction", () => {
    expect(
      parse(String.raw`\dfrac{\differentialD f}{\differentialD x}`)
    ).toEqual([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", "x"],
    ]);
  });

  it("parses partial derivative fraction", () => {
    expect(parse(String.raw`\dfrac{\partial f}{\partial x}`)).toEqual([
      "FractionPartialDerivative",
      ["Partial", "f"],
      ["Partial", "x"],
    ]);
  });

  it("falls back to Divide when differential is missing", () => {
    expect(parse(String.raw`\dfrac{\differentialD f}{b}`)).toEqual([
      "Divide",
      ["Differential", "f"],
      "b",
    ]);
  });

  it("parses definite integral with bounds and differential", () => {
    expect(
      parse(String.raw`\int_{0}^{5} x^2 \,\mathrm{d}x`)
    ).toEqual(["Integrate", ["Power", "x", 2], ["Tuple", "x", 0, 5]]);
  });

  it("parses indefinite integral with differential", () => {
    expect(parse(String.raw`\int f(x) \,\mathrm{d}x`)).toEqual([
      "Integrate",
      ["InvisibleOperator", "f", ["Delimiter", "x"]],
      "x",
    ]);
  });

  it("serializes FractionDerivative to LaTeX", () => {
    const expr = ce.box([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", "x"],
    ]);
    const latex = expr.toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe("\\dfrac{\\mathrm{d}{f}}{\\mathrm{d}{x}}");
  });

  it("serializes FractionPartialDerivative to LaTeX", () => {
    const expr = ce.box([
      "FractionPartialDerivative",
      ["Partial", "f"],
      ["Partial", "x"],
    ]);
    const latex = expr.toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe("\\dfrac{\\partial{f}}{\\partial{x}}");
  });

  it("parses exp with implicit argument", () => {
    expect(parse(String.raw`\exp x`)).toEqual([
      "InvisibleOperator",
      "Exp",
      "x",
    ]);
  });
});
