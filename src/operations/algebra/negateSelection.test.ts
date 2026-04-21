import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import { negateSelection } from "./negateSelection";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("negateSelection", () => {
  it("negates both sides when no selection is provided", () => {
    const tree = treefromLatex(String.raw`a = -b`);
    const result = negateSelection(tree, null);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`-a = b`);
  });

  it("distributes selected outer negation into grouped additive term", () => {
    const tree = treefromLatex(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) - \left(\frac{a}{v_{1}} - \frac{a}{v_{2}}\right)`
    );
    const targetId = findNodeId(
      tree,
      (n) =>
        n.op === "Negate" &&
        n.latex.includes(String.raw`\frac{a}{v_{1}}`) &&
        n.latex.includes(String.raw`\frac{a}{v_{2}}`)
    );
    const result = negateSelection(tree, { kind: "node", nodeId: targetId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) + \left(-\frac{a}{v_{1}} + \frac{a}{v_{2}}\right)`
    );
  });

  it("factors -1 from a selected grouped additive delimiter", () => {
    const tree = treefromLatex(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) + \left(-\frac{a}{v_{1}} + \frac{a}{v_{2}}\right)`
    );
    const targetId = findNodeId(
      tree,
      (n) =>
        n.op === "Delimiter" &&
        n.latex.includes(String.raw`-\frac{a}{v_{1}}`) &&
        n.latex.includes(String.raw`+ \frac{a}{v_{2}}`)
    );
    const result = negateSelection(tree, { kind: "node", nodeId: targetId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`w_{T} = R T \ln\left(\frac{v_{2} - b}{v_{1} - b}\right) - \left(\frac{a}{v_{1}} - \frac{a}{v_{2}}\right)`
    );
  });
});

