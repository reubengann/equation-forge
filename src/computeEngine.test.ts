import { describe, it, expect, vi } from "vitest";
import { box, parse, normalizeMathJson, withRealScope } from "./computeEngine";
import { ExpressionTree } from "./ExpressionTree";

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

  it("parses \\frac partial derivative into FractionPartialDerivative", () => {
    expect(parse(String.raw`\frac{\partial u}{\partial T}`)).toEqual([
      "FractionPartialDerivative",
      ["Partial", "u"],
      ["Partial", "T"],
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

  it("parses subscripted partial-derivative coefficient with trailing differential", () => {
    const mj = parse(
      String.raw`du = \left(\dfrac{\partial {u}}{\partial {T}}\right)_v \, dT`
    );
    expect(mj).not.toBeNull();
    expect(JSON.stringify(mj)).toContain('"Partial"');
    expect(() => ExpressionTree.create(mj!)).not.toThrow();
  });

  it("normalizes plain differential tokens and d'q into atomic Differential nodes", () => {
    const mj = parse(String.raw`d'q = du + P dv`);
    expect(mj).not.toBeNull();
    expect(JSON.stringify(mj)).toContain('"Differential"');
    expect(JSON.stringify(mj)).toContain('"InexactDifferential"');
    const tree = ExpressionTree.create(mj!);
    expect(tree.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}'{q} = \mathrm{d}{u} + P \mathrm{d}{v}`
    );
  });

  it("normalizes dv after multiplicative factors without explicit spacing (issue 22)", () => {
    const mj = parse(String.raw`d'q = du + P dv`);
    expect(mj).not.toBeNull();
    const tree = ExpressionTree.create(mj!);
    expect(tree.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}'{q} = \mathrm{d}{u} + P \mathrm{d}{v}`
    );
  });

  it("does not parse spaced d e as a differential (issue 27)", () => {
    const mj = parse(String.raw`a = b c + d e - e f`);
    expect(mj).not.toBeNull();
    const tree = ExpressionTree.create(mj!);
    const latex = tree.latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`a = b c + d e - e f`);
    expect(latex.includes(String.raw`\mathrm{d}{e}`)).toBe(false);
  });

  it("parses tight de as a differential while spaced d e stays multiplicative", () => {
    const tight = parse(String.raw`a = b c + de - e f`);
    const spaced = parse(String.raw`a = b c + d e - e f`);
    expect(tight).not.toBeNull();
    expect(spaced).not.toBeNull();

    const tightLatex = ExpressionTree.create(tight!).latexPlain
      .replace(/\s+/g, " ")
      .trim();
    const spacedLatex = ExpressionTree.create(spaced!).latexPlain
      .replace(/\s+/g, " ")
      .trim();

    expect(tightLatex).toContain(String.raw`\mathrm{d}{e}`);
    expect(spacedLatex).toBe(String.raw`a = b c + d e - e f`);
  });

  it("normalizes \\mathrm{d}'q into InexactDifferential", () => {
    const mj = parse(String.raw`\mathrm{d}'q = \mathrm{d}u + P \, \mathrm{d}v`);
    expect(mj).not.toBeNull();
    expect(JSON.stringify(mj)).toContain('"InexactDifferential"');
    const tree = ExpressionTree.create(mj!);
    expect(tree.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}'{q} = \mathrm{d}{u} + P \mathrm{d}{v}`
    );
  });

  it("normalizes tight d' terms on both addends (issue 55)", () => {
    const mj = parse(String.raw`dU = d'Q - d'W`);
    expect(mj).not.toBeNull();
    const asJson = JSON.stringify(mj);
    expect(asJson.match(/"InexactDifferential"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    const tree = ExpressionTree.create(mj!);
    expect(tree.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}{U} = \mathrm{d}'{Q} - \mathrm{d}'{W}`
    );
  });

  it("keeps partial derivatives in fraction form inside subscripted coefficients", () => {
    const mj = parse(
      String.raw`du = \left(\dfrac{\partial u}{\partial T}\right)_v \, dT + \left(\dfrac{\partial u}{\partial v}\right)_T \, dv`
    );
    expect(mj).not.toBeNull();
    const tree = ExpressionTree.create(mj!);
    const latex = tree.latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\frac{\partial{u}}{\partial{T}}`);
    expect(latex).toContain(String.raw`\frac{\partial{u}}{\partial{v}}`);
  });

  it("round-trips user thermodynamics form with \\frac partials", () => {
    const mj = parse(
      String.raw`\mathrm{d}'{q} = \left(\frac{\partial{u}}{\partial{T}}\right)_{v}  \mathrm{d}{T} + \left(\frac{\partial{u}}{\partial{v}}\right)_{T}  \mathrm{d}{v} + P  \mathrm{d}{v}`
    );
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\frac{\partial{u}}{\partial{T}}`);
    expect(latex).toContain(String.raw`\frac{\partial{u}}{\partial{v}}`);
  });

  it("keeps parentheses when multiplying by a subscripted partial derivative (issue 67)", () => {
    const mj = parse(String.raw`P \left(\frac{\partial{v}}{\partial{T}}\right)_P`);
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`P \left(\frac{\partial{v}}{\partial{T}}\right)_{P}`);
  });

  it("keeps greek mu as a greek symbol with numeric subscript (issue 71)", () => {
    const mj = parse(String.raw`\mu_0`);
    expect(mj).toEqual(["Subscript", "mu", 0]);
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`\mu_{0}`);
  });

  it("fixes blank integrals while preserving unresolved tuple placeholders", () => {
    const mj = normalizeMathJson([
      "Integrate",
      "unexpected-command",
      ["Tuple", "Nothing", undefined, undefined],
    ] as any);
    expect(mj).toEqual(["Integrate", 1, ["Tuple", "Nothing", "Nothing", "Nothing"]]);
  });

  it("collapses single-term Add wrappers", () => {
    const mj = normalizeMathJson([
      "Divide",
      ["Add", ["InvisibleOperator", ["Subscript", "c", "V"], ["Differential", "T"]]],
      ["Differential", "v"],
    ] as any);
    expect(mj).toEqual([
      "Divide",
      ["InvisibleOperator", ["Subscript", "c", "V"], ["Differential", "T"]],
      ["Differential", "v"],
    ]);
  });

  it("flattens nested Add trees to an associative canonical shape", () => {
    const mj = normalizeMathJson([
      "Equal",
      ["Differential", "h"],
      [
        "Add",
        ["Differential", "u"],
        [
          "Add",
          ["InvisibleOperator", "P", ["Differential", "v"]],
          ["InvisibleOperator", ["Differential", "P"], "v"],
        ],
      ],
    ] as any);
    expect(mj).toEqual([
      "Equal",
      ["Differential", "h"],
      [
        "Add",
        ["Differential", "u"],
        ["InvisibleOperator", "P", ["Differential", "v"]],
        ["InvisibleOperator", ["Differential", "P"], "v"],
      ],
    ]);
  });

  it("flattens nested multiplicative trees to an associative canonical shape", () => {
    const mj = normalizeMathJson([
      "Negate",
      [
        "InvisibleOperator",
        ["InvisibleOperator", ["List", ["Add", "a", "b"]], ["Differential", "P"]],
        ["Divide", 1, ["Differential", "T"]],
      ],
    ] as any);
    expect(mj).toEqual([
      "Negate",
      [
        "InvisibleOperator",
        ["List", ["Add", "a", "b"]],
        ["Differential", "P"],
        ["Divide", 1, ["Differential", "T"]],
      ],
    ]);
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
