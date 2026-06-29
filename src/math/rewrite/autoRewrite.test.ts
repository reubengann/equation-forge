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

function findNodeId(document: CompiledMathDocument, predicate: (expr: Expr, nodeId: string) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([nodeId, expr]) => predicate(expr, nodeId));
  expect(entry).toBeDefined();
  return entry![0];
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
    const firstTermId = findNodeId(
      document,
      (expr) => expr.kind === "multiply" && expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "c_P"),
    );
    const secondTermId = findNodeId(
      document,
      (expr) =>
        expr.kind === "multiply" &&
        expr.sign === -1 &&
        expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "R"),
    );
    const selection = { kind: "multi" as const, nodeIds: [firstTermId, secondTermId], containerNodeId: "n3" };

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

  it("factors a common symbol from fraction numerators", () => {
    const document = buildDocument(String.raw`\frac{a b}{c}+a d`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "factor")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a \left(\frac{b}{c} + d\right)`);
  });

  it("keeps a shared fractional factor together", () => {
    const document = buildDocument(String.raw`v \frac{\beta T}{\kappa} - v_0 \frac{\beta T}{\kappa}`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "factor")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{\beta T}{\kappa} \left(v - v_0\right)`);
  });

  it("factors a common reciprocal denominator factor", () => {
    const document = buildDocument(String.raw`\frac{\beta T_0}{\kappa} - \frac{v}{2 v_0 \kappa} + \frac{1}{2 \kappa}`);

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "factor")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{1}{\kappa} \left(\beta T_0 - \frac{v}{2 v_0} + \frac{1}{2}\right)`,
    );
  });

  it("factors a shared v_0 when one term hides it in a fraction numerator", () => {
    const document = buildDocument(
      String.raw`-\frac{v_0 \beta T}{\kappa} - 3 v_0 \kappa P_0 P + \frac{3}{2} v_0 \kappa P_0^{2} + \frac{3}{2} v_0 \kappa P^{2} + 2 v_0 P_0 - v_0 P`,
    );

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "factor")).toBe(true);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`v_0 \left(-\frac{\beta T}{\kappa} - 3 \kappa P_0 P + \frac{3}{2} \kappa P_0^{2} + \frac{3}{2} \kappa P^{2} + 2 P_0 - P\right)`,
    );
  });

  it("preserves negative remainders when factoring", () => {
    const document = buildDocument(String.raw`a b-c b`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`b \left(a - c\right)`);
  });

  it("does not factor out identity numerators from reciprocal terms", () => {
    const document = buildDocument(String.raw`\Delta u = c_v T_2 - c_v T_1 + a \frac{1}{v_1} - a \frac{1}{v_2}`);
    const reciprocalTerms = Object.entries(document.index.nodeById)
      .filter(([, expr]) => (
        expr.kind === "multiply" &&
        expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "a") &&
        expr.factors.some((factor) => factor.kind === "divide")
      ))
      .map(([nodeId]) => nodeId);
    const selection = { kind: "multi" as const, containerNodeId: "n3", nodeIds: reciprocalTerms };
    const next = autoRewriteSelection(document, selection, "factor");

    expect(reciprocalTerms).toHaveLength(2);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\Delta u = c_v T_2 - c_v T_1 + a \left(\frac{1}{v_1} - \frac{1}{v_2}\right)`,
    );
  });

  it("factors a shared numeric coefficient with a symbolic factor", () => {
    const document = buildDocument(String.raw`-v 2 a b^{2} + 4 v^{2} a b - 2 v^{3} a`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`2 v a \left(-b^{2} + 2 v b - v^{2}\right)`);
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

  it("preserves a signed numeric coefficient in reordered perfect-square trinomials", () => {
    const document = buildDocument(String.raw`-2 v v_0 + v^{2} + v_0^{2}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "factor");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(v - v_0\right)^{2}`);
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
    const selectedNodeId = findNodeId(document, (expr) => expr.kind === "multiply" && expr.sign === -1);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = c_P \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{T}{T_0}\right) - R \ln v_0  + R \ln v  + s_0`,
    );
  });

  it("distributes a selected product inside a subtraction term", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\left(\ln\left(\frac{T}{T_0}\right)+\ln\left(\frac{v_0}{v}\right)\right)+s_0`,
    );
    const selectedNodeId = findNodeId(document, (expr) => expr.kind === "multiply" && expr.sign === -1);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = c_P \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{v_0}{v}\right) + s_0`,
    );
  });

  it("preserves signs when distributing an explicit negative one factor", () => {
    const document = buildDocument(
      String.raw`-1 \left(R \ln \frac{P}{P_0} - P \frac{\partial{A}}{\partial{T}}\right)`,
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`-R \ln \frac{P}{P_0}  + P \frac{\partial{A}}{\partial{T}}`,
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

  it("distributes a partial derivative operator over a selected additive operand", () => {
    const document = buildDocument(String.raw`\frac{\partial}{\partial{x}} \left(f+g\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{\partial}{\partial{x}} f + \frac{\partial}{\partial{x}} g`,
    );
  });

  it("distributes a full derivative operator across negative add terms", () => {
    const document = buildDocument(String.raw`\frac{d}{dx}\left(f-g\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{\mathrm{d}}{\mathrm{d}{x}} f - \frac{\mathrm{d}}{\mathrm{d}{x}} g`,
    );
  });

  it("pulls a leading product factor sign outside a distributed derivative", () => {
    const document = buildDocument(
      String.raw`\frac{\partial}{\partial{v}} \left(-a \left(\frac{1}{v} - \frac{1}{v_0}\right) - R T \ln\left(\frac{v - b}{v_0 - b}\right)\right)`,
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "distribute");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`-\frac{\partial}{\partial{v}} a \left(\frac{1}{v} - \frac{1}{v_0}\right) - \frac{\partial}{\partial{v}} R T \ln\left(\frac{v - b}{v_0 - b}\right)`,
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

  it("folds exact rational sums without decimal output", () => {
    const document = buildDocument(String.raw`1-\frac{1}{2}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{1}{2}`);
  });

  it("enables cleanup for selected rational terms in a larger sum", () => {
    const document = buildDocument(String.raw`1 - \frac{1}{2} - \beta T_0 + \frac{\kappa}{2} \frac{v}{v_0 \kappa}`);
    const selection = { kind: "multi" as const, containerNodeId: "n1", nodeIds: ["n2", "n3"] };
    const next = autoRewriteSelection(document, selection, "cleanup");

    expect(canAutoRewrite(document, selection, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{1}{2} - \beta T_0 + \frac{\kappa}{2} \frac{v}{v_0 \kappa}`,
    );
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

  it("combines repeated factors with positive integer powers", () => {
    const document = buildDocument(String.raw`v 2 a v^{2}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`2 v^{3} a`);
  });

  it("combines powers through a negative grouped product factor", () => {
    const document = buildDocument(String.raw`v \left(-R T b v^{2}\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-v^{3} R T b`);
  });

  it("folds numeric quotients", () => {
    const document = buildDocument(String.raw`\frac{6}{3}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("2");
  });

  it("preserves non-integer numeric quotients as fractions", () => {
    const document = buildDocument(String.raw`-\frac{\kappa}{2 \kappa} 1`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-\frac{1}{2}`);
  });

  it("folds numeric powers", () => {
    const document = buildDocument(String.raw`a+b=5^3`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n5" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n5" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b = 125");
  });

  it("collapses exp of ln to its argument", () => {
    const document = buildDocument(String.raw`\exp\left(\ln\left(a+b\right)\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b");
  });

  it("collapses exp of ln inside a selected equation side", () => {
    const document = buildDocument(String.raw`y=\exp\left(\ln x\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n3" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n3" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("y = x");
  });

  it("preserves the sign when collapsing negative exp of ln", () => {
    const document = buildDocument(String.raw`-\exp\left(\ln x\right)`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("-x");
  });

  it("folds numeric negation", () => {
    const document = buildDocument(String.raw`-5`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("-5");
  });

  it("moves explicit numerator and denominator signs to the fraction", () => {
    expect(exprToLatex(autoRewriteSelection(buildDocument(String.raw`\frac{-a}{b}`), { kind: "single", nodeId: "n1" }, "cleanup")!, false)).toBe(
      String.raw`-\frac{a}{b}`,
    );
    expect(exprToLatex(autoRewriteSelection(buildDocument(String.raw`\frac{a}{-b}`), { kind: "single", nodeId: "n1" }, "cleanup")!, false)).toBe(
      String.raw`-\frac{a}{b}`,
    );
    expect(exprToLatex(autoRewriteSelection(buildDocument(String.raw`\frac{-a}{-b}`), { kind: "single", nodeId: "n1" }, "cleanup")!, false)).toBe(
      String.raw`\frac{a}{b}`,
    );
  });

  it("moves an explicit grouped numerator sign to the fraction", () => {
    const document = buildDocument(
      String.raw`\frac{-\left(R T v^{3} b - 2 v a \left(b - v\right)^{2}\right)}{c_P \left(R T v^{3} - 2 a \left(b - v\right)^{2}\right)}`,
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`-\frac{\left(R T v^{3} b - 2 v a \left(b - v\right)^{2}\right)}{c_P \left(R T v^{3} - 2 a \left(b - v\right)^{2}\right)}`,
    );
  });

  it("cancels exact fraction factors", () => {
    const document = buildDocument(String.raw`\frac{b a}{a}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });

  it("preserves the selected fraction sign while canceling fraction factors", () => {
    const document = buildDocument(
      String.raw`\frac{\beta T_0}{\kappa} + \frac{v}{2 v_0 \kappa} - \frac{v_0}{2 v_0 \kappa} - P_0`,
    );
    const selectedFractionId = findNodeId(
      document,
      (expr) => expr.kind === "divide" && expr.sign === -1 && expr.numerator.kind === "symbol" && expr.numerator.name === "v_0",
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedFractionId }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\frac{\beta T_0}{\kappa} + \frac{v}{2 v_0 \kappa} - \frac{1}{2 \kappa} - P_0`,
    );
  });

  it("cancels exact fraction factors through harmless display grouping", () => {
    const document = buildDocument(String.raw`\frac{\left(a+1\right)b}{a+1}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("b");
  });

  it("cancels common factors across multiplied fractions", () => {
    const document = buildDocument(String.raw`\frac{\kappa}{2} \frac{v}{v_0 \kappa}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{v}{2 v_0}`);
  });

  it("cancels common factors across multiplied fractions inside a larger sum", () => {
    const document = buildDocument(String.raw`1 - \frac{1}{2} - \beta T_0 + \frac{\kappa}{2} \frac{v}{v_0 \kappa}`);
    const selectedNodeId = findNodeId(
      document,
      (expr) =>
        expr.kind === "multiply" &&
        expr.factors.some((factor) => factor.kind === "divide" && factor.numerator.kind === "symbol" && factor.numerator.name === String.raw`\kappa`),
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: selectedNodeId }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`1 - \frac{1}{2} - \beta T_0 + \frac{v}{2 v_0}`);
  });

  it("collapses nested multiplied fractions into a single visible fraction", () => {
    const document = buildDocument(String.raw`\frac{-\frac{a}{v_0} \frac{9}{10}}{c_v}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-\frac{9 a}{10 v_0 c_v}`);
  });

  it("cancels one factor against a positive integer power denominator", () => {
    const document = buildDocument(String.raw`v \frac{a}{v^2}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{a}{v}`);
  });

  it("cancels one denominator factor against a positive integer power numerator", () => {
    const document = buildDocument(String.raw`\frac{2 a \left(v - b\right)^{2}}{v^{2} b \left(v - b\right)}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{2 a \left(v - b\right)}{v^{2} b}`);
  });

  it("cancels an expanded grouped numerator factor against the denominator", () => {
    const document = buildDocument(String.raw`\frac{2 a \left(v - b\right)\left(v - b\right)}{v^{2} b \left(v - b\right)}`);
    const next = autoRewriteSelection(document, { kind: "single", nodeId: "n1" }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: "n1" }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{2 a \left(v - b\right)}{v^{2} b}`);
  });

  it("cancels one power factor in a selected negative equation term", () => {
    const document = buildDocument(String.raw`P v = v \frac{R T}{\left(v - b\right)} - v \frac{a}{v^{2}}`);
    const selectedNodeId = findNodeId(
      document,
      (expr) =>
        expr.kind === "multiply" &&
        expr.sign === -1 &&
        expr.factors.some((factor) => factor.kind === "divide" && factor.denominator.kind === "power"),
    );
    const next = autoRewriteSelection(document, { kind: "single", nodeId: selectedNodeId }, "cleanup");

    expect(canAutoRewrite(document, { kind: "single", nodeId: selectedNodeId }, "cleanup")).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`P v = v \frac{R T}{\left(v - b\right)} - \frac{a}{v}`,
    );
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
