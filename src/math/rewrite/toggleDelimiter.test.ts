import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canToggleDelimiterSelection, toggleDelimiterSelection } from "./toggleDelimiter";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("toggleDelimiterSelection", () => {
  it("adds delimiters around a selected whole sum", () => {
    const document = buildDocument(String.raw`a+b`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n1" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)`);
  });

  it("adds delimiters around a selected single term", () => {
    const document = buildDocument(String.raw`a+b`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a\right) + b`);
  });

  it("removes delimiters around a product inside a product", () => {
    const document = buildDocument(String.raw`\left(a b\right)c`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a b c");
  });

  it("flattens a leading-negative product factor when removing delimiters inside an integral product", () => {
    const document = buildDocument(String.raw`w = \int_{P_i}^{P_f} P \left(-v_0 \kappa \mathrm{d}{P}\right)`);
    const groupedProductId = Object.entries(document.index.nodeById).find(
      ([, expr]) =>
        expr.kind === "display_group" &&
        expr.expression.kind === "multiply" &&
        expr.expression.factors[0]?.sign === -1,
    )?.[0];

    expect(groupedProductId).toBeDefined();
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: groupedProductId! });

    expect(next).not.toBeNull();
    const nextRhs = next!.kind === "equation" ? next!.sides[1] : null;
    expect(nextRhs?.kind).toBe("integral");
    const integrand = nextRhs?.kind === "integral" ? nextRhs.integrand : null;
    expect(integrand).toMatchObject({
      kind: "multiply",
      sign: -1,
      factors: [
        { kind: "symbol", name: "P" },
        { kind: "symbol", name: "v_0" },
        { kind: "symbol", name: "\\kappa" },
        { kind: "differential" },
      ],
    });
    expect(exprToLatex(next!, false)).toBe(
      String.raw`w = -\int_{P_i}^{P_f} P v_0 \kappa \,\mathrm{d}{P}`,
    );
  });

  it("does not remove delimiters around a sum inside a product", () => {
    const document = buildDocument(String.raw`\left(a+b\right)c`);

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(false);
    expect(toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBeNull();
  });

  it("removes delimiters around a single term inside a sum", () => {
    const document = buildDocument(String.raw`\left(a+\left(b\right)\right)`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n4" });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(a + b\right)`);
  });

  it("distributes a leading minus when removing delimiters around an additive group", () => {
    const document = buildDocument(String.raw`\frac{v}{v_0} - \left(1 + \beta \left(T - T_0\right)\right)`);
    const groupId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.kind === "display_group" && expr.sign === -1,
    )?.[0];
    expect(groupId).toBeDefined();

    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: groupId! });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{v}{v_0} - 1 - \beta \left(T - T_0\right)`);
  });

  it("preserves the sign when removing delimiters around a negated non-additive group", () => {
    const document = buildDocument(String.raw`\frac{-\left(\left(v + v_0\right)^{2}\right)}{2 v_0 \kappa}`);
    const groupId = Object.entries(document.index.nodeById).find(
      ([, expr]) =>
        expr.kind === "display_group" &&
        expr.sign === -1 &&
        expr.expression.kind === "power",
    )?.[0];
    expect(groupId).toBeDefined();

    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: groupId! });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{-\left(v + v_0\right)^{2}}{2 v_0 \kappa}`);
  });

  it("pushes a negative fraction sign out when removing delimiters around a product factor", () => {
    const document = buildDocument(
      String.raw`w = \left(-\frac{\kappa v_0}{2}\right) \left(P_f^{2} - P_i^{2}\right)`,
    );
    const groupId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.kind === "display_group" && expr.expression.kind === "divide",
    )?.[0];
    expect(groupId).toBeDefined();

    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: groupId! });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`w = -\frac{\kappa v_0}{2} \left(P_f^{2} - P_i^{2}\right)`,
    );
  });

  it("removes an enclosing delimiter when the selected node is inside it", () => {
    const document = buildDocument(
      String.raw`w = \left(-\frac{\kappa v_0}{2}\right) \left(P_f^{2} - P_i^{2}\right)`,
    );
    const fractionId = Object.entries(document.index.nodeById).find(
      ([, expr]) => expr.kind === "divide",
    )?.[0];
    expect(fractionId).toBeDefined();

    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: fractionId! });

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`w = -\frac{\kappa v_0}{2} \left(P_f^{2} - P_i^{2}\right)`,
    );
  });

  it("removes delimiters around a whole fraction numerator", () => {
    const document = buildDocument(String.raw`\frac{\left(1+\cos\left(2 x\right)\right)}{2}`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{1 + \cos\left(2 x\right)}{2}`);
  });

  it("removes delimiters around a whole equation side", () => {
    const document = buildDocument(
      String.raw`\left(P + \frac{a}{v^{2}}\right) = \frac{R T}{\left(v - b\right)}`,
    );
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`P + \frac{a}{v^{2}} = \frac{R T}{\left(v - b\right)}`);
  });

  it("removes delimiters around a whole inequality side", () => {
    const document = buildDocument(String.raw`\left(a + b\right) < c`);
    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: "n2" });

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: "n2" })).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + b < c");
  });

  it("adds delimiters around a limit body derivative", () => {
    const document = buildDocument(
      String.raw`\lim_{T\to0} \frac{\partial{\left(G_2 - G_1\right)}}{\partial{T}}`,
    );
    const derivativeId = Object.entries(document.index.nodeById).find(([, expr]) => expr.kind === "partial_derivative")?.[0];
    expect(derivativeId).toBeDefined();

    const next = toggleDelimiterSelection(document, { kind: "single", nodeId: derivativeId! });

    expect(canToggleDelimiterSelection(document, { kind: "single", nodeId: derivativeId! })).toBe(true);
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\lim_{T\to0} \left(\frac{\partial{\left(G_2 - G_1\right)}}{\partial{T}}\right)`,
    );
  });

  it("adds delimiters around contiguous selected additive terms", () => {
    const document = buildDocument(String.raw`a+b+c`);
    const next = toggleDelimiterSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n3", "n4"] },
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a + \left(b + c\right)`);
  });

  it("adds delimiters around contiguous selected multiplicative factors", () => {
    const document = buildDocument(String.raw`a b c`);
    const next = toggleDelimiterSelection(
      document,
      { kind: "multi", containerNodeId: "n1", nodeIds: ["n3", "n4"] },
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a \left(b c\right)`);
  });

  it("does not add delimiters around non-contiguous selected terms", () => {
    const document = buildDocument(String.raw`a+b+c`);

    expect(canToggleDelimiterSelection(document, { kind: "multi", containerNodeId: "n1", nodeIds: ["n2", "n4"] })).toBe(false);
    expect(toggleDelimiterSelection(document, { kind: "multi", containerNodeId: "n1", nodeIds: ["n2", "n4"] })).toBeNull();
  });
});
