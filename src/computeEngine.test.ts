import { describe, it, expect, vi } from "vitest";
import { box, parse, normalizeMathJson, withRealScope } from "./computeEngine";
import { ExpressionTree } from "./ExpressionTree";

function hasErrorNode(expr: unknown): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Error") return true;
  return expr.slice(1).some((child) => hasErrorNode(child));
}

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

  it("parses bare partial-operator fraction", () => {
    expect(parse(String.raw`\dfrac{\partial}{\partial x}`)).toEqual([
      "FractionPartialDerivative",
      "PartialD",
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

  it("parses negated bounded integral with differential fraction from plain text (issue 95)", () => {
    const mj = parse(String.raw`-\int_{T_1}^{T_{f}}\frac{\mathrm{d}{T_{c}}}{T_{c}}`);
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`-\int_{T_{1}}^{T_{f}} \frac{\mathrm{d}{T_{c}}}{T_{c}}`);
  });

  it("keeps differentials inside bounded integrals with symbolic sqrt bounds (issue 95)", () => {
    const mj = parse(
      String.raw`W=-\int_{T_{1}}^{\sqrt{T_{1} T_{2}}} C_{P} \mathrm{d}{T_{c}}-\int_{T_{2}}^{\sqrt{T_{1} T_{2}}} C_{P} \mathrm{d}{T_{h}}`
    );
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\mathrm{d}{T_{c}}`);
    expect(latex).toContain(String.raw`\mathrm{d}{T_{h}}`);
    expect(latex).not.toContain(String.raw`C_{P} T_{c}`);
    expect(latex).not.toContain(String.raw`C_{P} T_{h}`);
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

  it("parses tight differential tokens after multiplicative factors (issue 107)", () => {
    const mj = parse(String.raw`Tds`);
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`T \mathrm{d}{s}`);
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

  it("normalizes mixed exact/inexact differential fraction input (issue 92)", () => {
    const mj = parse(String.raw`\frac{\mathrm{d}'{W}}{d'Q} = 1 - \frac{T_{c}}{T_{h}}`);
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(
      String.raw`\frac{\mathrm{d}'{W}}{\mathrm{d}'{Q}} = 1 - \frac{T_{c}}{T_{h}}`
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

  it("preserves mixed second-order partial factors in denominator (issue 105)", () => {
    const mj = parse(String.raw`\dfrac{\partial^2u}{\partial v\partial T}`);
    expect(mj).not.toBeNull();
    expect(mj).toEqual([
      "FractionPartialDerivative",
      ["Partial", ["Partial", "u"]],
      ["InvisibleOperator", ["Partial", "v"], ["Partial", "T"]],
    ]);
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`\frac{\partial^{2}{u}}{\partial{v} \partial{T}}`);
  });

  it("parses equations containing rendered mixed partial notation", () => {
    const mj = parse(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}} = \left(\frac{\partial}{\partial{P}}\right)\left(\frac{c_{P}}{T}\right)`
    );
    expect(mj).not.toBeNull();
    expect(Array.isArray(mj) && mj[0] === "Equal").toBe(true);
    expect(hasErrorNode(mj)).toBe(false);
  });

  it("preserves scalar prefactor order ahead of applied bare partial operator", () => {
    const mj = parse(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}} = \frac{1}{T} \left(\frac{\partial}{\partial{P}}\right) \left(c_{P}\right)`
    );
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}} = \frac{1}{T} \left(\frac{\partial}{\partial{P}}\right) \left(c_{P}\right)`
    );
  });

  it("keeps greek mu as a greek symbol with numeric subscript (issue 71)", () => {
    const mj = parse(String.raw`\mu_0`);
    expect(mj).toEqual(["Subscript", "mu", 0]);
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`\mu_{0}`);
  });

  it("preserves parentheses around fractional power bases (issue 72)", () => {
    const mj = parse(String.raw`P\left(\frac{1}{2}\right)^2`);
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`P \left(\frac{1}{2}\right)^{2}`);
  });

  it("parses equality of differential-only and inexact-differential-only integrals (issue 72)", () => {
    const mj = parse(String.raw`\int \mathrm{d}{U} = \int \mathrm{d}'{Q}`);
    expect(mj).toEqual([
      "Equal",
      ["Integrate", 1, "U"],
      ["Integrate", ["InexactDifferential", "Q"], "Nothing"],
    ]);
    expect(() => ExpressionTree.create(mj!)).not.toThrow();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`\int \,\mathrm{d}{U} = \int \mathrm{d}'{Q}`);
  });

  it("preserves grouped differential operands with visible parentheses (issue 73)", () => {
    const mj = parse(
      String.raw`\mathrm{d}{\left(P V\right)} = \mathrm{d}{\left(n R T\right)}`
    );
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(
      String.raw`\mathrm{d}{\left(P V\right)} = \mathrm{d}{\left(n R T\right)}`
    );
  });

  it("parses MathLive bracket aliases as standard square delimiters (issue 108)", () => {
    const mj = parse(
      String.raw`\frac{1}{T}a=\frac{1}{T}\left\lbrack a+\left(\dfrac{\partial P}{\partial T}\right)_{v}\right\rbrack-\frac{1}{T^2}\left\lbrack\left(\dfrac{\partial u}{\partial v}\right)_{T}+P\right\rbrack`
    );
    expect(mj).not.toBeNull();
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\left[`);
    expect(latex).toContain(String.raw`\right]`);
    expect(latex).not.toContain(String.raw`\lbrack`);
    expect(latex).not.toContain(String.raw`\rbrack`);
  });

  it("promotes spaced plain d before uppercase symbols to Differential (issue 73)", () => {
    const mj = parse(String.raw`V d P = \mathrm{d}{\left(n R T\right)}`);
    expect(mj).not.toBeNull();
    expect(JSON.stringify(mj)).toContain('"Differential"');
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(
      String.raw`V \mathrm{d}{P} = \mathrm{d}{\left(n R T\right)}`
    );
  });

  it("renders script symbols inside subscripts (issue 74)", () => {
    const mj = parse(String.raw`C_{\mathscr{H}}`);
    expect(mj).toEqual(["Subscript", "C", "H_script"]);
    const latex = ExpressionTree.create(mj!).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toBe(String.raw`C_{\mathscr{H}}`);
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
