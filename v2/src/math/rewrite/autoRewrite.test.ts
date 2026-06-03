import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { displayGroup, num, type Expr } from "../ast";
import { autoRewriteSelection, canAutoRewrite } from "./autoRewrite";
import { CleanupRecursionError, canCleanupExpr } from "./cleanup";

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

  it("factors selected sum terms when one selection is inside a negated term", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\ln\left(\frac{T}{T_0}\right)+R\ln v_0-R\ln v+s_0`,
    );
    const selection = { kind: "multi" as const, nodeIds: ["n4", "n12"], containerNodeId: "n3" };

    expect(canAutoRewrite(document, selection, "factor")).toBe(true);
    const next = autoRewriteSelection(document, selection, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = \ln\left(\frac{T}{T_0}\right) \left(c_P - R\right) + R \ln v_0  - R \ln v  + s_0`,
    );
  });

  it("factors a common denominator from a selected delimited sum", () => {
    const document = buildDocument(String.raw`h=c_P\left(\frac{P v}{R}-\frac{P_0 v_0}{R}\right)+h_0`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n6" }, "factor")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n6" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`h = \frac{c_P}{R} \left(P v - P_0 v_0\right) + h_0`,
    );
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

  it("distributes a factor across negative add terms", () => {
    const document = buildDocument(String.raw`b\left(a-c\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b a - b c`);
  });

  it("removes multiplicative identity terms created by distribution", () => {
    const document = buildDocument(String.raw`v_0 \left[1 - \kappa \left(P - P_0\right)\right]`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`v_0 - v_0 \kappa \left(P - P_0\right)`);
  });

  it("distributes a selected subtraction term across an additive group", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\left(\ln\left(\frac{T}{T_0}\right)+\ln v_0-\ln v\right)+s_0`,
    );
    const selectedNodeId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.kind === "negate" && expr.value.kind === "multiply",
    )?.[0];

    expect(selectedNodeId).toBeDefined();
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId! }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = c_P \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{T}{T_0}\right) - R \ln v_0  + R \ln v  + s_0`,
    );
  });

  it("distributes a selected product inside a subtraction term", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\left(\ln\left(\frac{T}{T_0}\right)+\ln\left(\frac{v_0}{v}\right)\right)+s_0`,
    );
    const selectedNodeId = Object.entries(document.index.nodeById).find(
      ([nodeId, expr]) => expr.kind === "multiply" && document.index.nodeById[document.index.parentById[nodeId] ?? ""]?.kind === "negate",
    )?.[0];

    expect(selectedNodeId).toBeDefined();
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId! }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = c_P \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{v_0}{v}\right) + s_0`,
    );
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

  it("folds numeric sums", () => {
    const document = buildDocument(String.raw`5+1`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("6");
  });

  it("folds numeric terms inside mixed sums", () => {
    const document = buildDocument(String.raw`5+1+a`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("6 + a");
  });

  it("collects a symbol with a numeric multiple", () => {
    const document = buildDocument(String.raw`x+2 x`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("3 x");
  });

  it("collects exact product like terms without reordering factors", () => {
    const document = buildDocument(String.raw`a b+2 a b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("3 a b");
  });

  it("collects negative like-term coefficients", () => {
    const document = buildDocument(String.raw`2 x-x`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("x");
  });

  it("collects like terms to zero", () => {
    const document = buildDocument(String.raw`2 x-2 x`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("0");
  });

  it("does not collect products with different factor order", () => {
    const document = buildDocument(String.raw`a b+2 b a`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(false);
    expect(autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBeNull();
  });

  it("does not repeatedly rebuild unrelated coefficient terms", () => {
    const document = buildDocument(String.raw`x+a+2 x`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("3 x + a");
  });

  it("throws if cleanup recursion exceeds its guard", () => {
    let expr: Expr = num(1);
    for (let index = 0; index < 105; index += 1) {
      expr = displayGroup("paren", expr);
    }

    expect(() => canCleanupExpr(expr)).toThrow(CleanupRecursionError);
  });

  it("folds numeric subtraction", () => {
    const document = buildDocument(String.raw`5-1`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("4");
  });

  it("enables cleanup for selected numeric subtraction on equation side", () => {
    const document = buildDocument(String.raw`a+b=5-1`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n5" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n5" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b = 4");
  });

  it("cleans nested numeric multiplication before folding selected subtraction", () => {
    const document = buildDocument(String.raw`a+b=5-1\left(5\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n5" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n5" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b = 0");
  });

  it("folds numeric products", () => {
    const document = buildDocument(String.raw`2 3 a`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("6 a");
  });

  it("folds numeric quotients", () => {
    const document = buildDocument(String.raw`\frac{6}{3}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("2");
  });

  it("folds numeric powers", () => {
    const document = buildDocument(String.raw`a+b=5^3`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n5" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n5" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b = 125");
  });

  it("folds numeric negation", () => {
    const document = buildDocument(String.raw`-5`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("-5");
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

  it("unnests a fraction in the denominator", () => {
    const document = buildDocument(String.raw`\frac{1}{\frac{2}{a+1}}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{a + 1}{2}`);
  });

  it("unnests a fraction in the numerator", () => {
    const document = buildDocument(String.raw`\frac{\frac{a}{b}}{c}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{a}{b c}`);
  });

  it("unnests fractions in both numerator and denominator", () => {
    const document = buildDocument(String.raw`\frac{\frac{a}{b}}{\frac{c}{d}}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{a d}{b c}`);
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
