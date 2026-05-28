import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canEvaluateWithComputeEngine, evaluateSelectionWithComputeEngine } from "./computeEngine";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("evaluateSelectionWithComputeEngine", () => {
  it("evaluates selected numeric arithmetic", () => {
    const document = buildDocument(String.raw`2+2`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("4");
  });

  it("evaluates selected ordinary derivatives", () => {
    const document = buildDocument(String.raw`\frac{d}{dx} x^2`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("2 x");
  });

  it("keeps CE-returned function arguments grouped after evaluation", () => {
    const document = buildDocument(String.raw`1+\cos\left(2 x\right)`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe(String.raw`\cos\left(2 x\right) + 1`);
  });

  it("evaluates selected indefinite integrals", () => {
    const document = buildDocument(String.raw`\int x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe(String.raw`\frac{1}{2} x^{2}`);
  });

  it("evaluates symbolic definite integrals by substituting v2 bounds", () => {
    const document = buildDocument(String.raw`2 \int_a^b \sin x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(exprToLatex(result.expr, false)).toBe(String.raw`2 \left(-\cos\left(b\right) + \cos\left(a\right)\right)`);
    }
  });

  it("evaluates numeric definite integrals through the guarded substitution path", () => {
    const document = buildDocument(String.raw`\int_0^\pi \sin x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe("2");
  });

  it("does not numerically approximate definite integrals after substituting bounds", () => {
    const document = buildDocument(String.raw`\int_{0}^{1} \sin x\,\mathrm{d}{x}`);
    const result = evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe(String.raw`1 - \cos\left(1\right)`);
  });

  it("enables and evaluates definite integrals whose lower bound is zero", () => {
    const document = buildDocument(String.raw`\int_{0}^{1} x^{2}\,\mathrm{d}{x}`);
    const selection = { kind: "single" as const, nodeId: "n1" };

    expect(canEvaluateWithComputeEngine(document, selection)).toBe(true);
    const result = evaluateSelectionWithComputeEngine(document, selection);

    expect(result.ok).toBe(true);
    if (result.ok) expect(exprToLatex(result.expr, false)).toBe(String.raw`\frac{1}{3}`);
  });

  it("does not enable unsupported special-font expressions", () => {
    const document = buildDocument(String.raw`\mathscr{H}`);

    expect(canEvaluateWithComputeEngine(document, { kind: "single", nodeId: "n1" })).toBe(false);
    expect(evaluateSelectionWithComputeEngine(document, { kind: "single", nodeId: "n1" })).toMatchObject({
      ok: false,
      reason: "not_translatable",
    });
  });
});
