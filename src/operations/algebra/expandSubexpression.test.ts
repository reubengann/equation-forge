import { describe, expect, it } from "vitest";
import { treefromLatex, findNodeId } from "../../testHelpers";
import { expandSubexpression } from "./expandSubexpression";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("expandSubexpression", () => {
  it("expands a(b+c)=1 when selecting the product node", () => {
    const tree = treefromLatex(String.raw`a\left(b+c\right)=1`);

    // Equal root: [lhs, rhs]; lhs should be the implicit product a(b+c).
    const equalChildren = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalChildren[0];
    expect(lhsId).toBeTruthy();

    const result = expandSubexpression(tree, lhsId!);
    expect(result).not.toBeNull();

    const latex = normalizeSpaces(result!.latexPlain);
    expect(latex).toBe("a b + a c = 1");
  });

  it("expands dot product bilinearly over addition", () => {
    const tree = treefromLatex(String.raw`\vec{a} \cdot (\vec{b} + \vec{c})`);
    const dotId = findNodeId(tree, (n) => n.op === "DotProduct");

    const result = expandSubexpression(tree, dotId);
    expect(result).not.toBeNull();

    const latex = normalizeSpaces(result!.latexPlain);
    expect(latex).toBe(
      String.raw`\vec{a} \cdot \vec{b} + \vec{a} \cdot \vec{c}`
    );
  });
});
