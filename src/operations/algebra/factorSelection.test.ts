import { describe, expect, it } from "vitest";
import { treefromLatex } from "../../testHelpers";
import { factorSelection } from "./factorSelection";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("factorSelection", () => {
  it("factors a common multiplicative prefix out of a sum", () => {
    const tree = treefromLatex(String.raw`-\mu_{s} m g \cos\left(\theta\right) + m g \sin\left(\theta\right)`);
    const result = factorSelection(tree, { kind: "node", nodeId: tree.rootId });
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`m g \left(-\mu_{s} \cos\left(\theta\right) + \sin\left(\theta\right)\right)`
    );
  });

  it("factors common symbols out of a selected span within an Add", () => {
    const tree = treefromLatex(String.raw`a b + a c + d`);
    const addId = tree.rootId;
    const selection = { kind: "span", parentId: addId, op: "Add", start: 0, end: 1 } as const;
    const result = factorSelection(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a \left(b + c\right) + d`);
  });
});
