import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canCycleDelimiterSelection, cycleDelimiterSelection } from "./cycleDelimiter";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("cycleDelimiterSelection", () => {
  it("cycles parentheses to brackets", () => {
    const document = buildDocument(String.raw`\left(a+b\right)`);
    const next = cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left[a + b\right]`);
  });

  it("cycles brackets to parentheses", () => {
    const document = buildDocument(String.raw`\left[a+b\right]`);
    const next = cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)`);
  });

  it("rejects brace delimiter selections", () => {
    const document = buildDocument(String.raw`\left\{a+b\right\}`);

    expect(canCycleDelimiterSelection(document, { kind: "single", nodeId: "n1" })).toBe(false);
    expect(cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" })).toBeNull();
  });

  it("cycles function call parentheses to brackets", () => {
    const document = buildDocument(String.raw`\sin\left(x+y\right)`);
    const next = cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\sin\left[x + y\right]`);
  });

  it("cycles function call brackets to parentheses", () => {
    const document = buildDocument(String.raw`\sin\left[x+y\right]`);
    const next = cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\sin\left(x + y\right)`);
  });

  it("rejects bare function calls", () => {
    const document = buildDocument(String.raw`\sin x`);

    expect(canCycleDelimiterSelection(document, { kind: "single", nodeId: "n1" })).toBe(false);
    expect(cycleDelimiterSelection(document, { kind: "single", nodeId: "n1" })).toBeNull();
  });

  it("rejects non-delimiter selections", () => {
    const document = buildDocument(String.raw`a+b`);

    expect(canCycleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(false);
    expect(cycleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBeNull();
  });
});
