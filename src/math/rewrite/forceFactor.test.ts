import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import type { Expr } from "../ast";
import {
  canForceFactorSelection,
  forceFactorSelection,
  validateForceFactorExpr,
} from "./forceFactor";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

function parseExpr(latex: string): Expr {
  return parseLatexToExpr(latex, { onError: "throw" });
}

function findNodeId(document: CompiledMathDocument, predicate: (expr: Expr, nodeId: string) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([nodeId, expr]) => predicate(expr, nodeId));
  expect(entry).toBeDefined();
  return entry![0];
}

describe("forceFactorSelection", () => {
  it("pulls out a requested fractional factor from every term", () => {
    const document = buildDocument(String.raw`-v v_0+\frac{1}{2}v^2+\frac{1}{2}v_0^2`);
    const next = forceFactorSelection(document, { kind: "single", nodeId: "n1" }, parseExpr(String.raw`\frac{1}{2}`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{1}{2} \left(-2 v v_0 + v^{2} + v_0^{2}\right)`,
    );
  });

  it("pulls out a symbolic factor even when it is not visible in every term", () => {
    const document = buildDocument(String.raw`a b+c`);
    const next = forceFactorSelection(document, { kind: "single", nodeId: "n1" }, parseExpr("a"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a \left(b + \frac{c}{a}\right)`);
  });

  it("force-factors selected terms inside a larger sum", () => {
    const document = buildDocument(String.raw`x+\frac{1}{2}a+\frac{1}{2}b+y`);
    const selectedTermIds = Object.entries(document.index.nodeById)
      .filter(([, expr]) => (
        expr.kind === "multiply" &&
        expr.factors.some((factor) => factor.kind === "divide") &&
        expr.factors.some((factor) => factor.kind === "symbol")
      ))
      .map(([nodeId]) => nodeId);
    const selection = { kind: "multi" as const, containerNodeId: "n1", nodeIds: selectedTermIds };
    const next = forceFactorSelection(document, selection, parseExpr(String.raw`\frac{1}{2}`));

    expect(selectedTermIds).toHaveLength(2);
    expect(canForceFactorSelection(document, selection)).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x + \frac{1}{2} \left(a + b\right) + y`);
  });

  it("preserves the requested negative factor", () => {
    const document = buildDocument(String.raw`-a-b`);
    const next = forceFactorSelection(document, { kind: "single", nodeId: "n1" }, parseExpr("-1"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-\left(a + b\right)`);
  });

  it("allows powers with numeric exponents in the requested factor", () => {
    const document = buildDocument(String.raw`a^2 b+c`);
    const next = forceFactorSelection(document, { kind: "single", nodeId: "n1" }, parseExpr("a^2"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a^{2} \left(b + \frac{c}{a^{2}}\right)`);
  });

  it("only enables force factoring on selected sums", () => {
    const document = buildDocument(String.raw`a b`);

    expect(canForceFactorSelection(document, { kind: "single", nodeId: "n1" })).toBe(false);
    expect(forceFactorSelection(document, { kind: "single", nodeId: "n1" }, parseExpr("a"))).toBeNull();
  });

  it("rejects relation and operator-like factors", () => {
    expect(validateForceFactorExpr(parseExpr("a=b"))).not.toBeNull();
    expect(validateForceFactorExpr(parseExpr(String.raw`\sin x`))).not.toBeNull();
    expect(validateForceFactorExpr(parseExpr(String.raw`\sqrt{x}`))).not.toBeNull();
  });

  it("rejects zero as a factor", () => {
    expect(validateForceFactorExpr(parseExpr("0"))).toBe("Enter a nonzero factor.");
  });

  it("can force-factor a displayed sum", () => {
    const document = buildDocument(String.raw`x\left(a+b\right)`);
    const selectedSumId = findNodeId(
      document,
      (expr) => expr.kind === "display_group" && expr.expression.kind === "add",
    );
    const next = forceFactorSelection(document, { kind: "single", nodeId: selectedSumId }, parseExpr("a"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x a \left(1 + \frac{b}{a}\right)`);
  });
});
