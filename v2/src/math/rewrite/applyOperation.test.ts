import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../adapters/latex";
import {
  applyOperationToRelation,
  canApplyOperationToRelation,
  validateOperationTemplate,
} from "./applyOperation";

function expr(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

describe("applyOperationToRelation", () => {
  it("applies reciprocal to every equality side", () => {
    const next = applyOperationToRelation(expr("a=b=c"), expr(String.raw`1/\eqn`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{1}{a} = \frac{1}{b} = \frac{1}{c}`);
  });

  it("applies square root to both sides", () => {
    const next = applyOperationToRelation(expr("a^2=2"), expr(String.raw`\sqrt{\eqn}`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\sqrt{a^{2}} = \sqrt{2}`);
  });

  it("applies operation to inequalities", () => {
    const next = applyOperationToRelation(expr("a<b"), expr(String.raw`\sqrt{\eqn}`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\sqrt{a} < \sqrt{b}`);
  });

  it("rejects non-relation current expressions", () => {
    expect(canApplyOperationToRelation(expr("a+b"))).toBe(false);
    expect(applyOperationToRelation(expr("a+b"), expr(String.raw`1/\eqn`))).toBeNull();
  });

  it("rejects templates without exactly one placeholder", () => {
    expect(validateOperationTemplate(expr("x+1"))).toBe(String.raw`Include \eqn where the current side should go.`);
    expect(validateOperationTemplate(expr(String.raw`\eqn+\eqn`))).toBe(String.raw`Use exactly one \eqn placeholder.`);
  });

  it("rejects relation templates", () => {
    expect(validateOperationTemplate(expr(String.raw`\eqn=x`))).toBe(
      "Enter an operation expression, not an equation or inequality.",
    );
  });
});
