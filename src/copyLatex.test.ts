import { describe, expect, it } from "vitest";
import { formatEquationHistoryLatexForCopy, formatEquationLatexForCopy } from "./copyLatex";

describe("formatEquationLatexForCopy", () => {
  it("returns raw equation latex when display math wrapping is disabled", () => {
    expect(formatEquationLatexForCopy(String.raw`a+b=c`, false)).toBe(String.raw`a+b=c`);
  });

  it("wraps equation latex in display math delimiters when enabled", () => {
    expect(formatEquationLatexForCopy(String.raw`a+b=c`, true)).toBe(String.raw`$$a+b=c$$`);
  });
});

describe("formatEquationHistoryLatexForCopy", () => {
  it("copies each equation history entry as a display math line", () => {
    expect(formatEquationHistoryLatexForCopy([String.raw`a+b=c`, String.raw`a=c-b`])).toBe(
      String.raw`$$a+b=c$$` + "\n" + String.raw`$$a=c-b$$`,
    );
  });
});
