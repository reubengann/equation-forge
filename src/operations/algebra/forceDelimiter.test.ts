import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import { canForceDelimiter, forceDelimiter } from "./forceDelimiter";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("forceDelimiter", () => {
  it("wraps selected non-delimited node in parentheses (force)", () => {
    const tree = treefromLatex(String.raw`a = b c + e`);
    const bcId = findNodeId(tree, (n) => n.op === "InvisibleOperator" && n.latex === "b c");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: bcId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a = \left(b c\right) + e`);
  });

  it("removes selected parentheses delimiter (unforce)", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const delimiterId = findNodeId(tree, (n) => n.op === "Delimiter");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: delimiterId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + b + c`);
  });

  it("removes selected square-bracket list delimiter (unforce)", () => {
    const tree = treefromLatex(String.raw`a + \left[b + c\right]`);
    const listId = findNodeId(tree, (n) => n.op === "List");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: listId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + b + c`);
  });

  it("reports capability for any node selection", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const addId = tree.rootId;
    expect(canForceDelimiter(tree, { kind: "node", nodeId: addId })).toBe(true);
    expect(canForceDelimiter(tree, null)).toBe(false);
  });

  it("enables for contiguous multi-selection and wraps that subexpression", () => {
    const tree = treefromLatex(String.raw`a = b c e + \left[g h + i\right] f`);
    const bId = findNodeId(tree, (n) => n.latex === "b");
    const cId = findNodeId(tree, (n) => n.latex === "c");
    const sel = { kind: "multi", nodeIds: [bId, cId] } as const;

    expect(canForceDelimiter(tree, sel)).toBe(true);
    const result = forceDelimiter(tree, sel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`a = \left(b c\right) e + \left[g h + i\right] f`
    );
  });
});

