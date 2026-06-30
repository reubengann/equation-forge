import { describe, expect, it } from "vitest";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import { buildPadSubstituteSuggestions } from "./substituteSuggestions";
import { parseLatexToExpr } from "./math/adapters/latex";

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
