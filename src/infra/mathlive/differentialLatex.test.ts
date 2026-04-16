import { describe, it, expect } from "vitest";
import { fromMathLiveLatex, toMathLiveLatex } from "./differentialLatex";

describe("differentialLatex helpers", () => {
  it("converts canonical display to MathLive form", () => {
    expect(toMathLiveLatex(String.raw`\mathrm{d}{x}`)).toBe(
      String.raw`\differentialD x`
    );
    expect(toMathLiveLatex(String.raw`\mathrm{d}x`)).toBe(
      String.raw`\differentialD x`
    );
    expect(toMathLiveLatex(String.raw`\frac{\mathrm{d}{f}}{\mathrm{d}{t}}`)).toBe(
      String.raw`\frac{\differentialD f}{\differentialD t}`
    );
    expect(toMathLiveLatex(String.raw`\mathrm{d}\theta`)).toBe(
      String.raw`\differentialD {\theta}`
    );
    expect(toMathLiveLatex(String.raw`\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{x}}`)).toBe(
      String.raw`\frac{\differentialD {P_{s}}}{\differentialD x}`
    );
    expect(toMathLiveLatex(String.raw`\int \mathrm{d}'{Q}`)).toBe(
      String.raw`\int \mathrm{d}'{Q}`
    );
  });

  it("converts MathLive form back to canonical display", () => {
    expect(fromMathLiveLatex(String.raw`\differentialD x`)).toBe(
      String.raw`\mathrm{d}{x}`
    );
    expect(
      fromMathLiveLatex(
        String.raw`\dfrac{\differentialD f}{\differentialD x} + \differentialD {\theta}`
      )
    ).toBe(String.raw`\dfrac{\mathrm{d}{f}}{\mathrm{d}{x}} + \mathrm{d}{\theta}`);
    expect(fromMathLiveLatex(String.raw`\frac{\differentialD {P_{s}}}{\differentialD x}`)).toBe(
      String.raw`\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{x}}`
    );
    expect(fromMathLiveLatex(String.raw`\inexactDifferentialD Q`)).toBe(
      String.raw`\mathrm{d}'{Q}`
    );
    expect(fromMathLiveLatex(String.raw`Tds`)).toBe(
      String.raw`T\mathrm{d}{s}`
    );
    expect(
      fromMathLiveLatex(
        String.raw`\frac{1}{T}\left\lbrack a+\left(\dfrac{\partial P}{\partial T}\right)_{v}\right\rbrack`
      )
    ).toBe(
      String.raw`\frac{1}{T}\left[ a+\left(\dfrac{\partial P}{\partial T}\right)_{v}\right]`
    );
  });

  it("scrubs MathLive internal aliases", () => {
    expect(
      fromMathLiveLatex(
        String.raw`\dfrac{d_upright f}{d_upright x} + \mathrm{d}{Nothing} t`
      )
    ).toBe(String.raw`\dfrac{\mathrm{d}{f}}{\mathrm{d}{x}} + \mathrm{d}{t}`);

    expect(fromMathLiveLatex(String.raw`\mathrm{d}t`)).toBe(
      String.raw`\mathrm{d}{t}`
    );
  });
});
