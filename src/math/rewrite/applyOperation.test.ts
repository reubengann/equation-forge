import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../adapters/latex";
import { compileMathDocumentFromExpr } from "../compile/compileMathDocument";
import {
  applyOperationToFraction,
  applyOperationToRelation,
  canApplyOperationToFraction,
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

  it("applies a differential with the side as its argument", () => {
    const template = expr(String.raw`\mathrm{d}(\eqn)`);

    expect(validateOperationTemplate(template)).toBeNull();
    const next = applyOperationToRelation(expr("a=b"), template);

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\mathrm{d}{\left(a\right)} = \mathrm{d}{\left(b\right)}`);
  });

  it("applies a MathLive-rendered differential with the side as its argument", () => {
    const template = expr(String.raw`\mathrm{d}\left(\eqn\right)`);

    expect(validateOperationTemplate(template)).toBeNull();
    const next = applyOperationToRelation(
      expr(String.raw`v = v_0 \left[1 + \beta \left(T - T_0\right) - \kappa \left(P - P_0\right)\right]`),
      template,
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\mathrm{d}{\left(v\right)} = \mathrm{d}{\left(v_0 \left[1 + \beta \left(T - T_0\right) - \kappa \left(P - P_0\right)\right]\right)}`,
    );
  });

  it("wraps inserted sides when the placeholder is a product factor", () => {
    const next = applyOperationToRelation(expr("a+1=2"), expr(String.raw`2\eqn`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`2 \left(a + 1\right) = 2 \left(2\right)`);
  });

  it("wraps compound sides inserted as partial derivative operands", () => {
    const next = applyOperationToRelation(
      expr(String.raw`v = v_0 \left[1 + \beta \left(T - T_0\right) - \kappa \left(P - P_0\right)\right]`),
      expr(String.raw`\frac{\partial}{\partial T}\eqn`),
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{\partial}{\partial{T}} v = \frac{\partial}{\partial{T}} \left(v_0 \left[1 + \beta \left(T - T_0\right) - \kappa \left(P - P_0\right)\right]\right)`,
    );
  });

  it("applies operation to inequalities", () => {
    const next = applyOperationToRelation(expr("a<b"), expr(String.raw`\sqrt{\eqn}`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\sqrt{a} < \sqrt{b}`);
  });

  it("can switch inequality direction while applying an operation", () => {
    const next = applyOperationToRelation(expr("a<b"), expr(String.raw`-\eqn`), {
      switchInequality: true,
    });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-a > -b`);
  });

  it("ignores inequality switching for equations", () => {
    const next = applyOperationToRelation(expr("a=b"), expr(String.raw`-\eqn`), {
      switchInequality: true,
    });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-a = -b`);
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

describe("applyOperationToFraction", () => {
  it("applies operation to numerator and denominator of a selected fraction", () => {
    const fractionExpr = expr(String.raw`\frac{a}{b}`);
    const document = compileMathDocumentFromExpr(String.raw`\frac{a}{b}`, fractionExpr);
    const next = applyOperationToFraction(document, { kind: "single", nodeId: "n1" }, expr(String.raw`\sqrt{\part}`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{\sqrt{a}}{\sqrt{b}}`);
  });

  it("wraps inserted parts when the placeholder is a product factor", () => {
    const fractionExpr = expr(String.raw`\frac{a+1}{2}`);
    const document = compileMathDocumentFromExpr(String.raw`\frac{a+1}{2}`, fractionExpr);
    const next = applyOperationToFraction(document, { kind: "single", nodeId: "n1" }, expr(String.raw`2\part`));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{2 \left(a + 1\right)}{2 \left(2\right)}`);
  });

  it("only enables fraction operations for selected fractions", () => {
    const fractionDocument = compileMathDocumentFromExpr(String.raw`\frac{a}{b}`, expr(String.raw`\frac{a}{b}`));
    const sumDocument = compileMathDocumentFromExpr("a+b", expr("a+b"));

    expect(canApplyOperationToFraction(fractionDocument, { kind: "single", nodeId: "n1" })).toBe(true);
    expect(canApplyOperationToFraction(fractionDocument, null)).toBe(false);
    expect(canApplyOperationToFraction(sumDocument, { kind: "single", nodeId: "n2" })).toBe(false);
  });

  it("validates the part placeholder separately", () => {
    expect(validateOperationTemplate(expr("x+1"), "part")).toBe(String.raw`Include \part where the current part should go.`);
    expect(validateOperationTemplate(expr(String.raw`\part+\part`), "part")).toBe(
      String.raw`Use exactly one \part placeholder.`,
    );
  });
});
