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
      String.raw`\exp a + b `,
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
      String.raw`\sin \frac{\pi}{2} - \theta `,
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
});
