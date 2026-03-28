import { describe, it, expect, vi } from "vitest";
import { box, parse, normalizeMathJson, withRealScope } from "./computeEngine";

describe("computeEngine custom dictionary", () => {
  it("parses differential symbol", () => {
    expect(parse(String.raw`\differentialD x`)).toEqual(["Differential", "x"]);
  });

  it("parses derivative fraction", () => {
    expect(
      parse(String.raw`\dfrac{\differentialD f}{\differentialD x}`),
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
    expect(parse(String.raw`\int_{0}^{5} x^2 \,\mathrm{d}x`)).toEqual([
      "Integrate",
      ["Power", "x", 2],
      ["Tuple", "x", 0, 5],
    ]);
  });

  it("parses indefinite integral with differential", () => {
    expect(parse(String.raw`\int f(x) \,\mathrm{d}x`)).toEqual([
      "Integrate",
      ["InvisibleOperator", "f", ["Delimiter", "x"]],
      "x",
    ]);
  });

  it("serializes FractionDerivative to LaTeX", () => {
    const expr = box([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", "x"],
    ]);
    const latex = expr.toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe("\\dfrac{\\mathrm{d}{f}}{\\mathrm{d}{x}}");
  });

  it("serializes FractionPartialDerivative to LaTeX", () => {
    const expr = box([
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

  it("canonicalizes Delta quantity into DeltaOfQuantity object", () => {
    expect(parse(String.raw`\Delta t`)).toEqual(["DeltaOfQuantity", "t"]);
    expect(parse(String.raw`\Delta E`)).toEqual(["DeltaOfQuantity", "E"]);
    expect(parse(String.raw`a \Delta t`)).toEqual([
      "InvisibleOperator",
      "a",
      ["DeltaOfQuantity", "t"],
    ]);
  });

  it("serializes DeltaOfQuantity back to Delta form", () => {
    const latex = box(["DeltaOfQuantity", "E"]).toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe(String.raw`\Delta E`);
  });

  it("keeps standalone Delta as a symbol", () => {
    const latex = box("Delta").toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe(String.raw`\Delta`);
  });

  it("has negate outside of the product", () => {
    const mj = parse("a - b c");
    expect(mj).toEqual([
      "Add",
      "a",
      ["Negate", ["InvisibleOperator", "b", "c"]],
    ]);
  });

  it("parses dot product between vectors", () => {
    const mj = parse(String.raw`\vec{a} \cdot \vec{b}`);
    expect(mj).toEqual(["DotProduct", ["Vector", "a"], ["Vector", "b"]]);
  });

  it("pulls out scalar factors around a dot product", () => {
    const mj = parse(String.raw`\vec{a} \cdot b \vec{c}`);
    expect(mj).toEqual([
      "DotProduct",
      ["Vector", "a"],
      ["InvisibleOperator", "b", ["Vector", "c"]],
    ]);
  });

  it("parses integral with non-symbol differential operand", () => {
    const mj = parse(
      String.raw`\int_{0}^{v_0^2}\differentialD\left(\dot{x}^2\right)`,
    );
    expect(mj).toEqual([
      "Integrate",
      1,
      [
        "Tuple",
        ["Power", ["OverDot", "x", 1], 2],
        0,
        ["Power", ["Subscript", "v", 0], 2],
      ],
    ]);
  });

  it("parses primes", () => {
    const mj = parse(String.raw`x''`);
    expect(mj).toEqual(["Prime", "x", 2]);
  });

  it("parses inverse tangent", () => {
    expect(parse(String.raw`\tan^{-1} x`)).toEqual([
      "Apply",
      ["InverseFunction", "Tan"],
      "x",
    ]);
  });

  it("parses explicit vector macro", () => {
    expect(parse(String.raw`\vec{v}`)).toEqual(["Vector", "v"]);
    expect(parse(String.raw`\vec w`)).toEqual([
      "InvisibleOperator",
      ["Vector"],
      "w",
    ]);
  });

  it("injects implicit 1 when integrand is missing", () => {
    expect(parse(String.raw`\int \,\mathrm{d}{x}`)).toEqual([
      "Integrate",
      1,
      "x",
    ]);
  });

  it("parses differential-only integral form", () => {
    expect(parse(String.raw`\int_{0}^{2}\differentialD(y)`)).toEqual([
      "Integrate",
      1,
      ["Tuple", ["Delimiter", "y"], 0, 2],
    ]);
  });

  it("fixes blank integrals and fills tuple defaults", () => {
    const mj = normalizeMathJson([
      "Integrate",
      "unexpected-command",
      ["Tuple", "Nothing", undefined, undefined],
    ] as any);
    expect(mj).toEqual(["Integrate", 1, ["Tuple", "x", 0, 0]]);
  });

  it("serializes ddot correctly", () => {
    const latex = box(["OverDot", "q", 2]).toLatex().replace(/\\\\/g, "\\");
    expect(latex).toBe("\\ddot{q}");
  });

  it("withRealScope declares symbols and skips numerics", () => {
    const engine = (box(0) as any).engine;
    const declareSpy = vi.spyOn(engine, "declare");
    const pushSpy = vi.spyOn(engine, "pushScope");
    const popSpy = vi.spyOn(engine, "popScope");

    const result = withRealScope(
      ["InvisibleOperator", "a", "2", ["Apply", "f", "b"]] as any,
      () => 42,
    );

    expect(result).toBe(42);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(popSpy).toHaveBeenCalledTimes(1);
    expect(declareSpy).toHaveBeenCalledWith("a", "real");
    expect(declareSpy).toHaveBeenCalledWith("b", "real");
    // Numeric literal should not be declared.
    expect(declareSpy.mock.calls.some((args) => args[0] === "2")).toBe(false);

    declareSpy.mockRestore();
    pushSpy.mockRestore();
    popSpy.mockRestore();
  });
});
