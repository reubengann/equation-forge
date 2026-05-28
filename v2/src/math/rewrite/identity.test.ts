import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
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

describe("identity rewrites", () => {
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

  it("expands a natural log product", () => {
    expect(rewriteLatex(String.raw`\ln(a b)`, "expand-natural-log-product")).toBe(String.raw`\ln a  + \ln b `);
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
  it("replaces a selected single node", () => {
    const document = buildDocument(String.raw`x=\ln a+\ln b`);
    const next = applyIdentityRewriteToSelection(document, { kind: "single", nodeId: "n3" }, "combine-natural-logs");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x = \ln \left(a b\right) `);
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
});
