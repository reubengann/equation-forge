import { describe, expect, it, test } from "vitest";
import { exprToLatex } from "../latex";
import { parseLatexToExpr } from "../latex/parseLatexToExpr";
import { canEvaluateAlgebrite, evaluateAlgebrite } from "./evaluate";
import { compileMathDocument, compileMathDocumentFromExpr } from "../../compile/compileMathDocument";
import { applyFunctionSymbolSemantics, toggleFunctionSymbol } from "../../compile/functionSymbols";

function expr(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

function evaluateLatex(latex: string): string | null {
  const evaluated = evaluateAlgebrite(expr(latex));
  return evaluated ? exprToLatex(evaluated, false) : null;
}

describe("evaluateAlgebrite", () => {
  test.for([
    [String.raw`x_0+2 \mu_s`, String.raw`x_0 + 2 \mu_s`],
    [String.raw`\frac{d}{dx} x^2`, "2 x"],
    [String.raw`\frac{d}{dx} \tan x`, String.raw`\frac{1}{\cos^{2}\left(x\right)}`],
    [String.raw`\frac{d}{dx} \left(\frac{1}{x}\right)`, String.raw`-\frac{1}{x^{2}}`],
    [String.raw`\frac{d}{dx} (2 x + 1)`, "2"],
    [String.raw`\frac{d}{dx} (2 x + 1 + e^x)`, String.raw`2 + e^{x}`],
    [String.raw`\int x\,\mathrm{d}{x}`, String.raw`\frac{1}{2} x^{2}`],
    [String.raw`\int x^2 \, \mathrm{d}{x}`, String.raw`\frac{1}{3} x^{3}`],
    [String.raw`\int_0^\pi \sin x\,\mathrm{d}{x}`, "2"],
    [String.raw`\int_a^b \frac{1}{x} \,\mathrm{d}{x}`, String.raw`-\ln\left(a\right) + \ln\left(b\right)`],
    [String.raw`\frac{\partial}{\partial \mathscr{H}} \mathscr{H}`, "1"],
    [String.raw`\int_{0}^{1} \sin x  \,\mathrm{d}{x}`, String.raw`1 - \cos\left(1\right)`],
  ])("evaluates %s", ([input, expected]) => {
    expect(evaluateLatex(input)).toBe(expected);
  });

  it("returns null for unsupported expressions", () => {
    expect(evaluateAlgebrite(expr(String.raw`\vec{v}`))).toBeNull();
  });

  it("checks translatability without evaluating", () => {
    expect(canEvaluateAlgebrite(expr(String.raw`\int_{0}^{1} \sin x\,\mathrm{d}{x}`))).toBe(true);
    expect(canEvaluateAlgebrite(expr(String.raw`\vec{v}`))).toBe(false);
  });

  it("evaluates expressions containing tagged user functions as opaque symbols", () => {
    const parsedDocument = compileMathDocument(String.raw`\left(f\left(x\right)+x\right)^{2}`);
    const functionSymbols = toggleFunctionSymbol(
      parsedDocument,
      [],
      Object.entries(parsedDocument.index.nodeById).find(([, node]) => node.kind === "symbol" && node.name === "f")![0],
    );
    const document = compileMathDocumentFromExpr(
      parsedDocument.sourceLatex,
      applyFunctionSymbolSemantics(parsedDocument, functionSymbols),
    );

    expect(canEvaluateAlgebrite(document.expr)).toBe(true);
    expect(exprToLatex(evaluateAlgebrite(document.expr)!, false)).toBe(
      String.raw`2 f\left(x\right) x + f\left(x\right)^{2} + x^{2}`,
    );
  });
});
