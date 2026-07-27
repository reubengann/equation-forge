import { describe, expect, it } from "vitest";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import { buildPadSubstituteSuggestions } from "./substituteSuggestions";
import { parseLatexToExpr } from "./math/adapters/latex";
import { getSubstitutionSelection, substituteSelection } from "./math/rewrite/substitute";
import { exprToLatex } from "./math/adapters/latex/exprToLatex";
import { splitSign } from "./math/rewrite/algebraUtils";
import type { CompiledMathDocument } from "./math/compile/compileMathDocument";
import type { Expr } from "./math/ast";

function firstNodeIdMatching(document: CompiledMathDocument, predicate: (expr: Expr) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  if (!entry) throw new Error("Unable to find matching node.");
  return entry[0];
}

describe("buildPadSubstituteSuggestions", () => {
  it("suggests the RHS when a selected expression matches another equation LHS", () => {
    const selected = parseLatexToExpr(String.raw`F`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`F` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`F = m a`),
        },
      ],
    );

    expect(suggestions).toMatchObject([
      {
        equationId: "eq-1",
        label: "Equation 1",
        rhsLatex: "m a",
      },
    ]);
  });

  it("negates the suggestion when the selection is the negative LHS", () => {
    const selected = parseLatexToExpr(String.raw`-F`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`-F` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`F = m a`),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe("-m a");
  });

  it("suggests the RHS when selecting a symbol inside another equation", () => {
    const selected = parseLatexToExpr(String.raw`x`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`x` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`x = y + z`),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe("y + z");
  });

  it("suggests the RHS for a selected second-order partial at constant quantity", () => {
    const selected = parseLatexToExpr(
      String.raw`\left(\frac{\partial^{2}{g}}{\partial{P}^{2}}\right)_{T}`,
    );
    const suggestions = buildPadSubstituteSuggestions(
      {
        expr: selected,
        latex: String.raw`\left(\frac{\partial^{2}{g}}{\partial{P}^{2}}\right)_{T}`,
      },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(
            String.raw`\left(\frac{\partial^{2}{g}}{\partial{P}^{2}}\right)_{T} = -\kappa v`,
          ),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe(String.raw`-\kappa v`);
  });

  it("suggests the RHS for a compact selected second-order partial at constant quantity", () => {
    const selected = parseLatexToExpr(
      String.raw`\left(\frac{\partial{^2g}}{\partial{P^2}}\right)_{T}`,
    );
    const suggestions = buildPadSubstituteSuggestions(
      {
        expr: selected,
        latex: String.raw`\left(\frac{\partial{^2g}}{\partial{P^2}}\right)_{T}`,
      },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(
            String.raw`\left(\frac{\partial^{2}{g}}{\partial{P}^{2}}\right)_{T} = -\kappa v`,
          ),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe(String.raw`-\kappa v`);
  });

  it("negates every RHS term when selecting a negative symbol inside another equation", () => {
    const selected = parseLatexToExpr(String.raw`-x`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`-x` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`x = y + z`),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe("-y - z");
  });

  it("negates suggestions for a negative equation side selection", () => {
    const targetDocument = compileMathDocument(
      String.raw`S = -\left(\frac{\partial{F}}{\partial{T}}\right)_{A}`,
    );
    const selectedNodeId = firstNodeIdMatching(targetDocument, (expr) => {
      const signed = splitSign(expr);
      return signed.sign === -1 && signed.value.kind === "partial_at_const_quantity";
    });
    const selection = getSubstitutionSelection(targetDocument, { kind: "single", nodeId: selectedNodeId });

    const suggestions = buildPadSubstituteSuggestions(selection, [
      {
        equationId: "eq-1",
        label: "Equation 1",
        compiledDoc: compileMathDocument(
          String.raw`\left(\frac{\partial{F}}{\partial{T}}\right)_{A} = A \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}`,
        ),
      },
    ]);

    expect(suggestions[0]?.rhsLatex).toBe(String.raw`-A \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}`);
    expect(exprToLatex(suggestions[0]!.rhsExpr, false)).toBe(
      String.raw`-A \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}`,
    );
    const next = substituteSelection(
      targetDocument,
      { kind: "single", nodeId: selectedNodeId },
      suggestions[0]!.rhsExpr,
    );
    expect(next).not.toBeNull();
    expect(exprToLatex(next!, false)).toBe(String.raw`S = -A \frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}`);
  });

  it("suggests the signed RHS for matching inexact differentials", () => {
    const selected = parseLatexToExpr(String.raw`\mathrm{d'}{W}`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`\mathrm{d'}{W}` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`\mathrm{d'}{W} = -\mathscr{F} \,\mathrm{d}{L}`),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe(String.raw`-\mathscr{F} \,\mathrm{d}{L}`);
  });

  it("can still cancel signs for explicitly negative selected inexact differentials", () => {
    const selected = parseLatexToExpr(String.raw`-\mathrm{d'}{W}`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`-\mathrm{d'}{W}` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`\mathrm{d'}{W} = -\mathscr{F} \,\mathrm{d}{L}`),
        },
      ],
    );

    expect(suggestions[0]?.rhsLatex).toBe(String.raw`\mathscr{F} \,\mathrm{d}{L}`);
  });

  it("ignores non-matching equations", () => {
    const selected = parseLatexToExpr(String.raw`F`);
    const suggestions = buildPadSubstituteSuggestions(
      { expr: selected, latex: String.raw`F` },
      [
        {
          equationId: "eq-1",
          label: "Equation 1",
          compiledDoc: compileMathDocument(String.raw`N = m g`),
        },
      ],
    );

    expect(suggestions).toEqual([]);
  });
});
