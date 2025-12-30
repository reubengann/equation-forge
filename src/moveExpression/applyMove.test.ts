import { describe, expect, it } from "vitest";
import { findNodeByLatex, treefromLatex } from "../testHelpers";
import { applyMove } from "./applyMove";

describe("applyMove", () => {
  it("can commute terms in a sum", () => {
    const tree = treefromLatex("a + b");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMove({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("b + a");
  });

  it("If target slot is the same, does nothing", () => {
    const tree = treefromLatex("a + b");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMove({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 1,
    });

    expect(out).toBeNull();
  });

  it("going right", () => {
    const tree = treefromLatex("a + b + c");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMove({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 3,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("a + c + b");
  });

  it("can reorder subtraction as -f + e", () => {
    const tree = treefromLatex("e - f");
    const fId = findNodeByLatex(tree, "f");
    const negId = tree.parentById[fId];
    expect(negId).not.toBeNull();
    expect(tree.nodesById[negId!]?.op).toBe("Negate");

    const addId = tree.parentById[negId!];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMove({
      tree,
      selectedIds: [fId], // selecting f should drag the whole Negate(f)
      hoverId: addId!,
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("-f + e");
  });
});
