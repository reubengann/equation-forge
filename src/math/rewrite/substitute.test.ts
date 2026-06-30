import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { exprToLatex } from "../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { userFunction } from "../ast";
import {
  canSubstituteSelection,
  getReplaceableSymbols,
  getSubstitutionSelection,
  isValidSubstitutionReplacement,
  substituteAllMatchingExpression,
  substituteAllMatchingExpressions,
  substituteAllMatchingSelection,
  substituteSelection,
} from "./substitute";
import type { Expr } from "../ast";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

function replacement(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

function firstNodeIdMatching(document: CompiledMathDocument, predicate: (expr: Expr) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  if (!entry) throw new Error("Unable to find matching node.");
  return entry[0];
}

describe("substituteSelection", () => {
  it("replaces a single selected node", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const next = substituteSelection(document, { kind: "single", nodeId: "n4" }, replacement("z"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("a + z = c");
  });

  it("displays and replaces a contiguous multi-selection as one expression", () => {
    const document = buildDocument(String.raw`a+b+c`);
    const selection = { kind: "multi" as const, nodeIds: ["n2", "n3"], containerNodeId: "n1" };

    expect(getSubstitutionSelection(document, selection)?.latex).toBe("a + b");

    const next = substituteSelection(document, selection, replacement("z"));
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("z + c");
  });

  it("displays a multi-selection that targets the value inside a negated sum term", () => {
    const document = buildDocument(
      String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\ln\left(\frac{T}{T_0}\right)+R\ln v_0-R\ln v+s_0`,
    );
    const selection = { kind: "multi" as const, nodeIds: ["n4", "n11"], containerNodeId: "n3" };

    expect(getSubstitutionSelection(document, selection)?.latex).toBe(
      String.raw`c_P \ln\left(\frac{T}{T_0}\right) - R \ln\left(\frac{T}{T_0}\right)`,
    );
  });

  it("rejects non-contiguous multi-selections", () => {
    const document = buildDocument(String.raw`a+b+c`);
    const selection = { kind: "multi" as const, nodeIds: ["n2", "n4"], containerNodeId: "n1" };

    expect(canSubstituteSelection(document, selection)).toBe(false);
    expect(substituteSelection(document, selection, replacement("z"))).toBeNull();
  });

  it("rejects equation and inequality replacements", () => {
    expect(isValidSubstitutionReplacement(replacement("x=y"))).toBe(false);
    expect(isValidSubstitutionReplacement(replacement("x<y"))).toBe(false);

    const document = buildDocument(String.raw`a+b`);
    const next = substituteSelection(document, { kind: "single", nodeId: "n2" }, replacement("x=y"));
    expect(next).toBeNull();
  });

  it("wraps additive replacements inside products", () => {
    const document = buildDocument(String.raw`a b`);
    const next = substituteSelection(document, { kind: "single", nodeId: "n2" }, replacement("x+y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(x + y\right) b`);
  });

  it("renders numeric replacements in products without merging adjacent factors", () => {
    const document = buildDocument(String.raw`5 b c = e`);
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "symbol" && expr.name === "b");
    const next = substituteSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("5"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`5 \left(5\right) c = e`);
  });

  it("renders numeric replacements after user functions without merging with coefficients", () => {
    const document = compileMathDocumentFromExpr("source", {
      kind: "multiply",
      factors: [
        { kind: "number", value: 2 },
        userFunction("f", { kind: "symbol", name: "x" }),
        { kind: "symbol", name: "x" },
      ],
    });
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "user_function" && expr.name === "f");
    const next = substituteSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("5"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`2 \left(5\right) x`);
  });

  it("splices product replacements into integral integrand products", () => {
    const document = buildDocument(String.raw`w = \int_{P_i}^{P_f} P \,\mathrm{d}{v}`);
    const next = substituteSelection(
      document,
      { kind: "single", nodeId: "n8" },
      replacement(String.raw`-v_0\kappa\mathrm{d}{P}`),
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`w = \int_{P_i}^{P_f} P \left(-v_0 \kappa \,\mathrm{d}{P}\right)`);
  });

  it("preserves a negative reciprocal sign when merging a product replacement", () => {
    const document = buildDocument(
      String.raw`R T^{2} \frac{\partial}{\partial{T}} \frac{1}{\left(v + A\right)}`,
    );
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "partial_derivative_operator");
    const next = substituteSelection(
      document,
      { kind: "single", nodeId: selectedNodeId },
      replacement(String.raw`-\frac{1}{\left(v+A\right)^2}\dfrac{\partial A}{\partial T}`),
    );

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`-\frac{R T^{2}}{\left(v + A\right)^{2}} \frac{\partial{A}}{\partial{T}}`,
    );
  });

  it("wraps compound replacements as power bases", () => {
    const document = buildDocument(String.raw`a^2`);
    const next = substituteSelection(document, { kind: "single", nodeId: "n2" }, replacement("x+y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(x + y\right)^{2}`);
  });
});

describe("substituteAllMatchingSelection", () => {
  it("replaces a selected symbol everywhere in an expression", () => {
    const document = buildDocument(String.raw`E_x=-\left(\frac{\partial{\phi}}{\partial{x}}\right)`);
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "symbol" && expr.name === "x");

    const next = substituteAllMatchingSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`E_y = -\left(\frac{\partial{\phi}}{\partial{y}}\right)`,
    );
  });

  it("replaces matching symbols in cyclic derivative identities", () => {
    const document = buildDocument(
      String.raw`\left(\dfrac{\partial x}{\partial y}\right)_z \left(\dfrac{\partial y}{\partial z}\right)_x \left(\dfrac{\partial z}{\partial x}\right)_y = -1`,
    );
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "symbol" && expr.name === "x");

    const next = substituteAllMatchingSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("V"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\left(\frac{\partial{V}}{\partial{y}}\right)_{z} \left(\frac{\partial{y}}{\partial{z}}\right)_{V} \left(\frac{\partial{z}}{\partial{V}}\right)_{y} = -1`,
    );
  });

  it("replaces special-font symbol-equivalent expressions", () => {
    const document = buildDocument(String.raw`\mathscr{H}+\mathcal{H}+\mathscr{H}`);
    const selectedNodeId = firstNodeIdMatching(
      document,
      (expr) => expr.kind === "special_font" && expr.font === "script",
    );

    const next = substituteAllMatchingSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("K"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`K + \mathcal{H} + K`);
  });

  it("does not replace textual substrings inside symbol names", () => {
    const document = buildDocument(String.raw`x+x_0+\dot{x}`);
    const selectedNodeId = firstNodeIdMatching(document, (expr) => expr.kind === "symbol" && expr.name === "x");

    const next = substituteAllMatchingSelection(document, { kind: "single", nodeId: selectedNodeId }, replacement("y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`y + x_0 + \dot{y}`);
  });

});

describe("substituteAllMatchingExpression", () => {
  it("replaces all matches of an explicit target expression without a selection", () => {
    const document = buildDocument(String.raw`a+x+\frac{x}{x_0}`);

    const next = substituteAllMatchingExpression(document, replacement("x"), replacement("y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`a + y + \frac{y}{x_0}`);
  });

  it("replaces matching symbolic subscripts without replacing numeric subscripts", () => {
    const document = buildDocument(String.raw`E_x+x_0`);

    const next = substituteAllMatchingExpression(document, replacement("x"), replacement("y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`E_y + x_0`);
  });

  it("promotes negative replacement signs out of partial derivatives at constant quantity", () => {
    const document = buildDocument(
      String.raw`\left(\frac{\partial{M}}{\partial{y}}\right)_{x} = \left(\frac{\partial{N}}{\partial{x}}\right)_{y}`,
    );

    const next = substituteAllMatchingExpression(document, replacement("N"), replacement("-S"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`\left(\frac{\partial{M}}{\partial{y}}\right)_{x} = -\left(\frac{\partial{S}}{\partial{x}}\right)_{y}`,
    );
  });

  it("cancels derivative signs when a negative derivative quantity is already negated", () => {
    const document = buildDocument(String.raw`-\frac{\partial{N}}{\partial{x}}`);

    const next = substituteAllMatchingExpression(document, replacement("N"), replacement("-S"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\frac{\partial{S}}{\partial{x}}`);
  });
});

describe("getReplaceableSymbols", () => {
  it("discovers standalone symbols, derivative fields, special fonts, and symbolic subscripts", () => {
    const document = buildDocument(
      String.raw`E_x+\mathscr{H}+\left(\frac{\partial{F}}{\partial{V}}\right)_{T}+x_0`,
    );

    expect(getReplaceableSymbols(document).map((symbol) => symbol.latex)).toEqual([
      String.raw`\mathscr{H}`,
      "E_x",
      "F",
      "T",
      "V",
      "x",
      "x_0",
    ]);
  });

  it("discovers tagged user function names as replaceable symbols", () => {
    const document = compileMathDocumentFromExpr("source", {
      kind: "equation",
      sides: [
        userFunction("S", {
          kind: "multiply",
          factors: [
            { kind: "symbol", name: "V" },
            { kind: "symbol", name: "T" },
          ],
        }),
        { kind: "integral", lowerBound: { kind: "number", value: 0 }, upperBound: { kind: "symbol", name: "T" }, integrand: { kind: "symbol", name: "C_V" } },
      ],
    });

    expect(getReplaceableSymbols(document).map((symbol) => symbol.latex)).toEqual(["C_V", "S", "T", "V"]);
  });
});

describe("substituteAllMatchingExpressions", () => {
  it("applies swaps simultaneously without cascading", () => {
    const document = buildDocument(String.raw`T+V+T_V`);

    const next = substituteAllMatchingExpressions(document, [
      { target: replacement("T"), replacement: replacement("V") },
      { target: replacement("V"), replacement: replacement("T") },
    ]);

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe("V + T + T_T");
  });

  it("creates the paired thermodynamics identity with simultaneous symbol replacements", () => {
    const document = buildDocument(String.raw`P=-\left(\frac{\partial{F}}{\partial{V}}\right)_{T}`);

    const next = substituteAllMatchingExpressions(document, [
      { target: replacement("P"), replacement: replacement("S") },
      { target: replacement("V"), replacement: replacement("T") },
      { target: replacement("T"), replacement: replacement("V") },
    ]);

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(
      String.raw`S = -\left(\frac{\partial{F}}{\partial{T}}\right)_{V}`,
    );
  });

  it("renames tagged user function names during symbol replacement", () => {
    const document = compileMathDocumentFromExpr("source", {
      kind: "equation",
      sides: [
        userFunction("S", {
          kind: "multiply",
          factors: [
            { kind: "symbol", name: "V" },
            { kind: "symbol", name: "T" },
          ],
        }),
        userFunction("S", { kind: "symbol", name: "T" }),
      ],
    });

    const next = substituteAllMatchingExpression(document, replacement("S"), replacement("A"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`A\left(V T\right) = A\left(T\right)`);
  });
});
