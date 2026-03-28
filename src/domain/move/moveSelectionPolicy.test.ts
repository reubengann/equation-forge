import { describe, expect, it } from "vitest";
import {
  hasVectorAncestor,
  isVectorNode,
  normalizeDragHandleId,
  normalizeSelectedIdsForMove,
} from "./moveSelectionPolicy";
import { treefromLatex, findNodeId, findNodeByLatex } from "../../testHelpers";

describe("moveSelectionPolicy", () => {
  it("promotes single factor to product in multiplicative mode when under Equal", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const productId = tree.parentById[aId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("does not promote when product contains a vector sibling", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);
    const mId = findNodeByLatex(tree, "m");
    const productId = tree.parentById[mId];
    if (!productId) {
      throw new Error("Expected product parent for m");
    }

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [mId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([mId]);
    const vectorSiblingId = (tree.childrenById[productId] ?? []).find(
      (id) => id !== mId
    );
    expect(
      isVectorNode(vectorSiblingId ? tree.nodesById[vectorSiblingId] : undefined)
    ).toBe(true);
  });

  it("does not promote when product contains an overdotted sibling", () => {
    const tree = treefromLatex(String.raw`m \ddot{x} = F_{g} \sin\left(\theta\right)`);
    const mId = findNodeByLatex(tree, "m");

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [mId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([mId]);
  });

  it("promotes single factor to product in additive mode when product is under Equal", () => {
    const tree = treefromLatex("a b = c");
    const bId = findNodeByLatex(tree, "b");
    const productId = tree.parentById[bId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [bId],
      mode: "additive",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("keeps explicit multi-factor selection in multiplicative mode", () => {
    const tree = treefromLatex("a b c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");
    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId, bId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([aId, bId]);
  });

  it("collapses factors to product in additive mode only when product is under Equal", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");
    const productId = tree.parentById[aId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId, bId],
      mode: "additive",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("keeps original factor when hovering within same product in multiplicative mode", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId],
      mode: "multiplicative",
      hoverId: bId,
    });

    expect(result).toEqual([aId]);
  });

  it("normalizes drag handle through wrappers (Negate/Subscript/Vector)", () => {
    const tree = treefromLatex(String.raw`-\vec{a}_{1}`);
    const aId = findNodeByLatex(tree, "a");
    const negateId = findNodeId(tree, (n) => n.op === "Negate");
    const overVectorId = findNodeId(
      tree,
      (n) => n.op === "Vector" || n.op === "OverVector"
    );
    const subscriptId = findNodeId(tree, (n) => n.op === "Subscript");

    expect(normalizeDragHandleId(tree, aId)).toBe(negateId);
    expect(normalizeDragHandleId(tree, overVectorId)).toBe(negateId);
    expect(normalizeDragHandleId(tree, subscriptId)).toBe(negateId);
  });

  it("detects vector ancestry", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);
    const vecAId = findNodeByLatex(tree, String.raw`\vec{a}`);

    expect(hasVectorAncestor(tree, vecAId)).toBe(true);
  });
});
