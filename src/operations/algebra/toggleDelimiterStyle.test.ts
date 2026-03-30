import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import {
  canToggleDelimiterStyle,
  toggleDelimiterStyle,
} from "./toggleDelimiterStyle";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("toggleDelimiterStyle", () => {
  it("toggles selected parentheses delimiter into square brackets", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const delimiterId = findNodeId(tree, (n) => n.op === "Delimiter");
    const result = toggleDelimiterStyle(tree, {
      kind: "node",
      nodeId: delimiterId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + \left[b + c\right]`);
  });

  it("toggles selected square bracket list back into parentheses", () => {
    const tree = treefromLatex(String.raw`a + \left[b + c\right]`);
    const listId = findNodeId(tree, (n) => n.op === "List");
    const result = toggleDelimiterStyle(tree, {
      kind: "node",
      nodeId: listId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + \left(b + c\right)`);
  });

  it("reports capability only for node delimiter selections", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const delimiterId = findNodeId(tree, (n) => n.op === "Delimiter");
    const addId = tree.rootId;

    expect(canToggleDelimiterStyle(tree, { kind: "node", nodeId: delimiterId })).toBe(true);
    expect(canToggleDelimiterStyle(tree, { kind: "node", nodeId: addId })).toBe(false);
    expect(canToggleDelimiterStyle(tree, null)).toBe(false);
  });
});

