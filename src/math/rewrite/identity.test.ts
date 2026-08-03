import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../adapters/latex";
import { displayGroup, divide, multiply, sym } from "../ast";
import type { Expr } from "../ast";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { replaceSelectionWithExpr } from "./selectionRewrite";
import {
  applyDefaultIdentityRewrite,
  applyDefaultIdentityRewriteToSelection,
  applyIdentityRewrite,
  applyIdentityRewriteToSelection,
  getApplicableIdentityRewrites,
  getApplicableIdentityRewritesForSelection,
} from "./identity";

function parse(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

function rewriteLatex(latex: string, id: string): string | null {
  const rewritten = applyIdentityRewrite(parse(latex), id);
  return rewritten ? exprToLatex(rewritten, false) : null;
}

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parse(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

function firstNodeIdMatching(document: CompiledMathDocument, predicate: (expr: Expr) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  expect(entry).toBeDefined();
  return entry![0];
}

function roundTripLatex(latex: string): string {
  return exprToLatex(parse(latex), false);
}

function naturalLogName(expr: Expr): boolean {
  return expr.kind === "call" && expr.callee.kind === "symbol" && expr.callee.name === "ln";
}

function unsigned(expr: Expr): Expr {
  const next = { ...expr };
  delete next.sign;
  return next;
}

describe("identity rewrites", () => {
  it("applies the Pythagorean trig identity", () => {
    const input = String.raw`\sin^{2}\left(x+y\right)+\cos^{2}\left(x+y\right)`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options[0]).toMatchObject({
      id: "pythagorean-trig-identity",
      label: "sin^2(theta) + cos^2(theta) -> 1",
    });
    expect(rewriteLatex(input, "pythagorean-trig-identity")).toBe("1");
  });

  it("does not apply the Pythagorean trig identity to different arguments", () => {
    const input = String.raw`\sin^{2}\left(x+y\right)+\cos^{2}\left(x-y\right)`;

    expect(applyIdentityRewrite(parse(input), "pythagorean-trig-identity")).toBeNull();
  });

  it("applies trig square power-reduction identities", () => {
    expect(rewriteLatex(String.raw`\sin^{2}x`, "sin-square-power-reduction")).toBe(
      String.raw`\frac{\left(1 - \cos\left(2 x\right)\right)}{2}`,
    );
    expect(rewriteLatex(String.raw`\cos^{2}x`, "cos-square-power-reduction")).toBe(
      String.raw`\frac{\left(1 + \cos\left(2 x\right)\right)}{2}`,
    );
  });

  it("combines natural logs with caveat metadata", () => {
    const expr = parse(String.raw`\ln a+\ln b`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options[0]).toMatchObject({
      id: "combine-natural-logs",
      caveat: "Assumes the log arguments are positive.",
    });
    expect(rewriteLatex(String.raw`\ln a+\ln b`, "combine-natural-logs")).toBe(
      String.raw`\ln \left(a b\right) `,
    );
  });

  it("applies the exponential natural-log inverse identity", () => {
    const expr = parse(String.raw`e^{\ln P}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options[0]).toMatchObject({
      id: "exponential-natural-log-inverse",
      caveat: "Assumes the log arguments are positive.",
    });
    expect(rewriteLatex(String.raw`e^{\ln P}`, "exponential-natural-log-inverse")).toBe("P");
    expect(rewriteLatex(String.raw`\exp\left(\ln P\right)`, "exponential-natural-log-inverse")).toBe("P");
  });

  it("applies the differential sum rule", () => {
    const expr = parse(String.raw`\mathrm{d}\left(f+g\right)`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("differential-sum-rule");
    expect(rewriteLatex(String.raw`\mathrm{d}\left(f+g\right)`, "differential-sum-rule")).toBe(
      String.raw`\mathrm{d}{f} + \mathrm{d}{g}`,
    );
  });

  it("preserves subtraction signs when applying the differential sum rule", () => {
    expect(rewriteLatex(String.raw`\mathrm{d}\left(f-g\right)`, "differential-sum-rule")).toBe(
      String.raw`\mathrm{d}{f} - \mathrm{d}{g}`,
    );
  });

  it("moves embedded product signs outside differentials when applying the differential sum rule", () => {
    expect(
      rewriteLatex(
        String.raw`\mathrm{d}{\left(-R T \ln \frac{v}{v_0}  + B v\right)}`,
        "differential-sum-rule",
      ),
    ).toBe(String.raw`-\mathrm{d}\left(R T \ln \frac{v}{v_0} \right) + \mathrm{d}\left(B v\right)`);
  });

  it("groups product operands when applying the differential sum rule", () => {
    expect(rewriteLatex(String.raw`\mathrm{d}{\left(U + P V\right)}`, "differential-sum-rule")).toBe(
      String.raw`\mathrm{d}{U} + \mathrm{d}\left(P V\right)`,
    );
  });

  it("applies the differential sum rule to bounded summations", () => {
    expect(
      rewriteLatex(
        String.raw`\mathrm{d}\left(\sum_{i=1}^{k} f_i g_i\right)`,
        "differential-sum-rule",
      ),
    ).toBe(String.raw`\sum_{i = 1}^{k} \mathrm{d}\left(f_i g_i\right)`);
  });

  it("groups nested summation summands when applying the differential sum rule", () => {
    expect(
      rewriteLatex(
        String.raw`\mathrm{d}\left(\sum_{j = 1}^{\pi} \sum_{i = 1}^{k} \mu_i^{\left(j\right)} n_i^{\left(j\right)}\right)`,
        "differential-sum-rule",
      ),
    ).toBe(
      String.raw`\sum_{j = 1}^{\pi} \mathrm{d}\left(\sum_{i = 1}^{k} \mu_i^{\left(j\right)} n_i^{\left(j\right)}\right)`,
    );
  });

  it("preserves inexact notation when applying the differential sum rule", () => {
    expect(rewriteLatex(String.raw`\mathrm{d}^{\prime}\left(f+g\right)`, "differential-sum-rule")).toBe(
      String.raw`\mathrm{d'}{f} + \mathrm{d'}{g}`,
    );
  });

  it("preserves inexact notation when applying the differential sum rule to summations", () => {
    expect(
      rewriteLatex(
        String.raw`\mathrm{d'}\left(\sum_{i=1}^{k} f_i g_i\right)`,
        "differential-sum-rule",
      ),
    ).toBe(String.raw`\sum_{i = 1}^{k} \mathrm{d'}\left(f_i g_i\right)`);
  });

  it("simplifies grouped symbol differential operands", () => {
    const expr = parse(String.raw`\mathrm{d}{\left(x\right)}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("simplify-grouped-differential-operand");
    expect(rewriteLatex(String.raw`\mathrm{d}{\left(x\right)}`, "simplify-grouped-differential-operand")).toBe(
      String.raw`\mathrm{d}{x}`,
    );
    expect(
      rewriteLatex(String.raw`\mathrm{d'}{\left(x\right)}`, "simplify-grouped-differential-operand"),
    ).toBe(String.raw`\mathrm{d'}{x}`);
  });

  it("applies the differential natural-log rule", () => {
    const expr = parse(String.raw`\mathrm{d}{\ln p}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options[0]).toMatchObject({
      id: "differential-natural-log-rule",
      caveat: "Assumes the log arguments are positive.",
    });
    expect(rewriteLatex(String.raw`\mathrm{d}{\ln p}`, "differential-natural-log-rule")).toBe(
      String.raw`\frac{1}{p} \,\mathrm{d}{p}`,
    );
    expect(rewriteLatex(String.raw`\mathrm{d}\left(\ln p\right)`, "differential-natural-log-rule")).toBe(
      String.raw`\frac{1}{p} \,\mathrm{d}{p}`,
    );
  });

  it("applies the differential natural-log rule to selected log operands", () => {
    const document = buildDocument(String.raw`0 = \mathrm{d}\left(\ln p\right)`);
    const logId = firstNodeIdMatching(document, naturalLogName);
    const rewritten = applyIdentityRewriteToSelection(
      document,
      { kind: "single", nodeId: logId },
      "differential-natural-log-rule",
    );

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(String.raw`0 = \frac{1}{p} \,\mathrm{d}{p}`);
  });

  it("does not apply the differential natural-log rule to inexact or compound operands", () => {
    expect(rewriteLatex(String.raw`\mathrm{d'}{\ln p}`, "differential-natural-log-rule")).toBeNull();
    expect(rewriteLatex(String.raw`\mathrm{d}\left(\ln\left(p q\right)\right)`, "differential-natural-log-rule")).toBeNull();
  });

  it("does not simplify grouped compound differential operands", () => {
    expect(
      rewriteLatex(String.raw`\mathrm{d}{\left(y+z\right)}`, "simplify-grouped-differential-operand"),
    ).toBeNull();
  });

  it("applies the integral sum rule", () => {
    const expr = parse(String.raw`\int \left(f+g\right) \,\mathrm{d}{x}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("integral-sum-rule");
    expect(rewriteLatex(String.raw`\int \left(f+g\right) \,\mathrm{d}{x}`, "integral-sum-rule")).toBe(
      String.raw`\int f \,\mathrm{d}{x} + \int g \,\mathrm{d}{x}`,
    );
  });

  it("preserves subtraction signs when applying the integral sum rule", () => {
    expect(rewriteLatex(String.raw`\int \left(f-g\right) \,\mathrm{d}{x}`, "integral-sum-rule")).toBe(
      String.raw`\int f \,\mathrm{d}{x} - \int g \,\mathrm{d}{x}`,
    );
  });

  it("moves embedded product signs outside integrals when applying the integral sum rule", () => {
    expect(rewriteLatex(String.raw`\int \left(-a b+c\right) \,\mathrm{d}{x}`, "integral-sum-rule")).toBe(
      String.raw`-\int a b \,\mathrm{d}{x} + \int c \,\mathrm{d}{x}`,
    );
  });

  it("applies the derivative sum rule", () => {
    const expr = parse(String.raw`\frac{\partial}{\partial{x}} \left(f+g\right)`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("derivative-sum-rule");
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} \left(f+g\right)`, "derivative-sum-rule")).toBe(
      String.raw`\frac{\partial}{\partial{x}} f + \frac{\partial}{\partial{x}} g`,
    );
  });

  it("applies the derivative sum rule to direct partial derivatives", () => {
    expect(rewriteLatex(String.raw`\frac{\partial{f+g}}{\partial{x}}`, "derivative-sum-rule")).toBe(
      String.raw`\frac{\partial{f}}{\partial{x}} + \frac{\partial{g}}{\partial{x}}`,
    );
  });

  it("preserves subtraction signs when applying the derivative sum rule", () => {
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} \left(f-g\right)`, "derivative-sum-rule")).toBe(
      String.raw`\frac{\partial}{\partial{x}} f - \frac{\partial}{\partial{x}} g`,
    );
  });

  it("moves embedded product signs outside derivatives when applying the derivative sum rule", () => {
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} \left(-a b+c\right)`, "derivative-sum-rule")).toBe(
      String.raw`-\frac{\partial}{\partial{x}} \left(a b\right) + \frac{\partial}{\partial{x}} c`,
    );
  });

  it("groups product operands when applying the derivative sum rule", () => {
    expect(
      rewriteLatex(
        String.raw`\frac{\partial}{\partial{T}} \left(R T \ln \frac{v_0}{v}  + C T^{2} v\right)`,
        "derivative-sum-rule",
      ),
    ).toBe(
      String.raw`\frac{\partial}{\partial{T}} \left(R T \ln \frac{v_0}{v} \right) + \frac{\partial}{\partial{T}} \left(C T^{2} v\right)`,
    );
  });

  it("applies the derivative product rule", () => {
    const expr = parse(String.raw`\frac{\partial}{\partial{x}} f g`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("derivative-product-rule");
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} f g`, "derivative-product-rule")).toBe(
      String.raw`g \frac{\partial}{\partial{x}} f + f \frac{\partial}{\partial{x}} g`,
    );
  });

  it("applies the derivative product rule to direct partial derivatives", () => {
    expect(rewriteLatex(String.raw`\frac{\partial{f g}}{\partial{x}}`, "derivative-product-rule")).toBe(
      String.raw`g \frac{\partial{f}}{\partial{x}} + f \frac{\partial{g}}{\partial{x}}`,
    );
  });

  it("applies the derivative product rule to products with more than two factors", () => {
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} a b c`, "derivative-product-rule")).toBe(
      String.raw`b c \frac{\partial}{\partial{x}} a + a c \frac{\partial}{\partial{x}} b + a b \frac{\partial}{\partial{x}} c`,
    );
  });

  it("applies the derivative product rule when selecting a grouped derivative operand", () => {
    const document = buildDocument(String.raw`\frac{\partial}{\partial{T}} \left(T \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}\right)`);
    const productId = firstNodeIdMatching(
      document,
      (expr) =>
        expr.kind === "multiply" &&
        expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "T") &&
        expr.factors.some((factor) => factor.kind === "divide"),
    );
    const options = getApplicableIdentityRewritesForSelection(document, { kind: "single", nodeId: productId });

    expect(options.map((option) => option.id)).toContain("derivative-product-rule");

    const rewritten = applyIdentityRewriteToSelection(
      document,
      { kind: "single", nodeId: productId },
      "derivative-product-rule",
    );

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(
      String.raw`\frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}} \frac{\partial}{\partial{T}} T + T \frac{\partial}{\partial{T}} \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}`,
    );
  });

  it("applies the derivative product rule to a selected negated derivative term", () => {
    const document = buildDocument(
      String.raw`\frac{\partial}{\partial{T}} U = A \left(\frac{\partial}{\partial{T}} \sigma - \frac{\partial}{\partial{T}} \left(T \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}\right)\right)`,
    );
    const derivativeId = firstNodeIdMatching(
      document,
      (expr) =>
        expr.kind === "partial_derivative_operator" &&
        expr.sign === -1 &&
        expr.operand.kind === "display_group" &&
        expr.operand.expression.kind === "multiply",
    );
    const options = getApplicableIdentityRewritesForSelection(document, { kind: "single", nodeId: derivativeId });

    expect(options.map((option) => option.id)).toContain("derivative-product-rule");

    const rewritten = applyIdentityRewriteToSelection(
      document,
      { kind: "single", nodeId: derivativeId },
      "derivative-product-rule",
    );

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(
      String.raw`\frac{\partial}{\partial{T}} U = A \left(\frac{\partial}{\partial{T}} \sigma - \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}} \frac{\partial}{\partial{T}} T - T \frac{\partial}{\partial{T}} \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}\right)`,
    );
  });

  it("applies the differential product rule", () => {
    const expr = parse(String.raw`\mathrm{d}{\left(P V\right)}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("differential-product-rule");
    expect(rewriteLatex(String.raw`\mathrm{d}{\left(P V\right)}`, "differential-product-rule")).toBe(
      String.raw`V \,\mathrm{d}{P} + P \,\mathrm{d}{V}`,
    );
  });

  it("applies the differential product rule to negative differentials", () => {
    expect(rewriteLatex(String.raw`-\mathrm{d}{\left(P V\right)}`, "differential-product-rule")).toBe(
      String.raw`-V \,\mathrm{d}{P} - P \,\mathrm{d}{V}`,
    );
  });

  it("applies the derivative quotient identity", () => {
    const expr = parse(String.raw`\frac{\partial}{\partial{x}} \frac{f}{g}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("derivative-quotient-as-product-rule");
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} \frac{f}{g}`, "derivative-quotient-as-product-rule")).toBe(
      String.raw`\frac{1}{g} \frac{\partial}{\partial{x}} f + f \frac{\partial}{\partial{x}} \frac{1}{g}`,
    );
  });

  it("applies the derivative quotient identity to direct partial derivatives", () => {
    expect(rewriteLatex(String.raw`\frac{\partial{\frac{f}{g}}}{\partial{x}}`, "derivative-quotient-as-product-rule")).toBe(
      String.raw`\frac{1}{g} \frac{\partial{f}}{\partial{x}} + f \frac{\partial{\frac{1}{g}}}{\partial{x}}`,
    );
  });

  it("applies the differential quotient identity", () => {
    const expr = parse(String.raw`\mathrm{d}{\frac{f}{g}}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("differential-quotient-rule");
    expect(rewriteLatex(String.raw`\mathrm{d}{\frac{f}{g}}`, "differential-quotient-rule")).toBe(
      String.raw`\frac{1}{g} \,\mathrm{d}{f} - \frac{f}{g^{2}} \,\mathrm{d}{g}`,
    );
  });

  it("applies the differential quotient identity to negative differentials", () => {
    expect(rewriteLatex(String.raw`-\mathrm{d}{\frac{U + P V}{T}}`, "differential-quotient-rule")).toBe(
      String.raw`-\frac{1}{T} \,\mathrm{d}\left(U + P V\right) + \frac{\left(U + P V\right)}{T^{2}} \,\mathrm{d}{T}`,
    );
  });

  it("applies the derivative reciprocal identity", () => {
    const expr = parse(String.raw`\frac{\partial}{\partial{x}} \frac{1}{f}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("derivative-reciprocal-rule");
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{x}} \frac{1}{f}`, "derivative-reciprocal-rule")).toBe(
      String.raw`-\frac{1}{f^{2}} \frac{\partial}{\partial{x}} f`,
    );
  });

  it("applies the derivative reciprocal identity to direct partial derivatives", () => {
    expect(rewriteLatex(String.raw`\frac{\partial{\frac{1}{f}}}{\partial{x}}`, "derivative-reciprocal-rule")).toBe(
      String.raw`-\frac{1}{f^{2}} \frac{\partial{f}}{\partial{x}}`,
    );
  });

  it("preserves reciprocal identity signs when replacing a factor in a larger product", () => {
    const document = buildDocument(
      String.raw`R T^{2} \frac{\partial}{\partial{T}} \frac{1}{\left(v + A\right)}`,
    );
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "partial_derivative_operator");
    const next = applyIdentityRewriteToSelection(
      document,
      { kind: "single", nodeId: selectedNodeId },
      "derivative-reciprocal-rule",
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`-\frac{R T^{2}}{\left(v + A\right)^{2}} \frac{\partial}{\partial{T}} \left(v + A\right)`,
    );
  });

  it("does not apply the derivative reciprocal identity to non-reciprocal quotients", () => {
    expect(applyIdentityRewrite(
      parse(String.raw`\frac{\partial}{\partial{x}} \frac{a}{f}`),
      "derivative-reciprocal-rule",
    )).toBeNull();
  });

  it("distributes a numerator sum over a shared denominator", () => {
    const input = String.raw`\frac{a+b+c}{e}`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options.map((option) => option.id)).toContain("distribute-sum-over-denominator");
    expect(rewriteLatex(input, "distribute-sum-over-denominator")).toBe(
      String.raw`\frac{a}{e} + \frac{b}{e} + \frac{c}{e}`,
    );
  });

  it("preserves signs when distributing a numerator sum", () => {
    expect(rewriteLatex(String.raw`\frac{a-b+c}{e}`, "distribute-sum-over-denominator")).toBe(
      String.raw`\frac{a}{e} - \frac{b}{e} + \frac{c}{e}`,
    );
    expect(rewriteLatex(String.raw`-\frac{a+b}{e}`, "distribute-sum-over-denominator")).toBe(
      String.raw`-\frac{a}{e} - \frac{b}{e}`,
    );
  });

  it("does not distribute fractions without numerator sums", () => {
    expect(rewriteLatex(String.raw`\frac{a b}{e}`, "distribute-sum-over-denominator")).toBeNull();
    expect(rewriteLatex(String.raw`\frac{a}{e}`, "distribute-sum-over-denominator")).toBeNull();
  });

  it("converts nested same-variable partial derivatives to second-order partial derivatives", () => {
    const expr = parse(String.raw`\frac{\partial}{\partial{T}} \frac{\partial{A}}{\partial{T}}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("nested-partial-to-second-partial");
    expect(rewriteLatex(String.raw`\frac{\partial}{\partial{T}} \frac{\partial{A}}{\partial{T}}`, "nested-partial-to-second-partial")).toBe(
      String.raw`\frac{\partial^{2}{A}}{\partial{T}^{2}}`,
    );
  });

  it("converts direct nested partial derivatives to second-order partial derivatives", () => {
    expect(rewriteLatex(String.raw`\frac{\partial{\frac{\partial{A}}{\partial{T}}}}{\partial{T}}`, "nested-partial-to-second-partial")).toBe(
      String.raw`\frac{\partial^{2}{A}}{\partial{T}^{2}}`,
    );
  });

  it("does not convert nested partial derivatives with different variables", () => {
    expect(applyIdentityRewrite(
      parse(String.raw`\frac{\partial}{\partial{x}} \frac{\partial{A}}{\partial{T}}`),
      "nested-partial-to-second-partial",
    )).toBeNull();
  });

  it("rewrites partial-at-constant derivatives to reciprocal derivatives", () => {
    const input = String.raw`\left(\frac{\partial{S}}{\partial{U}}\right)_{L}`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options.map((option) => option.id)).toContain("partial-at-constant-reciprocal");
    expect(rewriteLatex(input, "partial-at-constant-reciprocal")).toBe(
      String.raw`\frac{1}{\left(\frac{\partial{U}}{\partial{S}}\right)_{L}}`,
    );
  });

  it("combines a natural log difference into a quotient", () => {
    const expr = parse(String.raw`\ln a-\ln b`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("combine-natural-log-quotient");
    expect(rewriteLatex(String.raw`\ln a-\ln b`, "combine-natural-log-quotient")).toBe(
      String.raw`\ln \left(\frac{a}{b}\right) `,
    );
  });

  it("expands a natural log product", () => {
    expect(rewriteLatex(String.raw`\ln(a b)`, "expand-natural-log-product")).toBe(String.raw`\ln a  + \ln b `);
  });

  it("expands a natural log quotient", () => {
    const expr = parse(String.raw`\ln\left(\frac{a}{b}\right)`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("expand-natural-log-quotient");
    expect(options.find((option) => option.id === "expand-natural-log-quotient")).toMatchObject({
      caveat: "Assumes the log arguments are positive.",
    });
    expect(rewriteLatex(String.raw`\ln\left(\frac{a}{b}\right)`, "expand-natural-log-quotient")).toBe(
      String.raw`\ln a  - \ln b `,
    );
  });

  it("expands a natural log quotient with product numerator and denominator", () => {
    expect(
      rewriteLatex(
        String.raw`\ln\left(\frac{T v_0}{T_0 v}\right)`,
        "expand-natural-log-quotient",
      ),
    ).toBe(String.raw`\ln\left(T v_0\right) - \ln\left(T_0 v\right)`);
  });

  it("combines a natural log coefficient into a power", () => {
    const expr = parse(String.raw`a\ln b`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options.map((option) => option.id)).toContain("combine-log-coefficient");
    expect(options.find((option) => option.id === "combine-log-coefficient")).toMatchObject({
      caveat: "Assumes the log arguments are positive.",
    });
    expect(rewriteLatex(String.raw`a\ln b`, "combine-log-coefficient")).toBe(String.raw`\ln\left(b^{a}\right)`);
    expect(rewriteLatex(String.raw`\ln b\,a`, "combine-log-coefficient")).toBe(
      String.raw`\ln\left(b^{a}\right)`,
    );
    expect(rewriteLatex(String.raw`-a\ln b`, "combine-log-coefficient")).toBe(
      String.raw`\ln\left(b^{-a}\right)`,
    );
  });

  it("groups a fractional log argument when combining a log coefficient", () => {
    expect(
      rewriteLatex(
        String.raw`-\frac{R}{c_v} \ln\left(\frac{v_c - b}{v_b - b}\right)`,
        "combine-log-coefficient",
      ),
    ).toBe(String.raw`\ln\left(\left(\frac{v_c - b}{v_b - b}\right)^{-\frac{R}{c_v}}\right)`);
  });

  it("does not stack groups for a combined log coefficient from compiled AST shape", () => {
    const expr = {
      kind: "multiply",
      factors: [
        {
          kind: "divide",
          numerator: {
            kind: "symbol",
            name: "R",
          },
          denominator: {
            kind: "symbol",
            name: "c_v",
          },
          sign: -1,
        },
        {
          kind: "call",
          callee: {
            kind: "symbol",
            name: "ln",
          },
          args: [
            {
              kind: "divide",
              numerator: {
                kind: "add",
                terms: [
                  {
                    kind: "symbol",
                    name: "v_c",
                  },
                  {
                    kind: "symbol",
                    name: "b",
                    sign: -1,
                  },
                ],
              },
              denominator: {
                kind: "add",
                terms: [
                  {
                    kind: "symbol",
                    name: "v_b",
                  },
                  {
                    kind: "symbol",
                    name: "b",
                    sign: -1,
                  },
                ],
              },
            },
          ],
          delimiter: "paren",
        },
      ],
    } satisfies Expr;
    const rewritten = applyIdentityRewrite(expr, "combine-log-coefficient");

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(
      String.raw`\ln\left(\left(\frac{v_c - b}{v_b - b}\right)^{-\frac{R}{c_v}}\right)`,
    );
  });

  it("does not stack groups when applying log coefficient rewrite to compiled AST selection", () => {
    const expr = {
      kind: "multiply",
      factors: [
        {
          kind: "divide",
          numerator: {
            kind: "symbol",
            name: "R",
          },
          denominator: {
            kind: "symbol",
            name: "c_v",
          },
          sign: -1,
        },
        {
          kind: "call",
          callee: {
            kind: "symbol",
            name: "ln",
          },
          args: [
            {
              kind: "divide",
              numerator: {
                kind: "add",
                terms: [
                  {
                    kind: "symbol",
                    name: "v_c",
                  },
                  {
                    kind: "symbol",
                    name: "b",
                    sign: -1,
                  },
                ],
              },
              denominator: {
                kind: "add",
                terms: [
                  {
                    kind: "symbol",
                    name: "v_b",
                  },
                  {
                    kind: "symbol",
                    name: "b",
                    sign: -1,
                  },
                ],
              },
            },
          ],
          delimiter: "paren",
        },
      ],
    } satisfies Expr;
    const document = compileMathDocumentFromExpr("", expr);
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: "n1" }, "combine-log-coefficient");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\ln\left(\left(\frac{v_c - b}{v_b - b}\right)^{-\frac{R}{c_v}}\right)`,
    );
  });

  it("does not stack groups when replacing the dumped selected equation side", () => {
    const document = buildDocument(
      String.raw`\ln\left(\frac{T_c}{T_b}\right) = -\frac{R}{c_v} \ln\left(\frac{v_c - b}{v_b - b}\right)`,
    );
    const replacement = {
      kind: "call",
      callee: {
        kind: "symbol",
        name: "ln",
      },
      args: [
        {
          kind: "power",
          base: {
            kind: "divide",
            numerator: {
              kind: "add",
              terms: [
                {
                  kind: "symbol",
                  name: "v_c",
                },
                {
                  kind: "symbol",
                  name: "b",
                  sign: -1,
                },
              ],
            },
            denominator: {
              kind: "add",
              terms: [
                {
                  kind: "symbol",
                  name: "v_b",
                },
                {
                  kind: "symbol",
                  name: "b",
                  sign: -1,
                },
              ],
            },
          },
          exponent: {
            kind: "divide",
            numerator: {
              kind: "symbol",
              name: "R",
            },
            denominator: {
              kind: "symbol",
              name: "c_v",
            },
            sign: -1,
          },
        },
      ],
      delimiter: "paren",
    } satisfies Expr;
    const next = replaceSelectionWithExpr(document, { kind: "single", nodeId: "n7" }, replacement);
    const latex = exprToLatex(next!, false);

    expect(next).not.toBeNull();
    expect(latex).toBe(
      String.raw`\ln\left(\frac{T_c}{T_b}\right) = \ln\left(\left(\frac{v_c - b}{v_b - b}\right)^{-\frac{R}{c_v}}\right)`,
    );
    expect(roundTripLatex(latex)).toBe(latex);
  });

  it("does not stack existing groups around a combined log power base", () => {
    const expr = multiply([
      divide(sym("R"), sym("c_v"), { sign: -1 }),
      {
        kind: "call",
        callee: sym("ln"),
        args: [
          displayGroup(
            "paren",
            displayGroup(
              "paren",
              divide(
                displayGroup("paren", { kind: "add", terms: [sym("v_c"), { kind: "symbol", name: "b", sign: -1 }] }),
                displayGroup("paren", { kind: "add", terms: [sym("v_b"), { kind: "symbol", name: "b", sign: -1 }] }),
              ),
            ),
          ),
        ],
        delimiter: "paren",
      },
    ]);
    const rewritten = applyIdentityRewrite(expr, "combine-log-coefficient");

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(
      String.raw`\ln\left(\left(\frac{\left(v_c - b\right)}{\left(v_b - b\right)}\right)^{-\frac{R}{c_v}}\right)`,
    );
  });

  it("expands and combines exponential sums", () => {
    expect(rewriteLatex(String.raw`\exp(a+b)`, "expand-exponential-sum")).toBe(String.raw`\exp a  \exp b `);
    expect(rewriteLatex(String.raw`\exp a \exp b`, "combine-exponential-product")).toBe(
      String.raw`\exp \left(a + b\right) `,
    );
  });

  it("supports e-power exponential notation", () => {
    expect(rewriteLatex(String.raw`e^{a+b}`, "expand-exponential-sum")).toBe(String.raw`e^{a} e^{b}`);
    expect(rewriteLatex(String.raw`e^a e^b`, "combine-exponential-product")).toBe(String.raw`e^{a + b}`);
  });

  it("flattens a power of a power with caveat metadata", () => {
    const options = getApplicableIdentityRewrites(parse(String.raw`(a^b)^c`));

    expect(options[0]).toMatchObject({
      id: "power-of-power",
      caveat: "Branch/domain-sensitive; generally safe for positive real bases.",
    });
    expect(rewriteLatex(String.raw`(a^b)^c`, "power-of-power")).toBe(String.raw`a^{b c}`);
  });

  it("expands a power of a product with caveat metadata", () => {
    const input = String.raw`\left(\frac{1}{2}\left(1+2 a\right)\right)^2`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options.map((option) => option.id)).toContain("power-of-product");
    expect(options.find((option) => option.id === "power-of-product")).toMatchObject({
      label: "(a b)^n -> a^n b^n",
      caveat: "Branch/domain-sensitive; generally safe for positive real bases.",
    });
    expect(rewriteLatex(input, "power-of-product")).toBe(
      String.raw`\left(\frac{1}{2}\right)^{2} \left(1 + 2 a\right)^{2}`,
    );
  });

  it("expands binomial squares with either sign", () => {
    const options = getApplicableIdentityRewrites(parse(String.raw`\left(a-b\right)^2`));

    expect(options.map((option) => option.id)).toContain("expand-binomial-square");
    expect(rewriteLatex(String.raw`\left(a+b\right)^2`, "expand-binomial-square")).toBe(
      String.raw`a^{2} + b^{2} + 2 a b`,
    );
    expect(rewriteLatex(String.raw`\left(a-b\right)^2`, "expand-binomial-square")).toBe(
      String.raw`a^{2} + b^{2} - 2 a b`,
    );
  });

  it("does not expand non-square or non-binomial powers as binomial squares", () => {
    expect(rewriteLatex(String.raw`\left(a+b\right)^3`, "expand-binomial-square")).toBeNull();
    expect(rewriteLatex(String.raw`\left(a+b+c\right)^2`, "expand-binomial-square")).toBeNull();
  });

  it("combines a product of matching powers with caveat metadata", () => {
    const input = String.raw`a^n b^n`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options.map((option) => option.id)).toContain("combine-product-powers");
    expect(options.find((option) => option.id === "combine-product-powers")).toMatchObject({
      label: "a^n b^n -> (a b)^n",
      caveat: "Branch/domain-sensitive; generally safe for positive real bases.",
    });
    expect(rewriteLatex(input, "combine-product-powers")).toBe(String.raw`\left(a b\right)^{n}`);
  });

  it("does not combine product powers with different exponents", () => {
    expect(rewriteLatex(String.raw`a^n b^m`, "combine-product-powers")).toBeNull();
  });

  it("combines a product of roots with matching degrees", () => {
    const input = String.raw`\sqrt{a}\sqrt{b}`;
    const options = getApplicableIdentityRewrites(parse(input));

    expect(options.map((option) => option.id)).toContain("combine-product-roots");
    expect(options.find((option) => option.id === "combine-product-roots")).toMatchObject({
      caveat: "Branch/domain-sensitive; generally safe for positive real bases.",
    });
    expect(rewriteLatex(input, "combine-product-roots")).toBe(String.raw`\sqrt{a b}`);
    expect(rewriteLatex(String.raw`\sqrt[3]{a}\sqrt[3]{b}`, "combine-product-roots")).toBe(
      String.raw`\sqrt[3]{a b}`,
    );
  });

  it("does not combine roots with different degrees", () => {
    expect(rewriteLatex(String.raw`\sqrt{a}\sqrt[3]{b}`, "combine-product-roots")).toBeNull();
  });

  it("rewrites simple reciprocals to negative powers", () => {
    const options = getApplicableIdentityRewrites(parse(String.raw`\frac{1}{x}`));

    expect(options.map((option) => option.id)).toContain("reciprocal-to-negative-power");
    expect(rewriteLatex(String.raw`\frac{1}{x}`, "reciprocal-to-negative-power")).toBe("x^{-1}");
    expect(rewriteLatex(String.raw`\frac{1}{p^2}`, "reciprocal-to-negative-power")).toBe("p^{-2}");
    expect(rewriteLatex(String.raw`\frac{1}{\mathscr{H}}`, "reciprocal-to-negative-power")).toBe(
      String.raw`\mathscr{H}^{-1}`,
    );
  });

  it("rewrites trigonometric reciprocals to negative powers", () => {
    expect(rewriteLatex(String.raw`\frac{1}{\sin x}`, "reciprocal-to-negative-power")).toBe(
      String.raw`\sin^{-1} x`,
    );
    expect(rewriteLatex(String.raw`\frac{1}{\cos^2 x}`, "reciprocal-to-negative-power")).toBe(
      String.raw`\cos^{-2} x`,
    );
  });

  it("rewrites simple negative powers to reciprocals", () => {
    const options = getApplicableIdentityRewrites(parse(String.raw`x^{-3}`));

    expect(options.map((option) => option.id)).toContain("reciprocal-to-negative-power");
    expect(rewriteLatex(String.raw`x^{-1}`, "reciprocal-to-negative-power")).toBe(String.raw`\frac{1}{x}`);
    expect(rewriteLatex(String.raw`x^{-3}`, "reciprocal-to-negative-power")).toBe(String.raw`\frac{1}{x^{3}}`);
    expect(rewriteLatex(String.raw`\mathscr{H}^{-1}`, "reciprocal-to-negative-power")).toBe(
      String.raw`\frac{1}{\mathscr{H}}`,
    );
    expect(rewriteLatex(String.raw`\sin^{-1} x`, "reciprocal-to-negative-power")).toBe(
      String.raw`\frac{1}{\sin x }`,
    );
  });

  it("rejects compound and non-trigonometric reciprocal denominators", () => {
    expect(rewriteLatex(String.raw`\frac{1}{a b}`, "reciprocal-to-negative-power")).toBeNull();
    expect(rewriteLatex(String.raw`\frac{1}{\exp x}`, "reciprocal-to-negative-power")).toBeNull();
    expect(rewriteLatex(String.raw`\frac{2}{x}`, "reciprocal-to-negative-power")).toBeNull();
    expect(rewriteLatex(String.raw`\left(a b\right)^{-1}`, "reciprocal-to-negative-power")).toBeNull();
    expect(rewriteLatex(String.raw`\exp^{-1} x`, "reciprocal-to-negative-power")).toBeNull();
    expect(rewriteLatex(String.raw`x^{3}`, "reciprocal-to-negative-power")).toBeNull();
  });

  it("rewrites square roots of squares to absolute values", () => {
    const expr = parse(String.raw`\sqrt{x^2}`);
    const options = getApplicableIdentityRewrites(expr);

    expect(options[0]).toMatchObject({
      id: "sqrt-square-to-absolute-value",
      label: "sqrt(x^2) -> |x|",
    });
    expect(rewriteLatex(String.raw`\sqrt{x^2}`, "sqrt-square-to-absolute-value")).toBe("|x|");
    expect(exprToLatex(applyDefaultIdentityRewrite(expr)!, false)).toBe("|x|");
  });

  it("rewrites square roots of squares to the base with a positivity caveat", () => {
    const options = getApplicableIdentityRewrites(parse(String.raw`\sqrt{x^2}`));

    expect(options.find((option) => option.id === "sqrt-square-to-positive-base")).toMatchObject({
      id: "sqrt-square-to-positive-base",
      caveat: "Assumes the squared expression is positive.",
    });
    expect(rewriteLatex(String.raw`\sqrt{x^2}`, "sqrt-square-to-positive-base")).toBe("x");
  });

  it("rewrites trig complements in both directions", () => {
    expect(rewriteLatex(String.raw`\sin(\frac{\pi}{2}-\theta)`, "sin-complement-to-cos")).toBe(
      String.raw`\cos \theta `,
    );
    expect(rewriteLatex(String.raw`\cos\theta`, "cos-to-sin-complement")).toBe(
      String.raw`\sin \left(\frac{\pi}{2} - \theta\right) `,
    );
  });

  it("returns no options for nonmatching expressions", () => {
    expect(getApplicableIdentityRewrites(parse(String.raw`a+b`))).toEqual([]);
    expect(applyDefaultIdentityRewrite(parse(String.raw`a+b`))).toBeNull();
  });

  it("uses priority for the default rewrite", () => {
    const rewritten = applyDefaultIdentityRewrite(parse(String.raw`\ln a+\ln b`));

    expect(rewritten).not.toBeNull();
    expect(exprToLatex(rewritten!, false)).toBe(String.raw`\ln \left(a b\right) `);
  });
});

describe("identity rewrites for selections", () => {
  it("replaces a selected Pythagorean trig sum", () => {
    const document = buildDocument(String.raw`z+\sin^{2}\left(x+y\right)+\cos^{2}\left(x+y\right)`);
    const next = applyDefaultIdentityRewriteToSelection(document, {
      kind: "multi",
      containerNodeId: "n1",
      nodeIds: ["n3", "n10"],
    });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("z + 1");
  });

  it("replaces a selected single node", () => {
    const document = buildDocument(String.raw`x=\ln a+\ln b`);
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: "n3" }, "combine-natural-logs");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x = \ln \left(a b\right) `);
  });

  it("offers the exponential natural-log inverse for a selected power", () => {
    const document = buildDocument(String.raw`y=e^{\ln P}`);
    const options = getApplicableIdentityRewritesForSelection(document, { kind: "single", nodeId: "n3" });
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: "n3" }, "exponential-natural-log-inverse");

    expect(options.map((option) => option.id)).toContain("exponential-natural-log-inverse");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("y = P");
  });

  it("offers power-of-product for a selected product power", () => {
    const document = buildDocument(String.raw`{\left(\frac{1}{2} \left(1 + 2 a\right)\right)}^{2}`);
    const options = getApplicableIdentityRewritesForSelection(document, { kind: "single", nodeId: "n1" });
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: "n1" }, "power-of-product");

    expect(options.map((option) => option.id)).toContain("power-of-product");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\left(\frac{1}{2}\right)^{2} \left(1 + 2 a\right)^{2}`,
    );
  });

  it("combines selected product powers", () => {
    const document = buildDocument(String.raw`x+a^2 b^2+y`);
    const selectedNodeId = Object.entries(document.index.nodeById).find(([, expr]) => {
      return (
        expr.kind === "multiply" &&
        expr.factors.every((factor) => factor.kind === "power")
      );
    })?.[0];

    expect(selectedNodeId).toBeDefined();
    const options = getApplicableIdentityRewritesForSelection(document, { kind: "single", nodeId: selectedNodeId! });
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: selectedNodeId! }, "combine-product-powers");

    expect(options.map((option) => option.id)).toContain("combine-product-powers");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x + \left(a b\right)^{2} + y`);
  });

  it("rewrites a selected reciprocal inside an equation", () => {
    const document = buildDocument(String.raw`y=\frac{1}{x}+z`);
    const selectedNodeId = Object.entries(document.index.nodeById).find(([, expr]) => (
      expr.kind === "divide" && expr.denominator.kind === "symbol" && expr.denominator.name === "x"
    ))?.[0];

    expect(selectedNodeId).toBeDefined();
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId!,
    });
    const next = applyIdentityRewriteToSelection(document, {
      kind: "single",
      nodeId: selectedNodeId!,
    }, "reciprocal-to-negative-power");

    expect(options.map((option) => option.id)).toContain("reciprocal-to-negative-power");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`y = x^{-1} + z`);
  });

  it("distributes a selected numerator sum fraction inside an equation", () => {
    const document = buildDocument(String.raw`y=\frac{a+b+c}{e}+z`);
    const selectedNodeId = firstNodeIdMatching(
      document,
      (expr) => expr.kind === "divide" && expr.numerator.kind === "add",
    );
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId,
    });
    const next = applyIdentityRewriteToSelection(
      document,
      {
        kind: "single",
        nodeId: selectedNodeId,
      },
      "distribute-sum-over-denominator",
    );

    expect(options.map((option) => option.id)).toContain("distribute-sum-over-denominator");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`y = \frac{a}{e} + \frac{b}{e} + \frac{c}{e} + z`,
    );
  });

  it("replaces a contiguous multi-selection", () => {
    const document = buildDocument(String.raw`x+\ln a+\ln b+y`);
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "multi",
      containerNodeId: "n1",
      nodeIds: ["n3", "n6"],
    });
    const next = applyDefaultIdentityRewriteToSelection(document, {
      kind: "multi",
      containerNodeId: "n1",
      nodeIds: ["n3", "n6"],
    });

    expect(options.map((option) => option.id)).toContain("combine-natural-logs");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x + \ln \left(a b\right)  + y`);
  });

  it("combines a selected natural log difference inside a product", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\left(\ln T-\ln T_0+\ln v_0-\ln v\right)+s_0`,
    );
    const sumEntry = Object.entries(document.index.nodeById).find(([, expr]) => {
      if (expr.kind !== "add" || expr.terms.length < 4) return false;
      const [first, second] = expr.terms;
      return Boolean(first && second?.sign === -1 && naturalLogName(first) && naturalLogName(unsigned(second)));
    });
    const [containerNodeId, sumExpr] = sumEntry ?? [];
    const termNodeIds = containerNodeId
      ? document.index.childrenById[containerNodeId]?.slice(0, 2)
      : undefined;

    expect(sumExpr).toBeDefined();
    expect(termNodeIds).toHaveLength(2);
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "multi",
      containerNodeId: containerNodeId!,
      nodeIds: termNodeIds!,
    });
    const next = applyDefaultIdentityRewriteToSelection(document, {
      kind: "multi",
      containerNodeId: containerNodeId!,
      nodeIds: termNodeIds!,
    });

    expect(options.map((option) => option.id)).toContain("combine-natural-log-quotient");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toContain(String.raw`\ln \left(\frac{T}{T_0}\right) `);
  });

  it("keeps combined log products inside the log after reparsing", () => {
    const document = buildDocument(String.raw`x+\ln x+\ln b`);
    const next = applyDefaultIdentityRewriteToSelection(document, {
      kind: "multi",
      containerNodeId: "n1",
      nodeIds: ["n3", "n6"],
    });

    expect(next).not.toBeNull();
    const latex = exprToLatex(next!, false);
    expect(latex).toBe(String.raw`x + \ln \left(x b\right) `);
    expect(roundTripLatex(latex)).toBe(String.raw`x + \ln\left(x b\right)`);
  });

  it("combines a selected log coefficient inside an equation", () => {
    const document = buildDocument(String.raw`x=a\ln b+y`);
    const selectedNodeId = Object.entries(document.index.nodeById).find(([, expr]) => {
      return expr.kind === "multiply" && expr.factors.some(naturalLogName);
    })?.[0];

    expect(selectedNodeId).toBeDefined();
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId!,
    });
    const next = applyIdentityRewriteToSelection(
      document,
      {
        kind: "single",
        nodeId: selectedNodeId!,
      },
      "combine-log-coefficient",
    );

    expect(options.map((option) => option.id)).toContain("combine-log-coefficient");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x = \ln\left(b^{a}\right) + y`);
  });

  it("expands a selected negative natural log product", () => {
    const document = buildDocument(String.raw`\ln T+\ln v_0-\ln\left(T_0 v\right)`);
    const selectedNodeId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.sign === -1 && naturalLogName(unsigned(expr)),
    )?.[0];

    expect(selectedNodeId).toBeDefined();
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId!,
    });
    const next = applyDefaultIdentityRewriteToSelection(document, {
      kind: "single",
      nodeId: selectedNodeId!,
    });

    expect(options.map((option) => option.id)).toContain("expand-natural-log-product");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\ln T  + \ln v_0  - \ln T_0  - \ln v `);
  });

  it("offers the differential sum rule when selecting the differential argument", () => {
    const document = buildDocument(String.raw`\mathrm{d}{\left(S - \frac{U + P V}{T}\right)}`);
    const selectedNodeId = firstNodeIdMatching(
      document,
      (expr) => expr.kind === "add" && expr.terms.some((term) => term.kind === "symbol" && term.name === "S"),
    );

    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId,
    });
    const next = applyIdentityRewriteToSelection(
      document,
      {
        kind: "single",
        nodeId: selectedNodeId,
      },
      "differential-sum-rule",
    );

    expect(options.map((option) => option.id)).toContain("differential-sum-rule");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\mathrm{d}{S} - \mathrm{d}{\frac{U + P V}{T}}`);
  });

  it("rewrites a selected partial-at-constant derivative inside an equation", () => {
    const document = buildDocument(String.raw`T=\left(\frac{\partial{S}}{\partial{U}}\right)_{L}`);
    const selectedNodeId = firstNodeIdMatching(
      document,
      (expr) => expr.kind === "partial_at_const_quantity",
    );
    const options = getApplicableIdentityRewritesForSelection(document, {
      kind: "single",
      nodeId: selectedNodeId,
    });
    const next = applyIdentityRewriteToSelection(
      document,
      {
        kind: "single",
        nodeId: selectedNodeId,
      },
      "partial-at-constant-reciprocal",
    );

    expect(options.map((option) => option.id)).toContain("partial-at-constant-reciprocal");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`T = \frac{1}{\left(\frac{\partial{U}}{\partial{S}}\right)_{L}}`,
    );
  });
});
