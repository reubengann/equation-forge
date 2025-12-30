import { describe, expect, it } from "vitest";
import { findNodeByLatex, treefromLatex } from "../testHelpers";
import { applyMove } from "./applyMove";

describe("applyMove", () => {
  it("can commute terms in a sum", () => {
    const tree = treefromLatex("a + b");
    const aId = findNodeByLatex(tree, "a");
    const addId = tree.parentById[aId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMove({
      tree,
      selectedIds: [aId],
      hoverId: addId!,
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("a + b");
  });
});
