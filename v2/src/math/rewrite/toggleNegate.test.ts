import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { canToggleNegateSelection, toggleNegateSelection } from "./toggleNegate";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

describe("toggleNegateSelection", () => {
  it("pulls negation out of a selected delimiter", () => {
    const document = buildDocument(String.raw`\left(-a-b\right)`);
    const next = toggleNegateSelection(document, "n1");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`-\left(a + b\right)`);
  });

  it("pushes an outer negation into a selected delimiter", () => {
    const document = buildDocument(String.raw`-\left(a+b\right)`);
    const next = toggleNegateSelection(document, "n1");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(-a - b\right)`);
  });

  it("pushes an outer negation when the negation node is selected", () => {
    const document = buildDocument(String.raw`-\left(a+b\right)`);
    const next = toggleNegateSelection(document, "n1");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(-a - b\right)`);
  });

  it("pushes a negated product sign into a selected additive factor", () => {
    const document = buildDocument(
      String.raw`s=\left(c_P-R\right)\ln\left(\frac{T}{T_0}\right)-R\left(\ln v_0-\ln v\right)+s_0`,
    );
    const selectedNodeId = Object.entries(document.index.nodeById).find(
      ([nodeId, expr]) =>
        expr.kind === "display_group" &&
        expr.expression.kind === "add" &&
        expr.expression.terms.every((term) => {
          const value = term.kind === "negate" ? term.value : term;
          return value.kind === "call" && value.callee.kind === "symbol" && value.callee.name === "ln";
        }) &&
        document.index.nodeById[document.index.parentById[nodeId] ?? ""]?.kind === "multiply",
    )?.[0];

    expect(selectedNodeId).toBeDefined();
    const next = toggleNegateSelection(document, selectedNodeId!);

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`s = \left(c_P - R\right) \ln\left(\frac{T}{T_0}\right) + R \left(-\ln v_0  + \ln v \right) + s_0`,
    );
  });

  it("pulls negation out to the product term when toggling an additive factor in a sum", () => {
    const document = buildDocument(
      String.raw`u = a \left(T - T_0\right) + \frac{1}{2} b \left(T^{2} - T_0^{2}\right) + R \left(T_0 - T\right) + u_0`,
    );
    const next = toggleNegateSelection(document, "n27");

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`u = a \left(T - T_0\right) + \frac{1}{2} b \left(T^{2} - T_0^{2}\right) - R \left(-T_0 + T\right) + u_0`,
    );
  });

  it("rejects non-delimiter selections", () => {
    const document = buildDocument(String.raw`-a-b`);

    expect(canToggleNegateSelection(document, "n1")).toBe(false);
    expect(toggleNegateSelection(document, "n1")).toBeNull();
  });
});
