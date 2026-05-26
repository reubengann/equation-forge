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

describe("autoRewriteSelection distribute", () => {
  it("distributes a factor into a selected additive group", () => {
    const document = buildDocument(String.raw`b\left(a+c\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b a + b c`);
  });

  it("distributes a selected product slice inside a larger product", () => {
    const document = buildDocument(String.raw`x b\left(a+c\right)`);
    const next = autoRewriteSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n3", "n4"] },
      "distribute",
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`x \left(b a + b c\right)`);
  });

  it("uses the final additive group as the distribution target", () => {
    const document = buildDocument(String.raw`\left(a+b\right)\left(c+e\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\left(a + b\right) c + \left(a + b\right) e`,
    );
  });

  it("does not distribute a selected additive group without another factor", () => {
    const document = buildDocument(String.raw`\left(a+b\right)`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "distribute")).toBe(false);
    expect(autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute")).toBeNull();
  });
});

describe("autoRewriteSelection cleanup", () => {
  it("removes additive identities", () => {
    const document = buildDocument(String.raw`0+a`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a");
  });

  it("cancels exact additive inverses", () => {
    const document = buildDocument(String.raw`a-a+b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });

  it("removes multiplicative identities", () => {
    const document = buildDocument(String.raw`1 a b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a b");
  });

  it("cancels exact fraction factors", () => {
    const document = buildDocument(String.raw`\frac{b a}{a}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });

  it("cancels exact fraction factors through harmless display grouping", () => {
    const document = buildDocument(String.raw`\frac{\left(a+1\right)b}{a+1}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });

  it("does not reorder additive terms to cancel fractions", () => {
    const document = buildDocument(String.raw`\frac{b+a}{a+b}`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(false);
    expect(autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBeNull();
  });

  it("cancels selected multiplicative reciprocals", () => {
    const document = buildDocument(String.raw`b a \frac{1}{a}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });
});
