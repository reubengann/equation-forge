import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canEvaluateWithAlgebrite, evaluateSelectionWithAlgebrite } from "./algebrite";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("evaluateSelectionWithAlgebrite", () => {
  it("evaluates selected numeric arithmetic", () => {
    const document = buildDocument(String.raw`2+2`);
    const result = evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("4");
  });

  it("evaluates selected ordinary derivatives", () => {
    const document = buildDocument(String.raw`\frac{d}{dx} x^2`);
    const result = evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("2 x");
  });

  it("evaluates selected indefinite integrals", () => {
    const document = buildDocument(String.raw`\int x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe(String.raw`\frac{1}{2} x^{2}`);
  });

  it("evaluates selected definite integrals", () => {
    const document = buildDocument(String.raw`\int_0^\pi \sin x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("2");
  });

  it("prints negative rational definite integral terms as subtraction", () => {
    const document = buildDocument(String.raw`\int_{T_0}^{T} \left(a + b T\right) \,\mathrm{d}{T}`);
    const result = evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(exprToLatex(result.expr, false)).toBe(
        String.raw`a T - a T_0 + \frac{1}{2} b T^{2} - \frac{1}{2} b T_0^{2}`,
      );
    }
  });

  it("does not enable unsupported vector expressions", () => {
    const document = buildDocument(String.raw`\vec{v}`);

    expect(canEvaluateWithAlgebrite(document, { kind: "single", nodeId: "n1" })).toBe(false);
    expect(evaluateSelectionWithAlgebrite(document, { kind: "single", nodeId: "n1" })).toMatchObject({
      ok: false,
      reason: "not_translatable",
    });
  });
});
