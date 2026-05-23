import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { exprToLatex } from "../adapters/latex";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import {
  canSubstituteSelection,
  getSubstitutionSelection,
  isValidSubstitutionReplacement,
  substituteSelection,
} from "./substitute";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex, { onError: "throw" });
  return compileMathDocumentFromExpr(latex, expr);
}

function replacement(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
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

  it("wraps compound replacements as power bases", () => {
    const document = buildDocument(String.raw`a^2`);
    const next = substituteSelection(document, { kind: "single", nodeId: "n2" }, replacement("x+y"));

    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`\left(x + y\right)^{2}`);
  });
});
