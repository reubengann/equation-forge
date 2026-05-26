import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canToggleNegateSelection, toggleNegateSelection } from "./toggleNegate";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("toggleNegateSelection", () => {
  it("pulls negation out of a selected delimiter", () => {
    const document = buildDocument(String.raw`\left(-a-b\right)`);
    const next = toggleNegateSelection(document, "n1");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-\left(a + b\right)`);
  });

  it("pushes an outer negation into a selected delimiter", () => {
    const document = buildDocument(String.raw`-\left(a+b\right)`);
    const next = toggleNegateSelection(document, "n2");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(-a - b\right)`);
  });

  it("pushes an outer negation when the negation node is selected", () => {
    const document = buildDocument(String.raw`-\left(a+b\right)`);
    const next = toggleNegateSelection(document, "n1");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(-a - b\right)`);
  });

  it("rejects non-delimiter selections", () => {
    const document = buildDocument(String.raw`-a-b`);

    expect(canToggleNegateSelection(document, "n1")).toBe(false);
    expect(toggleNegateSelection(document, "n1")).toBeNull();
  });
});
