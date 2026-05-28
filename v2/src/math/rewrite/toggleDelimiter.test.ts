import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canToggleDelimiterSelection, toggleDelimiterSelection } from "./toggleDelimiter";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("toggleDelimiterSelection", () => {
  it("adds delimiters around a selected whole sum", () => {
    const document = buildDocument(String.raw`a+b`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)`);
  });

  it("adds delimiters around a selected single term", () => {
    const document = buildDocument(String.raw`a+b`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a\right) + b`);
  });

  it("removes delimiters around a product inside a product", () => {
    const document = buildDocument(String.raw`\left(a b\right)c`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a b c");
  });

  it("does not remove delimiters around a sum inside a product", () => {
    const document = buildDocument(String.raw`\left(a+b\right)c`);

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(false);
    expect(toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBeNull();
  });

  it("removes delimiters around a single term inside a sum", () => {
    const document = buildDocument(String.raw`\left(a+\left(b\right)\right)`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n4" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)`);
  });

  it("removes delimiters around a whole fraction numerator", () => {
    const document = buildDocument(String.raw`\frac{\left(1+\cos\left(2 x\right)\right)}{2}`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{1 + \cos\left(2 x\right)}{2}`);
  });

  it("adds delimiters around contiguous selected additive terms", () => {
    const document = buildDocument(String.raw`a+b+c`);
    const next = toggleDelimiterSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n3", "n4"] },
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a + \left(b + c\right)`);
  });

  it("adds delimiters around contiguous selected multiplicative factors", () => {
    const document = buildDocument(String.raw`a b c`);
    const next = toggleDelimiterSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n3", "n4"] },
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a \left(b c\right)`);
  });

  it("does not add delimiters around non-contiguous selected terms", () => {
    const document = buildDocument(String.raw`a+b+c`);

    expect(canToggleDelimiterSelection(document, { kind: "multi", containerNodeId: "n1", nodeIds: ["n2", "n4"] })).toBe(false);
    expect(toggleDelimiterSelection(document, { kind: "multi", containerNodeId: "n1", nodeIds: ["n2", "n4"] })).toBeNull();
  });
});
