import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { autoRewriteSelection, canAutoRewrite } from "./autoRewrite";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("autoRewriteSelection factor", () => {
  it("factors a common symbol out of a selected sum", () => {
    const document = buildDocument(String.raw`a b+c b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b \left(a + c\right)`);
  });

  it("factors a common factor from selected terms inside a larger sum", () => {
    const document = buildDocument(String.raw`a b+c b+d`);
    const next = autoRewriteSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n2", "n5"] },
      "factor",
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b \left(a + c\right) + d`);
  });

  it("preserves negative remainders when factoring", () => {
    const document = buildDocument(String.raw`a b-c b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b \left(a - c\right)`);
  });

  it("factors exact positive perfect-square trinomials", () => {
    const document = buildDocument(String.raw`a^2+2 a b+b^2`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)^{2}`);
  });

  it("factors exact negative perfect-square trinomials", () => {
    const document = buildDocument(String.raw`a^2-2 a b+b^2`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a - b\right)^{2}`);
  });

  it("does not factor sums without a common factor", () => {
    const document = buildDocument(String.raw`a+b`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "factor")).toBe(false);
    expect(autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor")).toBeNull();
  });
});
